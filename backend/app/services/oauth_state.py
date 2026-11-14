import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import delete
from app.models.oauth_transaction import OAuthTransaction
from app.core.encryption import encrypt_token, decrypt_token


def digest(state):
    return hashlib.sha256(state.encode()).hexdigest()


def pkce_challenge(verifier):
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()


async def begin(db, session_id, user_id, purpose):
    state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    db.add(OAuthTransaction(state_hash=digest(state), session_id=session_id, user_id=user_id,
                           purpose=purpose, verifier=encrypt_token(verifier),
                           expires_at=datetime.now(timezone.utc) + timedelta(minutes=10)))
    await db.commit()
    return state, pkce_challenge(verifier)


async def consume(db, state, session_id, user_id, purpose):
    if not 20 <= len(state) <= 128:
        raise HTTPException(400, "Invalid OAuth transaction")
    # Atomic deletion with identity binding means even concurrent callbacks can consume only once.
    row = (await db.execute(delete(OAuthTransaction).where(
        OAuthTransaction.state_hash == digest(state), OAuthTransaction.session_id == session_id,
        OAuthTransaction.user_id == user_id, OAuthTransaction.purpose == purpose,
        OAuthTransaction.expires_at > datetime.now(timezone.utc),
    ).returning(OAuthTransaction.verifier))).scalar_one_or_none()
    await db.commit()
    if row is None:
        raise HTTPException(400, "OAuth transaction expired, consumed, or belongs to another session")
    return decrypt_token(row)
