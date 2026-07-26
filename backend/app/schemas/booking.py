from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.booking import BookingStatus


class BookingBase(BaseModel):
    counselor_id: str
    scheduled_start: datetime
    scheduled_end: datetime


class BookingCreate(BookingBase):
    intake_concern_category: str
    intake_notes: str | None = None


class BookingResponse(BookingBase):
    id: str
    client_id: str
    status: BookingStatus
    meeting_link: str | None = None
    created_at: datetime
    client_name: str | None = None
    counselor_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class IntakeFormResponse(BaseModel):
    id: str
    concern_category: str
    notes: str | None = None
    submitted_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class BookingCounselorResponse(BookingResponse):
    intake_form: IntakeFormResponse | None = None
