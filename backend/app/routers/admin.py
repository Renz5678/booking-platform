from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.security import require_role
from app.db.session import get_db
from app.models.counselor_profile import CounselorProfile
from app.models.user import User
from app.schemas.counselor import CounselorProfilePublicResponse

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/counselors/pending", response_model=list[CounselorProfilePublicResponse])
async def list_pending_counselors(
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Admin endpoint to list all counselors pending verification."""
    result = await db.execute(
        select(CounselorProfile).where(CounselorProfile.is_verified == False)
    )
    return result.scalars().all()


@router.post("/counselors/{counselor_id}/verify", response_model=dict)
async def verify_counselor(
    counselor_id: str,
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Admin endpoint to verify and approve a counselor."""
    result = await db.execute(
        select(CounselorProfile).where(CounselorProfile.id == counselor_id)
    )
    counselor = result.scalar_one_or_none()
    
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor not found")
        
    counselor.is_verified = True
    counselor.is_active = True
    
    await db.commit()
    
    return {"msg": "Counselor approved and verified."}
