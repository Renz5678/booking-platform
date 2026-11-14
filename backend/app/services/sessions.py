import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import select, update
from app.models.auth_session import AuthSession
from app.services.auth_service import create_access_token, create_refresh_token


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


async def issue_session(db, user_id, session=None, *, staff=False):
    if session is None:
        session = AuthSession(id=secrets.token_urlsafe(32), user_id=str(user_id),
                              expires_at=datetime.now(timezone.utc) + timedelta(days=7),
                              mfa_verified=False,
                              mfa_deadline=datetime.now(timezone.utc) + timedelta(minutes=10) if staff else None)
        db.add(session)
    claims = {"sub": str(user_id), "sid": session.id}
    access = create_access_token(claims)
    refresh = create_refresh_token({**claims, "jti": secrets.token_urlsafe(32)})
    session.refresh_hash = token_hash(refresh)
    await db.commit()
    return access, refresh


async def revoke_all(db, user_id):
    await db.execute(update(AuthSession).where(AuthSession.user_id == user_id).values(revoked=True))


async def load_session(db, session_id):
    session = (await db.execute(select(AuthSession).where(AuthSession.id == session_id).with_for_update())).scalar_one_or_none()
    if not session or session.revoked:
        raise HTTPException(status_code=401, detail="Session expired")
    expiry = session.expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if expiry <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    return session
