import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship

from app.db.base import Base


class IntakeForm(Base):
    __tablename__ = "intake_forms"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    booking_id = Column(String, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, unique=True)

    concern_category = Column(String, nullable=False)
    _notes = Column("notes", String, nullable=True)

    @property
    def notes(self) -> str | None:
        from app.core.encryption import decrypt_token
        return decrypt_token(self._notes) if self._notes else None

    @notes.setter
    def notes(self, value: str | None) -> None:
        from app.core.encryption import encrypt_token
        self._notes = encrypt_token(value) if value else None

    submitted_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    booking = relationship("Booking", back_populates="intake_form")

