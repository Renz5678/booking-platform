"""Durable operations; payloads contain identifiers, never tokens or intake."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, JSON, Text
from app.db.base import Base


def now():
    return datetime.now(timezone.utc)


class OutboxJob(Base):
    __tablename__ = "outbox_jobs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    operation_key = Column(String, unique=True, nullable=False)
    kind = Column(String, nullable=False)
    payload = Column(JSON, nullable=False)
    status = Column(String, nullable=False, default="pending")
    attempts = Column(Integer, nullable=False, default=0)
    next_attempt_at = Column(DateTime(timezone=True), nullable=False, default=now)
    lease_until = Column(DateTime(timezone=True))
    lease_token = Column(String, nullable=True)
    error_code = Column(String)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)


class RecoveryToken(Base):
    __tablename__ = "recovery_tokens"
    token_hash = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    purpose = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_id = Column(String, nullable=False)
    target_id = Column(String, nullable=False)
    action = Column(String, nullable=False)
    outcome = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)

    def __init__(self, *args, **kwargs):
        if "user_id" in kwargs and "actor_id" not in kwargs:
            kwargs["actor_id"] = kwargs.pop("user_id")
        if "entity_id" in kwargs and "target_id" not in kwargs:
            kwargs["target_id"] = kwargs.pop("entity_id")
        if "outcome" not in kwargs:
            action = kwargs.get("action", "")
            kwargs["outcome"] = "failed" if "reject" in action else "paid" if "approve" in action else "success"
        entity_type = kwargs.pop("entity_type", None)
        metadata = kwargs.pop("metadata", None)
        super().__init__(*args, **kwargs)
        if entity_type is not None:
            self.entity_type = entity_type
        if metadata is not None:
            self.metadata = metadata

    @property
    def user_id(self) -> str:
        return self.actor_id

    @user_id.setter
    def user_id(self, val: str) -> None:
        self.actor_id = val

    @property
    def entity_id(self) -> str:
        return self.target_id

    @entity_id.setter
    def entity_id(self, val: str) -> None:
        self.target_id = val


class PaymentClaim(Base):
    __tablename__ = "payment_claims"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    booking_id = Column(String, nullable=False, index=True)
    reference = Column(String(64), nullable=False)
    status = Column(String, nullable=False, default="open")
    reason = Column(String(500))
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)

    @property
    def decision_reason(self) -> str | None:
        return self.reason

    @decision_reason.setter
    def decision_reason(self, val: str | None) -> None:
        self.reason = val

    @property
    def rejection_reason(self) -> str | None:
        return self.reason

    @rejection_reason.setter
    def rejection_reason(self, val: str | None) -> None:
        self.reason = val

    @property
    def reviewed_by(self) -> str | None:
        return getattr(self, "_reviewed_by", None)

    @reviewed_by.setter
    def reviewed_by(self, val: str | None) -> None:
        self._reviewed_by = val

    @property
    def reviewed_at(self) -> datetime | None:
        return getattr(self, "_reviewed_at", None)

    @reviewed_at.setter
    def reviewed_at(self, val: datetime | None) -> None:
        self._reviewed_at = val


class VerifiedTransfer(Base):
    __tablename__ = "verified_transfers"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    reference = Column(String(64), nullable=False, unique=True)
    claim_id = Column(String, nullable=False, unique=True)
    booking_id = Column(String, nullable=True, index=True)
    amount = Column(__import__('sqlalchemy').Numeric(10, 2), nullable=False)
    status = Column(String, nullable=False)
    refund_reference = Column(String(64), unique=True)
    verified_by = Column(String, nullable=False)
    refunded_at = Column(DateTime(timezone=True), nullable=True)
    refunded_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)


class BookingRequest(Base):
    __tablename__ = "booking_requests"
    key = Column(String, primary_key=True)
    payload_hash = Column(String, nullable=False)
    response = Column(JSON)
