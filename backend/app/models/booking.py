import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String, Integer
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
    client_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    counselor_id = Column(String, ForeignKey("counselor_profiles.id", ondelete="CASCADE"), nullable=False)

    scheduled_start = Column(DateTime(timezone=True), nullable=False)
    scheduled_end = Column(DateTime(timezone=True), nullable=False)
    status = Column(
        Enum(BookingStatus, native_enum=False),
        default=BookingStatus.pending_payment,
        nullable=False,
    )

    schedule_version = Column(Integer, nullable=False, default=1)
    provisioning_status = Column(String, nullable=False, default="pending")
    client_calendar_event_id = Column(String, nullable=True)
    meeting_link = Column(String, nullable=True)
    google_calendar_event_id = Column(String, nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    client = relationship("User", back_populates="bookings")
    counselor = relationship("CounselorProfile", back_populates="bookings")
    payment = relationship("Payment", back_populates="booking", uselist=False)
    intake_form = relationship("IntakeForm", back_populates="booking", uselist=False)

    @property
    def client_name(self) -> str | None:
        if "client" in self.__dict__ and self.client:
            return self.client.full_name
        return None

    @property
    def counselor_name(self) -> str | None:
        if "counselor" in self.__dict__ and self.counselor:
            if "user" in self.counselor.__dict__ and self.counselor.user:
                return self.counselor.user.full_name
        return None

    @property
    def gcash_number(self) -> str | None:
        from app.config import settings
        return getattr(settings, "GCASH_NUMBER", "")

    @property
    def gcash_name(self) -> str | None:
        from app.config import settings
        return getattr(settings, "GCASH_NAME", "")
