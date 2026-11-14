import logging

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyCookie
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import settings
from app.db.session import get_db
from app.models.user import User
from app.services.auth_service import ALGORITHM, get_password_fingerprint

logger = logging.getLogger(__name__)

# APIKeyCookie reads the JWT from the "access_token" HttpOnly cookie.
# auto_error=False means FastAPI won't throw a 403 automatically —
# we raise our own 401 error for consistent error messaging.
cookie_scheme = APIKeyCookie(name="access_token", auto_error=False)


async def get_current_user(
    request: Request,
    token: str = Depends(cookie_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    FastAPI dependency that extracts and validates the JWT from the HttpOnly cookie,
    then loads and returns the corresponding User from the database.

    Raises HTTP 401 if:
      - No token is present in the cookie.
      - The token is expired, malformed, or has an invalid signature.
      - The user ID in the token does not exist in the database.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    try:
        # Decode and verify the JWT signature and expiry using our secret key.
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
        if payload.get("type") == "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
            )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
            )
    except JWTError:
        # Catches ExpiredSignatureError, InvalidSignatureError, DecodeError, etc.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )

    # Load the user from the database to ensure the account still exists and is active.
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email not verified",
        )
    token_pwd = payload.get("pwd")
    if token_pwd is not None and token_pwd != get_password_fingerprint(user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
    return user


def validate_upload_magic_bytes(content: bytes, content_type: str | None) -> bool:
    """Verify uploaded file header matches the declared PDF/JPEG/PNG MIME type."""
    if content_type == "application/pdf":
        return content.startswith(b"%PDF-")
    if content_type in ("image/jpeg", "image/jpg"):
        return content.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    return False


def require_role(allowed_roles: list[str]):
    """
    Dependency factory that enforces role-based access control (RBAC).

    Usage:
        @router.get("/admin-only", dependencies=[Depends(require_role(["admin"]))])

    Raises HTTP 403 if the authenticated user's role is not in `allowed_roles`.
    """

    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.value not in allowed_roles:
            logger.warning(
                "Access denied for user %s (role=%s) to a route requiring roles: %s",
                current_user.id,
                current_user.role.value,
                allowed_roles,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted",
            )
        return current_user

    return role_checker
