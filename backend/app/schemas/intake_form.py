from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class IntakeFormBase(BaseModel):
    concern_category: str
    notes: Optional[str] = None

class IntakeFormCreate(IntakeFormBase):
    booking_id: str

class IntakeFormResponse(IntakeFormBase):
    id: str
    booking_id: str
    submitted_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
