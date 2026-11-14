from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.email_validation import assert_non_disposable_email


class ContactMessageCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    message: str = Field(..., min_length=5, max_length=3000)
    captcha_token: str = Field(..., max_length=4096)
    honeypot: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return assert_non_disposable_email(v)
