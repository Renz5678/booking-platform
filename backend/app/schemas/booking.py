from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.booking import BookingStatus
from app.schemas.payment import PaymentResponse


class BookingBase(BaseModel):
    counselor_id: str
    scheduled_start: datetime
    scheduled_end: datetime


class BookingCreate(BookingBase):
    intake_concern_category: str = Field(..., max_length=200)
    intake_notes: str | None = Field(default=None, max_length=2000)
    captcha_token: str
    honeypot: str | None = None


class BookingRescheduleRequest(BaseModel):
    new_scheduled_start: datetime
    new_scheduled_end: datetime


class BookingStatusUpdateRequest(BaseModel):
    """Request body for counselor to mark a session as completed or no_show."""
    status: Literal["completed", "no_show"]


class IntakeFormResponse(BaseModel):
    id: str
    concern_category: str
    notes: str | None = None
    submitted_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BookingResponse(BookingBase):
    id: str
    client_id: str
    status: BookingStatus
    provisioning_status: str = "pending"
    meeting_link: str | None = None
    created_at: datetime
    client_name: str | None = None
    counselor_name: str | None = None
    intake_form: IntakeFormResponse | None = None
    payment: PaymentResponse | None = None
    gcash_number: str | None = None
    gcash_name: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def safe_orm_extract(cls, data: Any) -> Any:
        if hasattr(data, "__dict__"):
            d = data.__dict__
            from datetime import timezone
            s_start = getattr(data, "scheduled_start", None)
            if s_start and s_start.tzinfo is None:
                s_start = s_start.replace(tzinfo=timezone.utc)
            s_end = getattr(data, "scheduled_end", None)
            if s_end and s_end.tzinfo is None:
                s_end = s_end.replace(tzinfo=timezone.utc)
            c_at = getattr(data, "created_at", None)
            if c_at and c_at.tzinfo is None:
                c_at = c_at.replace(tzinfo=timezone.utc)

            return {
                "id": str(getattr(data, "id", "")),
                "client_id": str(getattr(data, "client_id", "")),
                "counselor_id": str(getattr(data, "counselor_id", "")),
                "scheduled_start": s_start,
                "scheduled_end": s_end,
                "status": getattr(data, "status", None),
                "provisioning_status": getattr(data, "provisioning_status", "pending"),
                "meeting_link": getattr(data, "meeting_link", None),
                "created_at": c_at,
                "client_name": getattr(data, "client_name", None),
                "counselor_name": getattr(data, "counselor_name", None),
                "intake_form": d.get("intake_form"),
                "payment": d.get("payment"),
                "gcash_number": getattr(data, "gcash_number", None),
                "gcash_name": getattr(data, "gcash_name", None),
            }
        return data


class BookingCancelResponse(BaseModel):
    """Response body for a booking cancellation."""
    msg: str
    booking_id: str
    refund_issued: bool


class BookingCounselorResponse(BookingResponse):
    pass



class AdminBookingResponse(BookingResponse):
    intake_form: None = None

    @model_validator(mode="before")
    @classmethod
    def strip_intake(cls, data: Any) -> Any:
        values = BookingResponse.safe_orm_extract(data)
        return {**values, "intake_form": None}
