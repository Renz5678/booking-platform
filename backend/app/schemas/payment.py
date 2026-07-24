from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from app.models.payment import PaymentStatus, PaymentMethod

class PaymentBase(BaseModel):
    amount: float
    currency: str = "PHP"
    payment_method: Optional[PaymentMethod] = None

class PaymentCreate(PaymentBase):
    booking_id: str
    provider: str = "simulated"

class PaymentResponse(PaymentBase):
    id: str
    booking_id: str
    provider: str
    provider_payment_id: Optional[str] = None
    status: PaymentStatus
    created_at: datetime
    paid_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)
