import asyncio
import logging
import secrets
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.rate_limit import limiter
from app.core.security import get_current_user
from app.db.session import get_db
from app.config import settings
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

import urllib.parse
import httpx
from fastapi.responses import RedirectResponse
from app.core.encryption import encrypt_token
from app.models.counselor_profile import CounselorProfile

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

    # Send the verification email asynchronously
    asyncio.create_task(send_verification_email(new_user.email, otp))

    return {"msg": "Signup successful. Please check your email for the OTP."}


@router.post("/verify-otp")
async def verify_otp(data: OTPVerify, db: AsyncSession = Depends(get_db)):
    """Verify a user's email address using the 6-digit OTP."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_verified:
        return {"msg": "Email already verified"}

    if user.verification_otp != data.otp:
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


@router.get("/google/login")
async def google_login(current_user: User = Depends(get_current_user)):
    """Redirects the counselor to Google OAuth consent screen."""
    if current_user.role != RoleEnum.counselor:
        raise HTTPException(status_code=403, detail="Only counselors can connect Google Calendar")
        
    # We will use the backend URL for the redirect_uri to handle it directly
    # Or assume the frontend passes the callback, but here we'll assume the backend handles the callback directly if FRONTEND_URL/api/auth/google/callback proxies to us.
    # Actually, standard practice: BACKEND_URL/auth/google/callback
    # Since we don't have BACKEND_URL in settings, let's use FRONTEND_URL/api/auth/google/callback as the redirect_uri and assume the frontend proxies it to /auth/google/callback.
    redirect_uri = f"{settings.FRONTEND_URL}/api/auth/google/callback"
    
    # We can pass the user ID in the state parameter to know who is connecting
    state = str(current_user.id)
    
    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={settings.GOOGLE_CLIENT_ID}&"
        f"redirect_uri={urllib.parse.quote(redirect_uri)}&"
        "response_type=code&"
        "scope=https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly&"
        "access_type=offline&"
        "prompt=consent&"
        f"state={urllib.parse.quote(state)}"
    )
    return RedirectResponse(auth_url)


@router.get("/google/callback")
async def google_callback(code: str, state: str, db: AsyncSession = Depends(get_db)):
    """Handles the Google OAuth callback, exchanges code for tokens, and saves them."""
    redirect_uri = f"{settings.FRONTEND_URL}/api/auth/google/callback"
    user_id = state
    
    token_url = "https://oauth2.googleapis.com/token"
    payload = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(token_url, data=payload)
        if response.status_code != 200:
            logger.error("Failed to get Google tokens: %s", response.text)
            raise HTTPException(status_code=400, detail="Failed to authenticate with Google")
        
        data = response.json()
        refresh_token = data.get("refresh_token")
            
    # Save the refresh token to the counselor profile
    result = await db.execute(select(CounselorProfile).where(CounselorProfile.user_id == user_id))
    profile = result.scalar_one_or_none()
    
    if not profile:
        raise HTTPException(status_code=404, detail="Counselor profile not found")
        
    if refresh_token:
        profile.google_refresh_token = encrypt_token(refresh_token)
        
    # For MVP, we assume the primary calendar
    profile.google_calendar_id = "primary"
    profile.google_calendar_connected = True
    
    await db.commit()
    
    # Redirect to counselor dashboard schedule tab
    return RedirectResponse(f"{settings.FRONTEND_URL}/counselor/dashboard?tab=schedule")
