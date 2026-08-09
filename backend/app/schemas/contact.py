from pydantic import BaseModel, EmailStr
from typing import Optional

class ContactMessageCreate(BaseModel):
    name: str
    email: EmailStr
    message: str
    captcha_token: str
    honeypot: Optional[str] = None
