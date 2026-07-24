from sqlalchemy import Column, String, Boolean, ForeignKey
from sqlalchemy import Column, String, Boolean, ForeignKey, JSON
from sqlalchemy.orm import relationship
import uuid
from app.db.base import Base

class CounselorProfile(Base):
    __tablename__ = "counselor_profiles"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, unique=True)
    bio = Column(String, nullable=True)
    specialization_tags = Column(JSON, default=list)
    credentials_url = Column(String, nullable=True)
    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=False)
    google_calendar_connected = Column(Boolean, default=False)
    google_refresh_token = Column(String, nullable=True)
    google_calendar_id = Column(String, nullable=True)

    user = relationship("User", back_populates="counselor_profile")
    availabilities = relationship("Availability", back_populates="counselor")
    bookings = relationship("Booking", back_populates="counselor")
