from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.security import require_role
from app.db.session import get_db
from app.models.counselor_profile import CounselorProfile
from app.models.user import User
from app.schemas.counselor import CounselorProfilePrivateResponse
from app.schemas.booking import BookingResponse
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/counselors/pending", response_model=list[CounselorProfilePrivateResponse])
async def list_pending_counselors(
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Admin endpoint to list all counselors pending verification."""
    result = await db.execute(
        select(CounselorProfile)
        .options(selectinload(CounselorProfile.user))
        .where(CounselorProfile.is_verified == False)
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

@router.get("/bookings", response_model=list[BookingResponse])
async def get_all_bookings(
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db)
):
    """Admin endpoint to view all bookings platform-wide."""
    from app.models.booking import Booking
    result = await db.execute(
        select(Booking)
        .options(selectinload(Booking.client), selectinload(Booking.counselor).selectinload(CounselorProfile.user))
    )
    bookings = result.scalars().all()
    return bookings

@router.get("/analytics")
async def get_analytics(
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db)
):
    """Admin endpoint to view platform analytics."""
    from sqlalchemy import func
    from app.models.booking import Booking
    from app.models.payment import Payment, PaymentStatus
    
    bookings_res = await db.execute(select(func.count(Booking.id)))
    total_bookings = bookings_res.scalar_one_or_none() or 0

    revenue_res = await db.execute(
        select(func.sum(Payment.amount))
        .where(Payment.status == PaymentStatus.paid)
    )
    total_revenue = revenue_res.scalar_one_or_none() or 0.0

    return {
        "total_bookings": total_bookings,
        "total_revenue": total_revenue
    }
