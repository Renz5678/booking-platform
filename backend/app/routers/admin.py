import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.security import require_role
from app.db.session import get_db
from app.models.booking import Booking, BookingStatus
from app.models.counselor_profile import CounselorProfile
from app.models.payment import Payment, PaymentStatus
from app.models.user import User
from app.models.content import SiteContent
from app.schemas.booking import BookingResponse
from app.schemas.content import ContentResponse, ContentUpdate
from app.schemas.counselor import CounselorProfilePrivateResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Counselor Management
# ---------------------------------------------------------------------------


@router.get("/counselors/pending", response_model=list[CounselorProfilePrivateResponse])
async def list_pending_counselors(
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Admin: List all counselors pending verification."""
    result = await db.execute(
        select(CounselorProfile)
        .options(selectinload(CounselorProfile.user))
        .where(CounselorProfile.is_verified == False)  # noqa: E712
    )
    return result.scalars().all()


@router.post("/counselors/{counselor_id}/verify", response_model=dict)
async def verify_counselor(
    counselor_id: str,
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Approve and verify a counselor application."""
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


@router.post("/counselors/{counselor_id}/reject", response_model=dict)
async def reject_counselor(
    counselor_id: str,
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
    reason: str = Query(default="", description="Optional rejection reason to log."),
):
    """
    Admin: Reject a counselor application.
    Sets is_verified=False and is_active=False.
    """
    result = await db.execute(
        select(CounselorProfile)
        .options(selectinload(CounselorProfile.user))
        .where(CounselorProfile.id == counselor_id)
    )
    counselor = result.scalar_one_or_none()

    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor not found")

    counselor.is_verified = False
    counselor.is_active = False
    await db.commit()

    logger.info(
        "Admin %s rejected counselor %s. Reason: %s",
        current_user.id,
        counselor_id,
        reason or "No reason provided",
    )

    return {"msg": "Counselor application rejected.", "counselor_id": counselor_id}


@router.post("/counselors/{counselor_id}/deactivate", response_model=dict)
async def deactivate_counselor(
    counselor_id: str,
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin: Deactivate an already-verified counselor (e.g., due to policy violation).
    Sets is_active=False without removing verification status.
    """
    result = await db.execute(
        select(CounselorProfile).where(CounselorProfile.id == counselor_id)
    )
    counselor = result.scalar_one_or_none()

    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor not found")

    counselor.is_active = False
    await db.commit()

    logger.info("Admin %s deactivated counselor %s.", current_user.id, counselor_id)

    return {"msg": "Counselor deactivated.", "counselor_id": counselor_id}


# ---------------------------------------------------------------------------
# Booking Management
# ---------------------------------------------------------------------------


@router.get("/bookings", response_model=list[BookingResponse])
async def get_all_bookings(
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
    booking_status: BookingStatus | None = Query(default=None, alias="status"),
    counselor_id: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
):
    """
    Admin: View all bookings platform-wide with optional filters.

    Query params:
    - status: Filter by booking status (pending_payment, confirmed, cancelled, completed, no_show)
    - counselor_id: Filter by counselor profile ID
    - date_from: Filter bookings on or after this date (YYYY-MM-DD)
    - date_to: Filter bookings on or before this date (YYYY-MM-DD)
    """
    query = (
        select(Booking)
        .options(
            selectinload(Booking.client),
            selectinload(Booking.counselor).selectinload(CounselorProfile.user),
        )
        .order_by(Booking.scheduled_start.desc())
    )

    if booking_status is not None:
        query = query.where(Booking.status == booking_status)
    if counselor_id is not None:
        query = query.where(Booking.counselor_id == counselor_id)
    if date_from is not None:
        query = query.where(Booking.scheduled_start >= date_from)
    if date_to is not None:
        query = query.where(Booking.scheduled_start <= date_to)

    result = await db.execute(query)
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------


@router.get("/analytics")
async def get_analytics(
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin: Platform analytics with totals, status breakdown, and per-counselor stats.
    """
    from sqlalchemy import func

    # --- Overall totals ---
    bookings_res = await db.execute(select(func.count(Booking.id)))
    total_bookings = bookings_res.scalar_one_or_none() or 0

    revenue_res = await db.execute(
        select(func.sum(Payment.amount)).where(Payment.status == PaymentStatus.paid)
    )
    total_revenue = float(revenue_res.scalar_one_or_none() or 0.0)

    # --- Breakdown by status ---
    status_res = await db.execute(
        select(Booking.status, func.count(Booking.id)).group_by(Booking.status)
    )
    status_breakdown = {row[0].value: row[1] for row in status_res.all()}

    # --- Per-counselor stats ---
    counselor_res = await db.execute(
        select(
            CounselorProfile.id,
            func.count(Booking.id).label("total_sessions"),
            func.sum(Payment.amount).label("total_revenue"),
        )
        .outerjoin(Booking, Booking.counselor_id == CounselorProfile.id)
        .outerjoin(Payment, Payment.booking_id == Booking.id)
        .group_by(CounselorProfile.id)
    )
    per_counselor = [
        {
            "counselor_id": row[0],
            "total_sessions": row[1] or 0,
            "total_revenue": float(row[2] or 0.0),
        }
        for row in counselor_res.all()
    ]

    # --- Completion rate ---
    completed = status_breakdown.get("completed", 0)
    cancelled = status_breakdown.get("cancelled", 0)
    no_show = status_breakdown.get("no_show", 0)
    confirmed = status_breakdown.get("confirmed", 0)
    total_resolved = completed + cancelled + no_show + confirmed
    completion_rate = round(completed / total_resolved * 100, 1) if total_resolved > 0 else 0.0

    return {
        "total_bookings": total_bookings,
        "total_revenue": total_revenue,
        "status_breakdown": status_breakdown,
        "completion_rate_percent": completion_rate,
        "per_counselor_stats": per_counselor,
    }


# ---------------------------------------------------------------------------
# Content Management
# ---------------------------------------------------------------------------


@router.get("/content", response_model=list[ContentResponse])
async def get_all_content(db: AsyncSession = Depends(get_db)):
    """Admin: Get all dynamic site content. (Can also be public)"""
    result = await db.execute(select(SiteContent))
    content_list = result.scalars().all()
    
    # Return as strings for updated_at formatting
    return [
        ContentResponse(
            key=c.key, 
            value=c.value, 
            updated_at=c.updated_at.isoformat() if c.updated_at else None
        )
        for c in content_list
    ]


@router.put("/content/{key}", response_model=ContentResponse)
async def update_content(
    key: str,
    update_data: ContentUpdate,
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Update a specific site content entry."""
    result = await db.execute(select(SiteContent).where(SiteContent.key == key))
    content = result.scalar_one_or_none()
    
    if not content:
        # Create it if it doesn't exist
        content = SiteContent(key=key, value=update_data.value)
        db.add(content)
    else:
        content.value = update_data.value
        
    await db.commit()
    await db.refresh(content)
    
    return ContentResponse(
        key=content.key, 
        value=content.value, 
        updated_at=content.updated_at.isoformat() if content.updated_at else None
    )
