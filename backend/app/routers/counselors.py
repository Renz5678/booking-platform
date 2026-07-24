from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.counselor import (
    CounselorProfilePrivateResponse,
    CounselorProfilePublicResponse,
    CounselorProfileUpdate,
)
from app.services import counselor_service

router = APIRouter(prefix="/counselors", tags=["counselors"])


@router.get("", response_model=list[CounselorProfilePublicResponse])
async def list_active_counselors(db: AsyncSession = Depends(get_db)):
    """Public endpoint to list all active and verified counselors."""
    return await counselor_service.get_active_counselors(db)


@router.get("/{counselor_id}", response_model=CounselorProfilePublicResponse)
async def get_counselor(counselor_id: str, db: AsyncSession = Depends(get_db)):
    """Public endpoint to view a specific counselor's profile."""
    counselor = await counselor_service.get_counselor_by_id(db, counselor_id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor not found")

    # Only return if active and verified (unless an admin is viewing, but we keep this public for now)
    if not (counselor.is_verified and counselor.is_active):
        raise HTTPException(status_code=404, detail="Counselor not found")

    return counselor


@router.get("/me/profile", response_model=CounselorProfilePrivateResponse)
async def get_my_counselor_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["counselor"])),
):
    """Counselor-only endpoint to view their own complete profile, including private fields."""
    counselor = await counselor_service.get_counselor_by_user_id(db, current_user.id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")
    return counselor


@router.put("/me/profile", response_model=CounselorProfilePrivateResponse)
async def update_my_counselor_profile(
    update_data: CounselorProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["counselor"])),
):
    """Counselor-only endpoint to update their own profile."""
    counselor = await counselor_service.get_counselor_by_user_id(db, current_user.id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")

    updated_profile = await counselor_service.update_counselor_profile(
        db, counselor, update_data
    )
    return updated_profile
