import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Numeric, String
from sqlalchemy.orm import relationship

from app.db.base import Base


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    review = "review"
    refund_pending = "refund_pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"


class PaymentMethod(str, enum.Enum):
    gcash = "gcash"
    maya = "maya"
    card = "card"
    grab_pay = "grab_pay"


class Payment(Base):
    __tablename__ = "payments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    booking_id = Column(String, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, unique=True)

    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String, default="PHP", nullable=False)
    provider = Column(String, default="paymongo", nullable=False)
    provider_payment_id = Column(String, nullable=True)
    transaction_reference = Column(String(64), nullable=True, unique=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    review_deadline = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_reason = Column(String(500), nullable=True)
    refund_reference = Column(String(64), nullable=True, unique=True)
    refunded_at = Column(DateTime(timezone=True), nullable=True)

    status = Column(
        Enum(PaymentStatus, native_enum=False),
        default=PaymentStatus.pending,
        nullable=False,
    )
    payment_method = Column(Enum(PaymentMethod, native_enum=False), nullable=True)

    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    paid_at = Column(DateTime(timezone=True), nullable=True)

    booking = relationship("Booking", back_populates="payment")
