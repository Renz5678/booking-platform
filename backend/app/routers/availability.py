from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.db.session import get_db
from app.schemas.availability import AvailabilityCreate, AvailabilityResponse
from app.services import availability_service, counselor_service
from app.core.security import get_current_user, require_role
from app.models.user import User

router = APIRouter(prefix="/availability", tags=["availability"])

@router.get("/{counselor_id}", response_model=List[AvailabilityResponse])
async def get_availability(counselor_id: str, db: AsyncSession = Depends(get_db)):
    """Public endpoint to view a counselor's availability blocks."""
    # First verify the counselor exists and is active
    counselor = await counselor_service.get_counselor_by_id(db, counselor_id)
    if not counselor or not (counselor.is_verified and counselor.is_active):
        raise HTTPException(status_code=404, detail="Counselor not found or inactive")
        
    return await availability_service.get_counselor_availability(db, counselor_id)

@router.get("/me/blocks", response_model=List[AvailabilityResponse])
async def get_my_availability(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["counselor"]))
):
    """Counselor-only endpoint to view their own availability blocks."""
    counselor = await counselor_service.get_counselor_by_user_id(db, current_user.id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")
        
    return await availability_service.get_counselor_availability(db, counselor.id)

@router.post("/me/blocks", response_model=AvailabilityResponse, status_code=status.HTTP_201_CREATED)
async def create_my_availability(
    avail_data: AvailabilityCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["counselor"]))
):
    """Counselor-only endpoint to add a new availability block."""
    counselor = await counselor_service.get_counselor_by_user_id(db, current_user.id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")
        
    return await availability_service.add_availability_block(db, counselor.id, avail_data)

@router.delete("/me/blocks/{availability_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_availability(
    availability_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["counselor"]))
):
    """Counselor-only endpoint to remove an availability block."""
    counselor = await counselor_service.get_counselor_by_user_id(db, current_user.id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")
        
    success = await availability_service.remove_availability_block(db, counselor.id, availability_id)
    if not success:
        raise HTTPException(status_code=404, detail="Availability block not found")
    return None
