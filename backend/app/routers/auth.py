import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.rate_limit import limiter
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import RoleEnum, User
from app.schemas.user import UserCreate, UserLogin, UserResponse
from app.services.auth_service import (
    create_access_token,
    create_verification_token,
    get_password_hash,
    verify_captcha,
    verify_email_token,
    verify_password,
)
from app.services.email_service import send_verification_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


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
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        password_hash=hashed_password,
        full_name=user_data.full_name,
        role=RoleEnum.client,
        is_verified=False,
    )
    db.add(new_user)

    try:
        await db.commit()
        await db.refresh(new_user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Email already registered")

    # Generate a signed JWT token for email verification (expires in 24 hours)
    verification_token = create_verification_token(new_user.email)

    # Send the verification email asynchronously as a background task so the
    # signup response is returned immediately without waiting for the email to send.
    asyncio.create_task(send_verification_email(new_user.email, verification_token))

    return {"msg": "Signup successful. Please check your email to verify your account."}


@router.get("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    """Verify a user's email address using the token sent to them."""
    email = verify_email_token(token)
    if not email:
        raise HTTPException(
            status_code=400, detail="Invalid or expired verification token"
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_verified:
        return {"msg": "Email already verified"}

    user.is_verified = True
    await db.commit()

    return {"msg": "Email successfully verified"}


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

    if not user or not verify_password(login_data.password, user.password_hash):
        # Use a generic error message to prevent user enumeration attacks.
        # An attacker should not be able to distinguish between "wrong password"
        # and "email not found" from the response.
        logger.warning("Failed login attempt for email: %s", login_data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please verify your email before logging in",
        )

    # Issue token
    access_token = create_access_token(data={"sub": str(user.id)})

    # Set httpOnly cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=30 * 60,  # 30 minutes
    )

    return {"msg": "Login successful"}


@router.post("/logout")
async def logout(response: Response):
    """Logout by clearing the JWT cookie."""
    response.delete_cookie("access_token")
    return {"msg": "Logout successful"}


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Get the currently logged-in user's profile."""
    return current_user
