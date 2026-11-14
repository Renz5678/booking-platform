import base64

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.rate_limit import limiter
from app.core.security import require_role, validate_upload_magic_bytes
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
@limiter.limit("30/minute")
async def list_active_counselors(request: Request, db: AsyncSession = Depends(get_db)):
    """Public endpoint to list all active and verified counselors."""
    return await counselor_service.get_active_counselors(db)



@router.get("/{counselor_id}", response_model=CounselorProfilePublicResponse)
@limiter.limit("60/minute")
async def get_counselor(request: Request, counselor_id: str, db: AsyncSession = Depends(get_db)):
    """Public endpoint to view a specific counselor's profile."""
    counselor = await counselor_service.get_counselor_by_id(db, counselor_id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor not found")

    # Only return if active and verified (unless an admin is viewing, but we keep this public for now)
    if not (counselor.is_verified and counselor.is_active):
        raise HTTPException(status_code=404, detail="Counselor not found")

    return counselor


@router.get("/me/profile", response_model=CounselorProfilePrivateResponse)
@limiter.limit("60/minute")
async def get_my_counselor_profile(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["counselor"])),
):
    """Counselor-only endpoint to view their own complete profile, including private fields."""
    counselor = await counselor_service.get_counselor_by_user_id(db, current_user.id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")
    return counselor


@router.put("/me/profile", response_model=CounselorProfilePrivateResponse)
@limiter.limit("20/minute")
async def update_my_counselor_profile(
    request: Request,
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


ALLOWED_CREDENTIAL_TYPES = {"application/pdf", "image/jpeg", "image/jpg", "image/png"}
MAX_CREDENTIAL_BYTES = 5 * 1024 * 1024


@router.post("/me/credentials")
@limiter.limit("10/minute")
async def upload_my_credentials(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["counselor"])),
):
    """Counselor-only endpoint to upload verification credentials (PDF/JPG/PNG, <= 5MB)."""
    if file.content_type not in ALLOWED_CREDENTIAL_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload PDF, JPG, or PNG.",
        )

    content = await file.read()
    if len(content) > MAX_CREDENTIAL_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 5MB limit.")
    if not validate_upload_magic_bytes(content, file.content_type):
        raise HTTPException(
            status_code=400,
            detail="File content does not match the declared PDF, JPG, or PNG type.",
        )

    counselor = await counselor_service.get_counselor_by_user_id(db, current_user.id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")

    encoded = base64.b64encode(content).decode("ascii")
    counselor.credentials_url = f"data:{file.content_type};base64,{encoded}"
    await db.commit()

    return {
        "msg": "Credentials uploaded successfully",
        "credentials_url": counselor.credentials_url,
    }


ALLOWED_QR_TYPES = {"image/jpeg", "image/jpg", "image/png"}


@router.post("/me/gcash-qr")
@limiter.limit("10/minute")
async def upload_my_gcash_qr(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["counselor"])),
):
    """Counselor-only endpoint to upload a GCash QR code image (JPG/PNG, <= 5MB)."""
    if file.content_type not in ALLOWED_QR_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload JPG or PNG.",
        )

    content = await file.read()
    if len(content) > MAX_CREDENTIAL_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 5MB limit.")
    if not validate_upload_magic_bytes(content, file.content_type):
        raise HTTPException(
            status_code=400,
            detail="File content does not match the declared JPG or PNG type.",
        )

    counselor = await counselor_service.get_counselor_by_user_id(db, current_user.id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")

    encoded = base64.b64encode(content).decode("ascii")
    counselor.gcash_qr_url = f"data:{file.content_type};base64,{encoded}"
    await db.commit()

    return {
        "msg": "GCash QR code uploaded successfully",
        "gcash_qr_url": counselor.gcash_qr_url,
    }

@router.get("/me/stats")
async def get_my_counselor_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["counselor"])),
):
    """Counselor-only endpoint to get dashboard statistics."""
    counselor = await counselor_service.get_counselor_by_user_id(db, current_user.id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")

    from sqlalchemy import func

    from app.models.booking import Booking, BookingStatus

    result = await db.execute(
        select(func.count(Booking.id))
        .where(Booking.counselor_id == counselor.id)
        .where(Booking.status == BookingStatus.confirmed)
    )
    upcoming_sessions = result.scalar_one_or_none() or 0

    return {
        "upcoming_sessions": upcoming_sessions,
        "is_verified": counselor.is_verified,
        "is_active": counselor.is_active
    }
