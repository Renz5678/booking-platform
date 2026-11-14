import base64
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.rate_limit import limiter
from app.core.security import require_role, validate_upload_magic_bytes
from app.db.session import get_db
from app.models.booking import Booking, BookingStatus
from app.models.payment import PaymentMethod, PaymentStatus
from app.models.user import User
from app.schemas.payment import PaymentResponse
from app.services.email_service import send_payment_rejected_email
from app.services.payment_service import process_successful_payment

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])

ALLOWED_PROOF_TYPES = {"application/pdf", "image/jpeg", "image/jpg", "image/png"}
MAX_PROOF_BYTES = 5 * 1024 * 1024


async def _load_booking_for_counselor(
    booking_id: str, counselor_user_id: str, db: AsyncSession
) -> Booking:
    result = await db.execute(
        select(Booking)
        .options(
            selectinload(Booking.counselor),
            selectinload(Booking.client),
            selectinload(Booking.payment),
        )
        .where(Booking.id == booking_id)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not booking.counselor or booking.counselor.user_id != counselor_user_id:
        raise HTTPException(status_code=403, detail="Not authorized to manage this booking's payment")
    if booking.status != BookingStatus.pending_payment:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot verify or reject payment for booking with status '{booking.status.value}'.",
        )
    return booking


@router.post("/{booking_id}/proof", response_model=PaymentResponse)
@limiter.limit("10/minute")
async def submit_payment_proof(
    request: Request,
    booking_id: str,
    reference_number: str | None = Form(None),
    payment_method: PaymentMethod | None = Form(None),
    file: UploadFile | None = File(None),
    current_user: User = Depends(require_role(["client"])),
    db: AsyncSession = Depends(get_db),
):
    """Client submits optional payment reference number and/or receipt proof for counselor verification."""
    cleaned_ref = reference_number.strip() if reference_number else None
    if not cleaned_ref and not file:
        raise HTTPException(
            status_code=400,
            detail="Please provide a reference number or upload a receipt.",
        )

    result = await db.execute(
        select(Booking)
        .options(selectinload(Booking.payment))
        .where(Booking.id == booking_id)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized for this booking")
    if booking.status != BookingStatus.pending_payment:
        raise HTTPException(status_code=400, detail="Booking is no longer awaiting payment")
    if not booking.payment:
        raise HTTPException(status_code=404, detail="Payment record not found")

    if file:
        if file.content_type not in ALLOWED_PROOF_TYPES:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Please upload PDF, JPG, or PNG.",
            )
        content = await file.read()
        if len(content) > MAX_PROOF_BYTES:
            raise HTTPException(status_code=400, detail="File exceeds 5MB limit.")
        if not validate_upload_magic_bytes(content, file.content_type):
            raise HTTPException(
                status_code=400,
                detail="File content does not match the declared PDF, JPG, or PNG type.",
            )
        encoded = base64.b64encode(content).decode("ascii")
        booking.payment.proof_url = f"data:{file.content_type};base64,{encoded}"

    if cleaned_ref:
        booking.payment.provider_payment_id = cleaned_ref
    if payment_method:
        booking.payment.payment_method = payment_method

    await db.commit()
    await db.refresh(booking.payment)
    return booking.payment


@router.post("/{booking_id}/verify")
@limiter.limit("20/minute")
async def verify_payment(
    request: Request,
    booking_id: str,
    current_user: User = Depends(require_role(["counselor"])),
    db: AsyncSession = Depends(get_db),
):
    """Counselor verifies a client's manual payment, confirming the booking and generating Google Meet."""
    booking = await _load_booking_for_counselor(booking_id, current_user.id, db)
    provider_ref = booking.payment.provider_payment_id if booking.payment else None
    method = booking.payment.payment_method if booking.payment else None
    msg = await process_successful_payment(
        booking_id,
        db,
        provider_payment_id=provider_ref,
        payment_method=method,
    )
    return {"msg": msg}


@router.post("/{booking_id}/reject")
@limiter.limit("20/minute")
async def reject_payment(
    request: Request,
    booking_id: str,
    current_user: User = Depends(require_role(["counselor"])),
    db: AsyncSession = Depends(get_db),
):
    """Counselor rejects an unverified payment proof so the client can re-upload a valid receipt."""
    booking = await _load_booking_for_counselor(booking_id, current_user.id, db)
    if booking.status != BookingStatus.pending_payment:
        raise HTTPException(
            status_code=400,
            detail="Only pending payment bookings can have their payment proof rejected.",
        )

    booking.status = BookingStatus.pending_payment
    booking.created_at = datetime.now(timezone.utc)
    if booking.payment:
        booking.payment.status = PaymentStatus.pending
        booking.payment.proof_url = None
        booking.payment.provider_payment_id = None
    await db.commit()

    if booking.client:
        try:
            await send_payment_rejected_email(booking.client.email, booking_id)
        except Exception as e:
            logger.error("Failed to send rejection email for booking %s: %s", booking_id, e)

    return {"msg": "Payment proof rejected. Client has been asked to re-upload."}


@router.post("/simulate-success/{booking_id}")
async def simulate_success(
    booking_id: str,
    current_user=Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Simulates a successful payment for a booking.
    RESTRICTED: Only available in non-production environments and to admin users.
    """
    if settings.ENVIRONMENT == "production":
        raise HTTPException(
            status_code=404,
            detail="Not found",
        )
    try:
        result_msg = await process_successful_payment(booking_id, db)
        return {"msg": result_msg}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
