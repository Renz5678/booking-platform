import uuid

from sqlalchemy import Boolean, Column, Date, ForeignKey, Integer, String, Time
from sqlalchemy.orm import relationship

from app.db.base import Base


class Availability(Base):
    __tablename__ = "availability"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    counselor_id = Column(String, ForeignKey("counselor_profiles.id", ondelete="CASCADE"), nullable=False)

    # 0 = Monday, 6 = Sunday. Only populated if is_recurring is True
    day_of_week = Column(Integer, nullable=True)
    # Only populated if is_recurring is False
    specific_date = Column(Date, nullable=True)

    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    is_recurring = Column(Boolean, default=False, nullable=False)

    counselor = relationship("CounselorProfile", back_populates="availabilities")
