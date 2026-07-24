from datetime import datetime

from pydantic import BaseModel, ConfigDict


class IntakeFormBase(BaseModel):
    concern_category: str
    notes: str | None = None


class IntakeFormCreate(IntakeFormBase):
    booking_id: str


class IntakeFormResponse(IntakeFormBase):
    id: str
    booking_id: str
    submitted_at: datetime

    model_config = ConfigDict(from_attributes=True)
