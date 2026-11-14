import asyncio
import logging
import secrets
import urllib.parse
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.routers.recovery import digest
from app.services.account_limits import account_limit

from app.config import settings
from app.core.encryption import encrypt_token
from app.core.rate_limit import limiter
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.counselor_profile import CounselorProfile
from app.models.user import RoleEnum, User
from app.schemas.user import UserCreate, UserLogin, UserResponse, AcceptInviteRequest, UserUpdateRequest, ChangePasswordRequest
from app.services.auth_service import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_password_hash,
    verify_captcha,
    verify_password,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from app.services.email_service import send_verification_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


class OTPVerify(BaseModel):
    email: str
    otp: str

@router.post("/signup", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/15minute")
async def signup(
    request: Request, user_data: UserCreate, db: AsyncSession = Depends(get_db)
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
    result = await db.execute(select(User).where(func.lower(User.email) == str(user_data.email).strip().lower()))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    otp = "".join(secrets.choice("0123456789") for _ in range(6))
    
    new_user = User(
        email=str(user_data.email).strip().lower(),
        password_hash=hashed_password,
        full_name=user_data.full_name,
        role=RoleEnum.client,
        is_verified=False,
        verification_otp=digest(otp),
        verification_otp_expires_at=datetime.now(timezone.utc) + timedelta(minutes=15)
    )
    db.add(new_user)
    await db.flush()
    from app.services.outbox import enqueue
    await enqueue(db, "signup:" + new_user.id, "otp_email", {"user_id": new_user.id, "encrypted_secret": encrypt_token(otp)})

    try:
        await db.commit()
        await db.refresh(new_user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Email already registered")

    # Send the verification email asynchronously
    # Delivery is persisted in the outbox transaction.

    return {"msg": "Signup successful. Please check your email for the OTP."}


@router.post("/verify-otp")
@limiter.limit("10/15minute")
async def verify_otp(request: Request, data: OTPVerify, db: AsyncSession = Depends(get_db)):
    """Verify a user's email address using the 6-digit OTP."""
    result = await db.execute(select(User).where(func.lower(User.email) == str(data.email).strip().lower()))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_verified:
        return {"msg": "Email already verified"}

    await account_limit("verify_otp", str(data.email), 5, 900)
    if not secrets.compare_digest(user.verification_otp or "", digest(data.otp)):
        raise HTTPException(status_code=400, detail="Invalid OTP")
        
    # Compare timezone-aware datetimes
    now = datetime.now(timezone.utc)
    # Convert naive to aware if necessary (SQLite sometimes drops tzinfo)
    expires_at = user.verification_otp_expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
        
    if not expires_at or expires_at < now:
        raise HTTPException(status_code=400, detail="OTP has expired")

    user.is_verified = True
    user.verification_otp = None
    user.verification_otp_expires_at = None
    await db.commit()

    return {"msg": "Email successfully verified"}


@router.post("/accept-invite")
@limiter.limit("10/hour")
async def accept_invite(request: Request, data: AcceptInviteRequest, db: AsyncSession = Depends(get_db)):
    """Accept counselor invite and set password."""
    result = await db.execute(select(User).where(func.lower(User.email) == str(data.email).strip().lower()))
    user = result.scalar_one_or_none()
    
    if not user or user.invite_token != data.token:
        raise HTTPException(status_code=400, detail="Invalid token or email")
        
    now = datetime.now(timezone.utc)
    expires_at = user.invite_token_expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
        
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
    result = await db.execute(select(User).where(func.lower(User.email) == str(login_data.email).strip().lower()))
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

    if not user.is_verified or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please verify your email before logging in",
        )

    # Issue token
    from app.services.sessions import issue_session
    access_token, refresh_token = await issue_session(db, user.id, staff=user.role != RoleEnum.client)

    samesite = getattr(settings, "COOKIE_SAMESITE", "lax").lower()
    is_production = getattr(settings, "FRONTEND_URL", "").startswith("https") or settings.ENVIRONMENT == "production"
    if samesite == "none":
        is_production = True

    # Set httpOnly cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=is_production,
        samesite=samesite,
        max_age=30 * 60,  # 30 minutes
        path="/",
    )
    
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_production,
        samesite=samesite,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )

    return {"msg": "Login successful", "mfa_required": user.role != RoleEnum.client,
            "mfa_enrollment_required": user.role != RoleEnum.client and not user.mfa_enabled}


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    import jwt
    from jwt import InvalidTokenError as JWTError
    from app.services.sessions import load_session
    try:
        claims = jwt.decode(request.cookies.get("refresh_token", ""), settings.JWT_SECRET, algorithms=["HS256"], issuer="alaga-api", audience="alaga-web", options={"require": ["exp", "sub", "iss", "aud"]})
        session = await load_session(db, claims.get("sid", ""))
        session.revoked = True
        await db.commit()
    except (JWTError, HTTPException):
        pass
    """Logout by clearing the JWT cookies."""
    samesite = getattr(settings, "COOKIE_SAMESITE", "lax").lower()
    is_production = getattr(settings, "FRONTEND_URL", "").startswith("https") or settings.ENVIRONMENT == "production"
    if samesite == "none":
        is_production = True

    response.delete_cookie(key="access_token", httponly=True, secure=is_production, samesite=samesite, path="/")
    response.delete_cookie(key="refresh_token", httponly=True, secure=is_production, samesite=samesite, path="/")
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

    try:
        import uuid
        user_uuid = uuid.UUID(str(user_id_str))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    result = await db.execute(select(User).where(User.id == str(user_uuid)))
    user = result.scalar_one_or_none()

    if not user or not user.is_verified or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    # Issue new tokens
    import jwt
    from app.services.sessions import load_session, issue_session, token_hash
    claims = jwt.decode(refresh_token, settings.JWT_SECRET, algorithms=["HS256"], issuer="alaga-api", audience="alaga-web", options={"require": ["exp", "sub", "iss", "aud"]})
    session = await load_session(db, claims.get("sid", ""))
    if session.user_id != str(user.id) or not secrets.compare_digest(session.refresh_hash, token_hash(refresh_token)):
        session.revoked = True
        await db.commit()
        raise HTTPException(status_code=401, detail="Refresh token reuse detected")
    new_access_token, new_refresh_token = await issue_session(db, user.id, session)

    samesite = getattr(settings, "COOKIE_SAMESITE", "lax").lower()
    is_production = getattr(settings, "FRONTEND_URL", "").startswith("https") or settings.ENVIRONMENT == "production"
    if samesite == "none":
        is_production = True

    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=is_production,
        samesite=samesite,
        max_age=30 * 60,
        path="/",
    )
    
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=is_production,
        samesite=samesite,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )

    return {"msg": "Tokens refreshed"}


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Get the currently logged-in user's profile."""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_me(
    update_data: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the authenticated user's display name."""
    current_user.full_name = update_data.full_name
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/change-password")
@limiter.limit("5/15minute")
async def change_password(
    request: Request,
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change the authenticated user's password after verifying the current one."""
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    from app.services.sessions import revoke_all
    await revoke_all(db, current_user.id)
    current_user.password_hash = get_password_hash(data.new_password)
    await db.commit()
    logger.info("Password changed for user %s", current_user.id)
    return {"msg": "Password changed successfully"}
