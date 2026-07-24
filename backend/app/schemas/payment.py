from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.payment import PaymentMethod, PaymentStatus


class PaymentBase(BaseModel):
    amount: float
    currency: str = "PHP"
    payment_method: PaymentMethod | None = None


class PaymentCreate(PaymentBase):
    booking_id: str
    provider: str = "simulated"


class PaymentResponse(PaymentBase):
    id: str
    booking_id: str
    provider: str
    provider_payment_id: str | None = None
    status: PaymentStatus
    created_at: datetime
    paid_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
