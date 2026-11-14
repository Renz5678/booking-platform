from datetime import datetime, timedelta, timezone
import hashlib
import logging

from jose import JWTError, jwt
from passlib.context import CryptContext
import httpx

from app.config import settings

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def get_password_fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:12]


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


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_refresh_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload.get("sub")
    except JWTError:
        return None


async def verify_captcha(
    token: str | None, expected_action: str | None = None
) -> bool:
    """
    Verify the CAPTCHA token with Google reCAPTCHA v3 API.
    """
    if not token or not isinstance(token, str) or len(token) > 4096:
        return False

    if not settings.RECAPTCHA_SECRET_KEY:
        if settings.ENVIRONMENT == "production":
            logger.error("RECAPTCHA_SECRET_KEY is not set in production. Rejecting CAPTCHA.")
            return False
        logger.warning("RECAPTCHA_SECRET_KEY is not set. Skipping CAPTCHA verification (dev mode fallback).")
        return True

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                "https://www.google.com/recaptcha/api/siteverify",
                data={
                    "secret": settings.RECAPTCHA_SECRET_KEY,
                    "response": token
                }
            )
            result = response.json()
            if not result.get("success", False):
                return False
            if result.get("score", 0.0) < 0.5:
                return False
            if expected_action and result.get("action") and result.get("action") != expected_action:
                logger.warning(
                    "CAPTCHA action mismatch: expected=%s got=%s",
                    expected_action,
                    result.get("action"),
                )
                return False
            return True
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("CAPTCHA verification request failed: %s", exc)
        return False
