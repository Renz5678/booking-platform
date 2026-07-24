from sqlalchemy import Column, String, Enum, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import relationship
import enum
import uuid
from datetime import datetime, timezone
from app.db.base import Base

class PaymentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"

class PaymentMethod(str, enum.Enum):
    gcash = "gcash"
    maya = "maya"
    card = "card"

class Payment(Base):
    __tablename__ = "payments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    booking_id = Column(String, ForeignKey("bookings.id"), nullable=False, unique=True)
    
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String, default="PHP", nullable=False)
    provider = Column(String, default="paymongo", nullable=False)
    provider_payment_id = Column(String, nullable=True)
    
    status = Column(Enum(PaymentStatus, native_enum=False), default=PaymentStatus.pending, nullable=False)
    payment_method = Column(Enum(PaymentMethod, native_enum=False), nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    paid_at = Column(DateTime(timezone=True), nullable=True)

    booking = relationship("Booking", back_populates="payment")
