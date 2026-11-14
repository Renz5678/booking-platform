from datetime import datetime, timedelta, timezone

import jwt
from jwt import InvalidTokenError as JWTError
from passlib.context import CryptContext
import httpx
import logging

from app.config import settings

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7
VERIFICATION_TOKEN_EXPIRE_HOURS = 24


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if len(plain_password.encode("utf-8")) > 72:
        return False
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password exceeds bcrypt byte limit")
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode.update({"iss": "alaga-api", "aud": "alaga-web", "exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"iss": "alaga-api", "aud": "alaga-web", "exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_refresh_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM], issuer="alaga-api", audience="alaga-web", options={"require": ["exp", "sub", "iss", "aud"]})
        if payload.get("type") != "refresh":
            return None
        return payload.get("sub")
    except JWTError:
        return None


def create_verification_token(email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        hours=VERIFICATION_TOKEN_EXPIRE_HOURS
    )
    to_encode = {"iss": "alaga-api", "aud": "alaga-web", "sub": email, "type": "verification", "exp": expire}
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=ALGORITHM)


def verify_email_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM], issuer="alaga-api", audience="alaga-web", options={"require": ["exp", "sub", "iss", "aud"]})
        if payload.get("type") != "verification":
            return None
        email: str = payload.get("sub")
        return email
    except JWTError:
        return None


async def verify_captcha(token: str, action: str = "signup") -> bool:
    """
    Verify the CAPTCHA token with Google reCAPTCHA v3 API.
    Supports dev bypass in non-production environments and handles network failures gracefully.
    """
    if not token:
        return False

    dev_tokens = {"dummy", "dummy_token", "mock_captcha_token", "dev_bypass_token"}
    if settings.ENVIRONMENT in {"development", "test"} and token in dev_tokens:
        logger.info("Dev CAPTCHA bypass token accepted in %s environment.", settings.ENVIRONMENT)
        return True

    if not settings.RECAPTCHA_SECRET_KEY or settings.RECAPTCHA_SECRET_KEY == "REPLACE_WITH_RECAPTCHA_SECRET_KEY":
        return False

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                "https://www.google.com/recaptcha/api/siteverify",
                data={
                    "secret": settings.RECAPTCHA_SECRET_KEY,
                    "response": token
                }
            )
            if response.status_code != 200:
                logger.error("Google reCAPTCHA API returned HTTP %s", response.status_code)
                return False
            result = response.json()
            from urllib.parse import urlparse
            issued = datetime.fromisoformat(result.get("challenge_ts", "").replace("Z", "+00:00"))
            age = (datetime.now(timezone.utc) - issued).total_seconds()
            return bool(result.get("success") and result.get("score", 0) >= 0.5
                        and result.get("action") == action
                        and result.get("hostname") == urlparse(settings.FRONTEND_URL).hostname
                        and 0 <= age <= 120)
    except Exception as e:
        logger.error("Failed to verify CAPTCHA with Google API: %s", str(e))
        # In non-production, don't block development when offline/sandboxed
        return False
