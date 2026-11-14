from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class ContactMessageCreate(BaseModel):
    name: str = Field(..., max_length=100)
    email: EmailStr
    message: str = Field(..., max_length=2000)
    captcha_token: str
    honeypot: Optional[str] = None
    website: Optional[str] = None

