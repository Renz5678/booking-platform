from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext
import httpx
import logging

from app.config import settings

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
VERIFICATION_TOKEN_EXPIRE_HOURS = 24


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=ALGORITHM)
    return encoded_jwt


def create_verification_token(email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        hours=VERIFICATION_TOKEN_EXPIRE_HOURS
    )
    to_encode = {"sub": email, "type": "verification", "exp": expire}
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=ALGORITHM)


def verify_email_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
        if payload.get("type") != "verification":
            return None
        email: str = payload.get("sub")
        return email
    except JWTError:
        return None


async def verify_captcha(token: str) -> bool:
    """
    Verify the CAPTCHA token with Google reCAPTCHA v3 API.
    """
    if not token:
        return False
        
    if not settings.RECAPTCHA_SECRET_KEY:
        logger.warning("RECAPTCHA_SECRET_KEY is not set. Skipping CAPTCHA verification (dev mode fallback).")
        return True

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://www.google.com/recaptcha/api/siteverify",
            data={
                "secret": settings.RECAPTCHA_SECRET_KEY,
                "response": token
            }
        )
        result = response.json()
        return result.get("success", False) and result.get("score", 0.0) >= 0.5
