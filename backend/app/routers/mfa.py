import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from app.core.encryption import encrypt_token, decrypt_token
from app.core.rate_limit import limiter
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.mfa import new_secret, verify_totp, recovery_codes, recovery_hash

router = APIRouter(prefix="/auth/mfa", tags=["mfa"])


class VerifyMFA(BaseModel):
    code: str = Field(min_length=6, max_length=64)


async def locked_user(db, user):
    return (await db.execute(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True))).scalar_one()


@router.post("/enroll")
@limiter.limit("5/15minute")
async def enroll(request: Request, user=Depends(get_current_user), db=Depends(get_db)):
    if user.role.value == "client":
        raise HTTPException(403, "Staff only")
    user = await locked_user(db, user)
    if user.mfa_enabled:
        raise HTTPException(409, "MFA already enrolled")
    if not user.mfa_secret:
        user.mfa_secret = encrypt_token(new_secret())
        await db.commit()
    secret = decrypt_token(user.mfa_secret)
    return {"secret": secret, "uri": f"otpauth://totp/{quote('Alaga:' + user.email)}?secret={secret}&issuer=Alaga&digits=6&period=30"}


@router.post("/verify")
@limiter.limit("10/15minute")
async def verify(request: Request, data: VerifyMFA, user=Depends(get_current_user), db=Depends(get_db)):
    if user.role.value == "client":
        raise HTTPException(403, "Staff only")
    user = await locked_user(db, user)
    now = datetime.now(timezone.utc)
    locked = user.mfa_locked_until
    if locked and locked.tzinfo is None:
        locked = locked.replace(tzinfo=timezone.utc)
    if locked and locked > now:
        raise HTTPException(429, "MFA temporarily locked")
    if not user.mfa_secret:
        raise HTTPException(400, "Enroll an authenticator first")
    counter = verify_totp(decrypt_token(user.mfa_secret), data.code, user.mfa_last_counter)
    hashes = list(user.mfa_recovery_hashes or [])
    recovery = recovery_hash(data.code)
    matched = next((value for value in hashes if secrets.compare_digest(value, recovery)), None) if user.mfa_enabled else None
    if counter is None and matched is None:
        user.mfa_failed_attempts += 1
        if user.mfa_failed_attempts >= 5:
            user.mfa_locked_until = now + timedelta(minutes=15)
        await db.commit()
        raise HTTPException(400, "Invalid or already used verification code")
    codes = None
    if not user.mfa_enabled:
        codes, user.mfa_recovery_hashes = recovery_codes()
    if counter is not None:
        user.mfa_last_counter = counter
    if matched:
        hashes.remove(matched)
        user.mfa_recovery_hashes = hashes
    user.mfa_enabled = True
    user.mfa_failed_attempts = 0
    user.mfa_locked_until = None
    request.state.auth_session.mfa_verified = True
    await db.commit()
    return {"msg": "MFA verified", "recovery_codes": codes}
