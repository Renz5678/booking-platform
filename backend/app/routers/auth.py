import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import settings
from app.core.rate_limit import limiter
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import RoleEnum, User
from app.schemas.user import (
    AcceptInviteRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    UserCreate,
    UserLogin,
    UserResponse,
    UserUpdateProfileRequest,
    _normalize_email,
)
from app.services.auth_service import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_password_fingerprint,
    get_password_hash,
    hash_reset_token,
    verify_captcha,
    verify_password,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from app.services.email_service import send_password_reset_email, send_verification_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

GENERIC_FORGOT_PASSWORD_MSG = (
    "If an account with that email exists, a password reset link has been sent."
)


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class OTPVerify(BaseModel):
    email: EmailStr
    otp: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return _normalize_email(v)

@router.post("/signup", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/15minute")
async def signup(
    request: Request,
    user_data: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Sign up a new client."""
    # Honeypot check
    if user_data.website:
        return {
            "msg": "Signup successful. Please check your email to verify your account."
        }

    # CAPTCHA check
    if not await verify_captcha(user_data.captcha_token):
        raise HTTPException(status_code=400, detail="Invalid CAPTCHA")

    # Check if user already exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    otp = "".join(secrets.choice("0123456789") for _ in range(6))
    
    new_user = User(
        email=user_data.email,
        password_hash=hashed_password,
        full_name=user_data.full_name,
        role=RoleEnum.client,
        is_verified=False,
        verification_otp=otp,
        verification_otp_expires_at=datetime.now(timezone.utc) + timedelta(minutes=15)
    )
    db.add(new_user)

    try:
        await db.commit()
        await db.refresh(new_user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Email already registered")

    # Send the verification email in the background
    background_tasks.add_task(send_verification_email, new_user.email, otp)

    return {"msg": "Signup successful. Please check your email for the OTP."}


@router.post("/verify-otp")
@limiter.limit("5/15minute")
async def verify_otp(request: Request, data: OTPVerify, db: AsyncSession = Depends(get_db)):
    """Verify a user's email address using the 6-digit OTP."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_verified:
        return {"msg": "Email already verified"}

    if not user.verification_otp or not secrets.compare_digest(user.verification_otp, data.otp):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= 5:
            user.verification_otp = None
            user.verification_otp_expires_at = None
        await db.commit()
        raise HTTPException(status_code=400, detail="Invalid OTP")

    now = datetime.now(timezone.utc)
    expires_at = _as_utc(user.verification_otp_expires_at)

    if not expires_at or expires_at < now:
        raise HTTPException(status_code=400, detail="OTP has expired")

    user.is_verified = True
    user.verification_otp = None
    user.verification_otp_expires_at = None
    user.failed_login_attempts = 0
    await db.commit()

    return {"msg": "Email successfully verified"}


@router.post("/accept-invite")
@limiter.limit("5/15minute")
async def accept_invite(
    request: Request, data: AcceptInviteRequest, db: AsyncSession = Depends(get_db)
):
    """Accept counselor invite and set password."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not user.invite_token or not secrets.compare_digest(user.invite_token, data.token):
        raise HTTPException(status_code=400, detail="Invalid token or email")

    now = datetime.now(timezone.utc)
    expires_at = _as_utc(user.invite_token_expires_at)

    if not expires_at or expires_at < now:
        raise HTTPException(status_code=400, detail="Invite token expired")
        
    user.password_hash = get_password_hash(data.password)
    user.is_verified = True
    user.invite_token = None
    user.invite_token_expires_at = None
    
    await db.commit()
    return {"msg": "Invite accepted. You can now log in."}


@router.post("/login")
@limiter.limit("5/15minute")
async def login(
    request: Request,
    response: Response,
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db),
):
    """Login and set a JWT cookie."""
    result = await db.execute(select(User).where(User.email == login_data.email))
    user = result.scalar_one_or_none()

    if user:
        locked_until = user.locked_until
        if locked_until and locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if locked_until and locked_until > datetime.now(timezone.utc):
            remaining = (locked_until - datetime.now(timezone.utc)).total_seconds() // 60
            raise HTTPException(
                status_code=429,
                detail=f"Account locked. Try again in {int(remaining) + 1} minutes."
            )

    if not user or not verify_password(login_data.password, user.password_hash):
        if user:
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= 5:
                user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            await db.commit()
            
        logger.warning("Failed login attempt for email: %s", login_data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    # Success: reset lock fields
    user.failed_login_attempts = 0
    user.locked_until = None
    await db.commit()

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please verify your email before logging in",
        )

    # Issue token
    pwd_fp = get_password_fingerprint(user.password_hash)
    access_token = create_access_token(data={"sub": str(user.id), "pwd": pwd_fp})
    refresh_token = create_refresh_token(data={"sub": str(user.id), "pwd": pwd_fp})

    is_production = getattr(settings, "FRONTEND_URL", "").startswith("https")

    # Set httpOnly cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=is_production,
        samesite="lax",
        max_age=30 * 60,  # 30 minutes
    )
    
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_production,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )

    return {"msg": "Login successful"}


@router.post("/logout")
async def logout(response: Response):
    """Logout by clearing the JWT cookie."""
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"msg": "Logout successful"}


@router.post("/refresh")
async def refresh_token(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Refresh the access and refresh tokens using the existing refresh token cookie."""
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing")

    user_id_str = decode_refresh_token(refresh_token)
    if not user_id_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    result = await db.execute(select(User).where(User.id == user_id_str))
    user = result.scalar_one_or_none()

    if not user or not user.is_verified:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    from jose import jwt as jose_jwt
    from app.services.auth_service import ALGORITHM

    refresh_payload = jose_jwt.decode(refresh_token, settings.JWT_SECRET, algorithms=[ALGORITHM])
    token_pwd = refresh_payload.get("pwd")
    if token_pwd is not None and token_pwd != get_password_fingerprint(user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    # Issue new tokens
    pwd_fp = get_password_fingerprint(user.password_hash)
    new_access_token = create_access_token(data={"sub": str(user.id), "pwd": pwd_fp})
    new_refresh_token = create_refresh_token(data={"sub": str(user.id), "pwd": pwd_fp})

    is_production = getattr(settings, "FRONTEND_URL", "").startswith("https")

    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=is_production,
        samesite="lax",
        max_age=30 * 60,
    )
    
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=is_production,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )

    return {"msg": "Tokens refreshed"}


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Get the currently logged-in user's profile."""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_users_me(
    payload: UserUpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the currently logged-in user's full name."""
    cleaned_name = payload.full_name.strip()
    if len(cleaned_name) < 2:
        raise HTTPException(status_code=400, detail="Full name must be at least 2 characters")
    current_user.full_name = cleaned_name
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change the password for the currently logged-in user."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect current password")
    current_user.password_hash = get_password_hash(payload.new_password)
    await db.commit()
    return {"msg": "Password updated successfully"}


@router.post("/forgot-password")
@limiter.limit("3/15minute")
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Request a password reset email without revealing whether the email exists."""
    if payload.website:
        return {"msg": GENERIC_FORGOT_PASSWORD_MSG}

    if not await verify_captcha(payload.captcha_token):
        raise HTTPException(status_code=400, detail="Invalid CAPTCHA")

    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if user and user.is_verified:
        now = datetime.now(timezone.utc)
        existing_expiry = _as_utc(user.reset_token_expires_at)
        # 2-minute per-account cooldown prevents inbox bombing across rotated IPs.
        if not existing_expiry or existing_expiry <= now + timedelta(minutes=13):
            raw_token = secrets.token_urlsafe(32)
            user.reset_token_hash = hash_reset_token(raw_token)
            user.reset_token_expires_at = now + timedelta(minutes=15)
            await db.commit()
            background_tasks.add_task(send_password_reset_email, user.email, raw_token)

    return {"msg": GENERIC_FORGOT_PASSWORD_MSG}


@router.post("/reset-password")
@limiter.limit("5/15minute")
async def reset_password(
    request: Request,
    response: Response,
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Reset password using a single-use token and invalidate existing sessions."""
    if payload.website:
        raise HTTPException(status_code=400, detail="Invalid or expired password reset token")

    if not await verify_captcha(payload.captcha_token):
        raise HTTPException(status_code=400, detail="Invalid CAPTCHA")

    token_hash = hash_reset_token(payload.token.strip())
    result = await db.execute(select(User).where(User.reset_token_hash == token_hash))
    user = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    expires_at = _as_utc(user.reset_token_expires_at) if user else None

    if (
        not user
        or not user.reset_token_hash
        or not secrets.compare_digest(user.reset_token_hash, token_hash)
        or not expires_at
        or expires_at < now
    ):
        raise HTTPException(status_code=400, detail="Invalid or expired password reset token")

    user.password_hash = get_password_hash(payload.new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    user.failed_login_attempts = 0
    user.locked_until = None
    await db.commit()

    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")

    return {"msg": "Password has been reset successfully. You can now log in."}



