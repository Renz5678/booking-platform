from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from app.models.booking import BookingStatus

class BookingBase(BaseModel):
    counselor_id: str
    scheduled_start: datetime
    scheduled_end: datetime

class BookingCreate(BookingBase):
    intake_concern_category: str
    intake_notes: Optional[str] = None

class BookingResponse(BookingBase):
    id: str
    client_id: str
    status: BookingStatus
    meeting_link: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
