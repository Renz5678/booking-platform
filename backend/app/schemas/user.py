import logging
import re

from pydantic import BaseModel, EmailStr, Field, field_validator

# Use the module-level logger so validation errors can be traced if needed.
logger = logging.getLogger(__name__)


class UserCreate(BaseModel):
    """
    Schema for creating a new user account.

    Includes honeypot and CAPTCHA fields for bot protection.
    """

    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)

    # Honeypot field — bots often auto-fill hidden fields.
    # Real users will never see or fill this (the frontend hides it via CSS).
    # If populated, signup is silently discarded to avoid revealing the bot-detection strategy.
    website: str | None = None

    # CAPTCHA token from the frontend (e.g., reCAPTCHA v3 or hCaptcha).
    # Validated server-side in the auth router before the account is created.
    captcha_token: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """
        Enforce a strong password policy:
          - At least 8 characters
          - At least one uppercase letter
          - At least one lowercase letter
          - At least one digit
        """
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        return v


class UserLogin(BaseModel):
    """Schema for the user login request body."""

    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """
    Schema for returning a safe user object from the API.
    Note: password_hash is intentionally excluded from this response.
    """

    id: str
    email: EmailStr
    full_name: str
    role: str
    is_active: bool = True
    google_calendar_connected: bool = False

    class Config:
        from_attributes = True
