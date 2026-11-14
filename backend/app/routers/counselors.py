import logging
logger = logging.getLogger(__name__)
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.rate_limit import limiter
from app.core.security import get_current_user, require_role
from app.db.session import get_db
from app.models.user import User
from app.models.counselor_profile import CounselorProfile
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


async def _validate_and_upload(
    file: UploadFile,
    folder: str,
    public_id: str,
    allowed_types: set[str],
    max_bytes: int = 10 * 1024 * 1024,
    private: bool = False,
) -> str:
    import asyncio
    from urllib.parse import urlparse
    import cloudinary
    import cloudinary.uploader
    from app.config import settings

    if not settings.CLOUDINARY_URL:
        raise HTTPException(
            status_code=500,
            detail="File uploads are not configured (CLOUDINARY_URL missing).",
        )

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid declared content type. Allowed formats: {', '.join(allowed_types)}",
        )

    # Validate size and magic bytes
    chunk = await file.read(1024)
    file_size = len(chunk)
    header = chunk

    if file_size == 0:
        raise HTTPException(status_code=400, detail="Empty file is not allowed")

    # Read the rest to calculate total size
    while True:
        more = await file.read(1024 * 1024)
        if not more:
            break
        file_size += len(more)
        if file_size > max_bytes:
            raise HTTPException(
                status_code=400,
                detail=f"File exceeds maximum allowed size of {max_bytes // (1024 * 1024)}MB",
            )

    await file.seek(0)

    # Magic byte checks
    is_valid_type = False
    if "image/jpeg" in allowed_types and header.startswith(b"\xff\xd8\xff"):
        is_valid_type = True
    elif "image/png" in allowed_types and header.startswith(b"\x89PNG"):
        is_valid_type = True
    elif "image/webp" in allowed_types and header.startswith(b"RIFF") and b"WEBP" in header[:16]:
        is_valid_type = True
    elif "application/pdf" in allowed_types and header.startswith(b"%PDF"):
        is_valid_type = True

    if not is_valid_type:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file content. Allowed formats: {', '.join(allowed_types)}",
        )

    # Verify image decoding and bound dimensions
    if is_valid_type and not header.startswith(b"%PDF"):
        try:
            from PIL import Image
            img = Image.open(file.file)
            img.verify()
            if img.width > 4096 or img.height > 4096:
                raise HTTPException(status_code=400, detail="Image dimensions exceed maximum 4096x4096 limit")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="Corrupted or invalid image content")
        finally:
            await file.seek(0)

    parsed_url = urlparse(settings.CLOUDINARY_URL)
    cloudinary.config(
        cloud_name=parsed_url.hostname,
        api_key=parsed_url.username,
        api_secret=parsed_url.password,
        secure=True,
    )

    try:
        upload_result = await asyncio.to_thread(
            cloudinary.uploader.upload,
            file.file,
            folder=folder,
            public_id=public_id,
            overwrite=True,
            resource_type="raw" if private else "auto",
            type="authenticated" if private else "upload",
        )
        secure_url = upload_result.get("secure_url")
        if not secure_url:
            raise HTTPException(status_code=500, detail="Failed to retrieve secure URL")
        if private:
            return {"public_id": upload_result["public_id"], "resource_type": "raw", "format": upload_result.get("format", "")}
        return secure_url
    except Exception as e:
        logger.error("Cloudinary upload failed: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to upload file")


@router.post("/me/photo", response_model=dict)
@limiter.limit("5/minute")
async def upload_counselor_photo(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["counselor"])),
):
    """Counselor-only endpoint to upload a profile photo via Cloudinary."""
    counselor = await counselor_service.get_counselor_by_user_id(db, current_user.id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")

    secure_url = await _validate_and_upload(
        file=file,
        folder="counselor_photos",
        public_id=f"counselor_photo_{counselor.id}",
        allowed_types={"image/jpeg", "image/png", "image/webp"},
        max_bytes=5 * 1024 * 1024,
    )

    counselor.photo_url = secure_url
    await db.commit()
    return {"msg": "Photo uploaded successfully", "photo_url": secure_url}


@router.post("/me/credentials", response_model=dict)
@limiter.limit("5/minute")
async def upload_counselor_credentials(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["counselor"])),
):
    """Counselor-only endpoint to upload credential verification documents."""
    counselor = await counselor_service.get_counselor_by_user_id(db, current_user.id)
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")

    secure_url = await _validate_and_upload(
        file=file,
        folder="counselor_credentials",
        public_id=f"counselor_cred_{counselor.id}",
        allowed_types={"application/pdf", "image/jpeg", "image/png"},
        max_bytes=10 * 1024 * 1024,
        private=True,
    )

    counselor.credential_object = secure_url
    counselor.credentials_url = None
    await db.commit()
    return {"msg": "Credentials uploaded successfully", "has_credentials": True}



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


@router.get("/{counselor_id}/credentials/download")
async def download_credentials(counselor_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    import time
    from urllib.parse import urlparse
    import cloudinary
    from cloudinary.utils import private_download_url
    from app.config import settings
    from app.models.operations import AuditEvent
    counselor = await db.get(CounselorProfile, counselor_id)
    if not counselor or (current_user.role.value != "admin" and counselor.user_id != current_user.id):
        raise HTTPException(404, "Document not found")
    if not counselor.credential_object:
        raise HTTPException(404, "Private document not available")
    parsed = urlparse(settings.CLOUDINARY_URL or "")
    cloudinary.config(cloud_name=parsed.hostname, api_key=parsed.username, api_secret=parsed.password, secure=True)
    document = counselor.credential_object
    url = private_download_url(document["public_id"], document.get("format", ""), resource_type="raw", type="authenticated", expires_at=int(time.time()) + 300, attachment=True)
    db.add(AuditEvent(actor_id=current_user.id, target_id=counselor_id, action="credential_download", outcome="issued"))
    await db.commit()
    from fastapi.responses import JSONResponse
    return JSONResponse(
        content={"url": url, "expires_in": 300},
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}
    )
