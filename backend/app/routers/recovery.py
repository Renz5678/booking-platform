import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select, delete, func
from app.db.session import get_db
from app.models.user import User
from app.models.operations import RecoveryToken, AuditEvent
from app.services.auth_service import verify_captcha, get_password_hash
from app.services.account_limits import account_limit
from app.services.sessions import revoke_all
from app.services.outbox import enqueue
from app.core.encryption import encrypt_token
from app.core.rate_limit import limiter
from app.schemas.user import PasswordInput

router = APIRouter(prefix="/auth", tags=["recovery"])
GENERIC = {"msg": "If the account is eligible, instructions will be emailed."}


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class RecoveryRequest(BaseModel):
    email: EmailStr
    captcha_token: str = Field(max_length=10000)


class ResetConfirmation(PasswordInput):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=8)

    @field_validator("new_password")
    @classmethod
    def strength(cls, value):
        from app.schemas.user import ChangePasswordRequest
        ChangePasswordRequest(current_password="unused", new_password=value)
        return value


async def request_email(db, email, purpose):
    identity = str(email).strip().lower()
    await account_limit(purpose, identity, 3, 3600)
    user = (await db.execute(select(User).where(func.lower(User.email) == identity).with_for_update())).scalar_one_or_none()
    if not user or not user.is_active or (purpose == "otp" and user.is_verified):
        return GENERIC
    if purpose == "reset" and not user.is_verified:
        return GENERIC
    if purpose == "otp":
        secret = "".join(secrets.choice("0123456789") for _ in range(6))
        user.verification_otp = digest(secret)
        user.verification_otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    else:
        secret = secrets.token_urlsafe(32)
        await db.execute(delete(RecoveryToken).where(RecoveryToken.user_id == user.id, RecoveryToken.purpose == "reset"))
        db.add(RecoveryToken(token_hash=digest(secret), user_id=user.id, purpose="reset", expires_at=datetime.now(timezone.utc) + timedelta(minutes=30)))
    await enqueue(db, f"{purpose}:{user.id}:{digest(secret)}", "otp_email" if purpose == "otp" else "reset_email", {"user_id": user.id, "encrypted_secret": encrypt_token(secret)})
    await db.commit()
    return GENERIC


@router.post("/password-reset/request")
@limiter.limit("5/15minute")
async def request_reset(request: Request, data: RecoveryRequest, db=Depends(get_db)):
    if not await verify_captcha(data.captcha_token, "recovery"):
        raise HTTPException(400, "Security verification failed")
    return await request_email(db, data.email, "reset")


@router.post("/resend-otp")
@limiter.limit("5/15minute")
async def resend_otp(request: Request, data: RecoveryRequest, db=Depends(get_db)):
    if not await verify_captcha(data.captcha_token, "recovery"):
        raise HTTPException(400, "Security verification failed")
    return await request_email(db, data.email, "otp")


@router.post("/password-reset/confirm")
@limiter.limit("10/15minute")
async def confirm_reset(request: Request, data: ResetConfirmation, db=Depends(get_db)):
    # Atomic token consumption prevents concurrent replay in PostgreSQL.
    result = await db.execute(delete(RecoveryToken).where(RecoveryToken.token_hash == digest(data.token), RecoveryToken.purpose == "reset", RecoveryToken.expires_at > datetime.now(timezone.utc)).returning(RecoveryToken.user_id))
    user_id = result.scalar_one_or_none()
    if not user_id:
        raise HTTPException(400, "Reset link invalid or expired")
    user = (await db.execute(select(User).where(User.id == user_id).with_for_update())).scalar_one()
    if not user.is_active:
        raise HTTPException(400, "Reset link invalid or expired")
    user.password_hash = get_password_hash(data.new_password)
    await revoke_all(db, user.id)
    db.add(AuditEvent(actor_id=user.id, target_id=user.id, action="password_reset", outcome="completed"))
    await db.commit()
    return {"msg": "Password reset. Sign in again."}
