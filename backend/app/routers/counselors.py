from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.rate_limit import limiter
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


# ---------------------------------------------------------------------------
# Counselor self-management routes
# IMPORTANT: These /me/* routes MUST be registered before the /{counselor_id}
# wildcard route, or FastAPI will match "me" as a counselor_id and return 404.
# ---------------------------------------------------------------------------


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


@router.post("/me/photo", response_model=dict)
@limiter.limit("5/minute")
async def upload_counselor_photo(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["counselor"])),
):
    """Counselor-only endpoint to upload a profile photo via Cloudinary."""
    from app.config import settings
    if not settings.CLOUDINARY_URL:
        raise HTTPException(
            status_code=500,
            detail="Photo uploads are not configured (CLOUDINARY_URL missing).",
        )

    counselor = await counselor_service.get_counselor_by_user_id(db, current_user.id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")

    import cloudinary
    import cloudinary.uploader
    from urllib.parse import urlparse

    # Parse CLOUDINARY_URL to configure the SDK
    # Format: cloudinary://api_key:api_secret@cloud_name
    parsed_url = urlparse(settings.CLOUDINARY_URL)
    api_key = parsed_url.username
    api_secret = parsed_url.password
    cloud_name = parsed_url.hostname

    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True,
    )

    try:
        upload_result = cloudinary.uploader.upload(
            file.file,
            folder="counselor_profiles",
            public_id=f"counselor_{counselor.id}",
            overwrite=True,
            resource_type="image",
        )

        secure_url = upload_result.get("secure_url")
        if not secure_url:
            raise HTTPException(
                status_code=500, detail="Failed to get secure URL from Cloudinary"
            )

        counselor.photo_url = secure_url
        await db.commit()

        return {"msg": "Photo uploaded successfully", "photo_url": secure_url}

    except Exception as e:
        import logging

        logging.error("Cloudinary upload failed: %s", str(e))
        raise HTTPException(status_code=500, detail=f"Failed to upload photo: {str(e)}")


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
        "is_active": counselor.is_active,
    }


# ---------------------------------------------------------------------------
# Public read-only routes (registered AFTER /me/* to avoid wildcard shadowing)
# ---------------------------------------------------------------------------


@router.get("", response_model=list[CounselorProfilePublicResponse])
@limiter.limit("30/minute")
async def list_active_counselors(request: Request, db: AsyncSession = Depends(get_db)):
    """Public endpoint to list all active and verified counselors."""
    return await counselor_service.get_active_counselors(db)


@router.get("/{counselor_id}", response_model=CounselorProfilePublicResponse)
@limiter.limit("60/minute")
async def get_counselor(
    request: Request, counselor_id: str, db: AsyncSession = Depends(get_db)
):
    """Public endpoint to view a specific counselor's profile."""
    counselor = await counselor_service.get_counselor_by_id(db, counselor_id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor not found")

    # Only return if active and verified
    if not (counselor.is_verified and counselor.is_active):
        raise HTTPException(status_code=404, detail="Counselor not found")

    return counselor
