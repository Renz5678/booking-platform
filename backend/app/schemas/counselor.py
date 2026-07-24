from pydantic import BaseModel, Field, HttpUrl
from typing import List, Optional
from app.schemas.user import UserResponse

class CounselorProfileBase(BaseModel):
    bio: Optional[str] = None
    specialization_tags: List[str] = []
    credentials_url: Optional[HttpUrl] = None

class CounselorProfileCreate(CounselorProfileBase):
    pass

class CounselorProfileUpdate(CounselorProfileBase):
    pass

# Profile data returned to the public (clients browsing)
class CounselorProfilePublicResponse(BaseModel):
    id: str
    bio: Optional[str]
    specialization_tags: List[str]
    # We include user details like full_name to display the counselor's name
    user: UserResponse
    
    class Config:
        from_attributes = True

# Profile data returned to the counselor themselves or admins (includes private fields)
class CounselorProfilePrivateResponse(CounselorProfilePublicResponse):
    is_verified: bool
    is_active: bool
    credentials_url: Optional[HttpUrl]
    google_calendar_connected: bool
    
    class Config:
        from_attributes = True
