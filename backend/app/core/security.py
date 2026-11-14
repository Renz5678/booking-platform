import logging

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyCookie
import jwt
from jwt import InvalidTokenError as JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import settings
from app.db.session import get_db
from app.models.user import User
from app.services.auth_service import ALGORITHM

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
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM], issuer="alaga-api", audience="alaga-web", options={"require": ["exp", "sub", "iss", "aud"]})
        user_id: str = payload.get("sub")
        if payload.get("type") != "access" or not isinstance(user_id, str):
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
    from app.services.sessions import load_session
    session = await load_session(db, payload.get("sid", ""))
    if session.user_id != str(user.id) or not user.is_verified or not user.is_active:
        raise HTTPException(status_code=401, detail="Account unavailable")
    request.state.auth_session = session
    if user.role.value != "client" and not session.mfa_verified:
        from datetime import datetime, timezone
        deadline = session.mfa_deadline
        if deadline and deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        if not deadline or deadline <= datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="MFA challenge expired; sign in again")
        if request.url.path not in {"/auth/mfa/enroll", "/auth/mfa/verify"}:
            raise HTTPException(status_code=403, detail="Staff MFA verification required")
    if user.role.value == "counselor" and not request.url.path.startswith(("/counselors/me", "/calendar/", "/auth/")):
        from app.models.counselor_profile import CounselorProfile
        profile = (await db.execute(select(CounselorProfile).where(CounselorProfile.user_id == user.id))).scalar_one_or_none()
        if not profile or not profile.is_active or not profile.is_verified:
            raise HTTPException(status_code=403, detail="Counselor is not active")
    return user


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
