import logging
import urllib.parse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import settings
from app.core.encryption import encrypt_token
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.counselor_profile import CounselorProfile
from app.models.user import RoleEnum, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/google/login")
async def google_login(current_user: User = Depends(get_current_user)):
    """Redirects the counselor to Google OAuth consent screen."""
    if current_user.role != RoleEnum.counselor:
        raise HTTPException(status_code=403, detail="Only counselors can connect Google Calendar")
        
    redirect_uri = f"{settings.FRONTEND_URL}/api/auth/google/callback"
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


@router.get("/google/client/login")
async def google_client_login(current_user: User = Depends(get_current_user)):
    """Redirects the client to Google OAuth consent screen to connect their calendar."""
    if current_user.role != RoleEnum.client:
        raise HTTPException(status_code=403, detail="Only clients can use this endpoint")

    redirect_uri = f"{settings.FRONTEND_URL}/api/auth/google/client/callback"
    state = str(current_user.id)

    auth_url = (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={settings.GOOGLE_CLIENT_ID}&"
        f"redirect_uri={urllib.parse.quote(redirect_uri)}&"
        "response_type=code&"
        "scope=https://www.googleapis.com/auth/calendar.events&"
        "access_type=offline&"
        "prompt=consent&"
        f"state={urllib.parse.quote(state)}"
    )
    return RedirectResponse(auth_url)


@router.get("/google/client/callback")
async def google_client_callback(code: str, state: str, db: AsyncSession = Depends(get_db)):
    """Handles the Google OAuth callback for clients, saves their refresh token."""
    redirect_uri = f"{settings.FRONTEND_URL}/api/auth/google/client/callback"
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
            logger.error("Failed to get Google tokens for client: %s", response.text)
            raise HTTPException(status_code=400, detail="Failed to authenticate with Google")

        data = response.json()
        refresh_token = data.get("refresh_token")

    # Save the refresh token directly on the User record
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if refresh_token:
        user.google_refresh_token = encrypt_token(refresh_token)

    user.google_calendar_connected = True
    await db.commit()

    # Redirect back to client dashboard
    return RedirectResponse(f"{settings.FRONTEND_URL}/dashboard?calendar=connected")
