import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import relationship

from app.db.base import Base


class BookingStatus(str, enum.Enum):
    pending_payment = "pending_payment"
    confirmed = "confirmed"
    cancelled = "cancelled"
    completed = "completed"
    no_show = "no_show"


class Booking(Base):
    """
    Represents a counseling session booking.
    Handles the lifecycle of a session (pending_payment, confirmed, cancelled, completed).
    Connects a client (User) with a CounselorProfile and includes an IntakeForm.
    """

    __tablename__ = "bookings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id = Column(String, ForeignKey("users.id"), nullable=False)
    counselor_id = Column(String, ForeignKey("counselor_profiles.id"), nullable=False)

    scheduled_start = Column(DateTime(timezone=True), nullable=False)
    scheduled_end = Column(DateTime(timezone=True), nullable=False)
    status = Column(
        Enum(BookingStatus, native_enum=False),
        default=BookingStatus.pending_payment,
        nullable=False,
    )

    meeting_link = Column(String, nullable=True)
    google_calendar_event_id = Column(String, nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    client = relationship("User", back_populates="bookings")
    counselor = relationship("CounselorProfile", back_populates="bookings")
    payment = relationship("Payment", back_populates="booking", uselist=False)
    intake_form = relationship("IntakeForm", back_populates="booking", uselist=False)
