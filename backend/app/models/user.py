import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Enum, String, Text, Integer
from sqlalchemy.orm import relationship

from app.db.base import Base


class RoleEnum(str, enum.Enum):
    client = "client"
    counselor = "counselor"
    admin = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    role = Column(
        Enum(RoleEnum, native_enum=False), default=RoleEnum.client, nullable=False
    )
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    verification_otp = Column(String, nullable=True)
    verification_otp_expires_at = Column(DateTime(timezone=True), nullable=True)
    google_refresh_token = Column(Text, nullable=True)
    google_calendar_connected = Column(Boolean, default=False, nullable=False)
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    invite_token = Column(String, nullable=True)
    invite_token_expires_at = Column(DateTime(timezone=True), nullable=True)

    counselor_profile = relationship(
        "CounselorProfile", back_populates="user", uselist=False
    )
    bookings = relationship("Booking", back_populates="client")
