from pydantic import BaseModel, HttpUrl

from app.schemas.user import UserResponse


class CounselorProfileBase(BaseModel):
    bio: str | None = None
    photo_url: HttpUrl | str | None = None
    specialization_tags: list[str] = []
    credentials_url: HttpUrl | str | None = None


class CounselorProfileCreate(CounselorProfileBase):
    pass


class CounselorProfileUpdate(CounselorProfileBase):
    pass


# Profile data returned to the public (clients browsing)
class CounselorProfilePublicResponse(BaseModel):
    id: str
    bio: str | None
    photo_url: str | None
    specialization_tags: list[str]
    # We include user details like full_name to display the counselor's name
    user: UserResponse

    class Config:
        from_attributes = True


# Profile data returned to the counselor themselves or admins (includes private fields)
class CounselorProfilePrivateResponse(CounselorProfilePublicResponse):
    is_verified: bool
    is_active: bool
    credentials_url: str | None
    google_calendar_connected: bool

    class Config:
        from_attributes = True
