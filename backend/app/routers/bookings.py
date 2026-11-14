import logging
from datetime import datetime, timezone
import io

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app.config import settings
from app.core.security import get_current_user, require_role
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.models.booking import Booking, BookingStatus
from app.models.counselor_profile import CounselorProfile
from app.models.intake_form import IntakeForm
from app.models.payment import Payment, PaymentStatus
from app.models.operations import PaymentClaim
from app.models.user import User, RoleEnum
from app.services.auth_service import verify_captcha
from app.schemas.booking import (
    BookingCancelResponse,
    BookingCounselorResponse,
    BookingCreate,
    BookingRescheduleRequest,
    BookingResponse,
    BookingStatusUpdateRequest,
)
from app.services.booking_service import check_counselor_availability
from app.services.calendar_service import delete_calendar_event, update_calendar_event
from app.core.encryption import decrypt_token
from app.services.email_service import (
    send_cancellation_email,
    send_counselor_cancellation_notification,
    send_admin_cancellation_alert,
    send_payment_pending_email,
    generate_ics_content,
)
from app.services.payment_service import refund_payment, process_successful_payment

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_booking(
    request: Request,
    booking_data: BookingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates a new booking, creates the intake form, initiates payment session,
    and starts a 15-minute slot hold.
    """
    if booking_data.honeypot:
        raise HTTPException(status_code=400, detail="Bot detected")

    if not await verify_captcha(booking_data.captcha_token, "booking"):
        raise HTTPException(status_code=400, detail="Invalid CAPTCHA token")

    import hashlib, json
    from app.models.operations import BookingRequest
    key = request.headers.get("Idempotency-Key")
    record = None
    if key:
        if len(key) > 128:
            raise HTTPException(422, "Invalid idempotency key")
        await db.execute(select(User).where(User.id == current_user.id).with_for_update())
        scoped_key = hashlib.sha256((current_user.id + ":" + key).encode()).hexdigest()
        payload_hash = hashlib.sha256(json.dumps(booking_data.model_dump(mode="json", exclude={"captcha_token", "honeypot"}), sort_keys=True).encode()).hexdigest()
        record = await db.get(BookingRequest, scoped_key)
        if record:
            if record.payload_hash != payload_hash:
                raise HTTPException(409, "Idempotency key used with different booking data")
            return record.response
        record = BookingRequest(key=scoped_key, payload_hash=payload_hash)
        db.add(record)

    # 1. Validate times
    now = datetime.now(timezone.utc)
    start_time = booking_data.scheduled_start
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    else:
        start_time = start_time.astimezone(timezone.utc)
    end_time = booking_data.scheduled_end
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)
    else:
        end_time = end_time.astimezone(timezone.utc)

    if start_time <= now:
        raise HTTPException(status_code=400, detail="Booking start time must be in the future")
    if end_time <= start_time:
        raise HTTPException(status_code=400, detail="Booking end time must be after start time")

    # 2. Only clients can book
    if current_user.role.value != "client":
        raise HTTPException(status_code=403, detail="Only clients can book sessions")

    # 3. Check counselor exists, is verified and active
    counselor_res = await db.execute(
        select(CounselorProfile).where(CounselorProfile.id == booking_data.counselor_id)
    )
    counselor = counselor_res.scalar_one_or_none()
    if not counselor or not (counselor.is_verified and counselor.is_active):
        raise HTTPException(status_code=400, detail="Counselor is not available for bookings")

    # 4. Slot-squatting guard — one pending_payment booking per client at a time
    existing_pending = await db.execute(
        select(Booking).where(
            Booking.client_id == current_user.id,
            Booking.status == BookingStatus.pending_payment,
        )
    )
    if existing_pending.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="You already have a pending unpaid booking. "
            "Please complete payment or wait for it to expire before booking again.",
        )

    # 5. Check counselor availability
    is_available = await check_counselor_availability(
        db,
        booking_data.counselor_id,
        start_time,
        end_time,
    )
    if not is_available:
        raise HTTPException(
            status_code=409,
            detail="The counselor is not available during this time slot.",
        )

    # 6. Create Booking (status: pending_payment)
    new_booking = Booking(
        client_id=current_user.id,
        counselor_id=booking_data.counselor_id,
        scheduled_start=start_time,
        scheduled_end=end_time,
        status=BookingStatus.pending_payment,
    )
    db.add(new_booking)
    await db.flush()  # flush to get the new_booking.id

    # 7. Create Intake Form
    intake_form = IntakeForm(
        booking_id=new_booking.id,
        concern_category=booking_data.intake_concern_category,
        notes=booking_data.intake_notes,
    )
    db.add(intake_form)

    # 8. Create Payment record
    duration_hours = (
        new_booking.scheduled_end - new_booking.scheduled_start
    ).total_seconds() / 3600.0
    rate = getattr(settings, "SESSION_HOURLY_RATE", 300.0)
    from decimal import Decimal
    amount = (Decimal(str(rate)) * Decimal(str(duration_hours))).quantize(Decimal("0.01"))
    payment = Payment(
        booking_id=new_booking.id,
        amount=amount,
        currency="PHP",
        status=PaymentStatus.pending,
        provider="gcash_manual",
    )
    db.add(payment)

    result = {
        "msg": "Booking created. Please send your GCash payment within 15 minutes to confirm your slot.",
        "booking_id": str(new_booking.id),
        "amount": float(amount),
        "currency": "PHP",
        "gcash_number": settings.GCASH_NUMBER or "See confirmation email",
        "gcash_name": settings.GCASH_NAME or "Alaga Counseling",
        "reference": str(new_booking.id),
        "instructions": (
            f"Send PHP {float(amount):,.2f} to GCash number "
            f"{settings.GCASH_NUMBER or '[configured GCash number]'} "
            f"({settings.GCASH_NAME or 'Alaga Counseling'}). "
            f"Use your Booking ID as the GCash reference/note: {new_booking.id}"
        ),
    }
    if record:
        record.response = result
    from app.services.outbox import enqueue
    await enqueue(db, f"payment_instructions:{new_booking.id}", "payment_instructions_email", {"booking_id": new_booking.id})
    await db.commit()
    return result



@router.get("/me", response_model=list[BookingResponse])
async def get_my_bookings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns bookings for the currently authenticated client."""
    result = await db.execute(
        select(Booking)
        .options(
            selectinload(Booking.counselor).selectinload(CounselorProfile.user),
            selectinload(Booking.client),
            selectinload(Booking.payment),
            selectinload(Booking.intake_form),
        )
        .where(Booking.client_id == current_user.id)
        .order_by(Booking.scheduled_start.asc())
    )
    return result.scalars().all()


@router.get("/counselor/me", response_model=list[BookingCounselorResponse])
async def get_counselor_bookings(
    current_user: User = Depends(require_role(["counselor"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns bookings and their associated intake forms for the currently
    authenticated counselor.
    """
    counselor_result = await db.execute(
        select(CounselorProfile).where(CounselorProfile.user_id == current_user.id)
    )
    counselor = counselor_result.scalar_one_or_none()

    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")

    result = await db.execute(
        select(Booking)
        .options(
            selectinload(Booking.counselor).selectinload(CounselorProfile.user),
            selectinload(Booking.client),
            selectinload(Booking.intake_form),
            selectinload(Booking.payment),
        )
        .where(Booking.counselor_id == counselor.id)
        .order_by(Booking.scheduled_start.desc())
    )
    return result.scalars().all()


@router.get("/{booking_id}", response_model=BookingResponse)
async def get_booking_detail(
    booking_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the full detail of a single booking.
    Accessible by the booking's client, the assigned counselor, or an admin.
    """
    result = await db.execute(
        select(Booking)
        .options(
            selectinload(Booking.counselor).selectinload(CounselorProfile.user),
            selectinload(Booking.client),
            selectinload(Booking.intake_form),
            selectinload(Booking.payment),
        )
        .where(Booking.id == booking_id).with_for_update()
    )
    booking = result.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Authorization: client, their counselor, or admin
    is_client = booking.client_id == current_user.id
    is_admin = current_user.role.value == "admin"
    is_counselor = (
        current_user.role.value == "counselor"
        and booking.counselor
        and booking.counselor.user_id == current_user.id
    )

    if not (is_client or is_admin or is_counselor):
        raise HTTPException(status_code=403, detail="Not authorized to view this booking")

    if current_user.role.value == "admin":
        from app.schemas.booking import AdminBookingResponse
        return AdminBookingResponse.model_validate(booking)
    return booking


@router.get("/{booking_id}/ics")
async def download_booking_ics(
    booking_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns an .ics file for a given booking.
    Accessible by the booking's client, the assigned counselor, or an admin.
    """
    result = await db.execute(
        select(Booking)
        .options(
            selectinload(Booking.counselor).selectinload(CounselorProfile.user),
            selectinload(Booking.client),
        )
        .where(Booking.id == booking_id).with_for_update()
    )
    booking = result.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    is_client = booking.client_id == current_user.id
    is_admin = current_user.role.value == "admin"
    is_counselor = (
        current_user.role.value == "counselor"
        and booking.counselor
        and booking.counselor.user_id == current_user.id
    )

    if not (is_client or is_admin or is_counselor):
        raise HTTPException(status_code=403, detail="Not authorized to view this booking")

    counselor_name = booking.counselor.user.full_name if booking.counselor and booking.counselor.user else "Counselor"
    title = f"Counseling Session with {counselor_name}"
    description = f"Counseling session booked via Alaga Counseling. Booking ID: {booking.id}"
    location = booking.meeting_link or "Online (Link to be provided)"
    
    ics_content = generate_ics_content(
        title=title,
        start=booking.scheduled_start,
        end=booking.scheduled_end,
        location=location,
        description=description,
    )
    
    return Response(content=ics_content, media_type="text/calendar", headers={"Content-Disposition": f'attachment; filename="booking_{booking_id}.ics"'})


@router.post("/{booking_id}/cancel", response_model=BookingCancelResponse)
@limiter.limit("20/minute")
async def cancel_booking(
    request: Request,
    booking_id: str,
    current_user: User = Depends(require_role(["client"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Client cancels their own booking.
    - If ≥ 24 hours before the session: full refund is issued.
    - If < 24 hours before the session: cancellation is processed with no refund.
    """
    result = await db.execute(
        select(Booking)
        .options(selectinload(Booking.client), selectinload(Booking.payment))
        .where(Booking.id == booking_id).with_for_update()
    )
    booking = result.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to cancel this booking")

    if booking.status not in [BookingStatus.pending_payment, BookingStatus.confirmed]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel a booking with status '{booking.status.value}'.",
        )

    # Lock payment and claims rows
    payment = (
        await db.execute(
            select(Payment).where(Payment.booking_id == booking_id).with_for_update()
        )
    ).scalar_one_or_none()
    if not payment and booking.payment:
        payment = booking.payment

    claims = (
        await db.execute(
            select(PaymentClaim)
            .where(PaymentClaim.booking_id == booking_id)
            .with_for_update()
        )
    ).scalars().all()

    # Server-side 24-hour cutoff check — never trust the client timestamp
    now = datetime.now(timezone.utc)
    scheduled_start = booking.scheduled_start
    if scheduled_start.tzinfo is None:
        scheduled_start = scheduled_start.replace(tzinfo=timezone.utc)

    hours_until_session = (scheduled_start - now).total_seconds() / 3600
    refund_issued = False

    # Compute was_paid prior to mutating booking status
    was_paid = bool(
        booking.status == BookingStatus.confirmed
        or (
            payment
            and payment.status in (PaymentStatus.paid, PaymentStatus.refund_pending, PaymentStatus.refunded)
        )
    )

    # 1. Cancellation while Payment is under review or Claim is open
    if booking.status == BookingStatus.pending_payment:
        has_open_claims = any(c.status in ("open", "allocated") for c in claims)
        if (payment and payment.status == PaymentStatus.review) or has_open_claims:
            if payment:
                payment.status = PaymentStatus.failed
                payment.reviewed_at = now
                payment.reviewed_by = current_user.id
                payment.review_reason = "Client cancelled booking while reference was under review"
            for claim in claims:
                if claim.status in ("open", "allocated"):
                    claim.status = "open"
                    claim.reason = "Client cancelled booking while reference was under review"
                    claim.rejection_reason = "Client cancelled booking while reference was under review"
        elif payment and payment.status == PaymentStatus.pending:
            payment.status = PaymentStatus.failed

    # 2. Refund handling for confirmed bookings
    if hours_until_session >= 24 and booking.status == BookingStatus.confirmed:
        # Attempt refund — only confirmed (paid) bookings can be refunded
        refund_issued = await refund_payment(booking_id, db)
        if not refund_issued:
            logger.warning(
                "Cancellation for booking %s proceeding without refund due to refund failure.",
                booking_id,
            )
        if payment:
            await db.refresh(payment)

    # Compute refund_pending for outbox notification
    refund_pending = bool(
        refund_issued
        or (
            payment
            and payment.status in (PaymentStatus.refund_pending, PaymentStatus.refunded)
        )
    )

    booking.status = BookingStatus.cancelled
    booking.schedule_version += 1
    from app.services.outbox import booking_job, enqueue
    await booking_job(db, booking, "calendar")
    await enqueue(db, f"cancellation_email:{booking.id}:{booking.schedule_version}", "cancellation_email", {
        "booking_id": booking.id,
        "version": booking.schedule_version,
        "cancelled_by": "client",
        "refund_pending": refund_pending,
        "was_paid": was_paid,
    })
    await db.commit()

    return BookingCancelResponse(
        msg="Booking cancelled successfully.",
        booking_id=booking_id,
        refund_issued=refund_issued,
    )


@router.post("/{booking_id}/counselor-cancel", response_model=BookingCancelResponse)
async def counselor_cancel_booking(
    booking_id: str,
    current_user: User = Depends(require_role(["counselor"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Counselor cancels a booking for their client.
    A full refund is always issued regardless of timing.
    The client is notified by email immediately.
    """
    # Find the counselor's profile
    counselor_result = await db.execute(
        select(CounselorProfile)
        .options(selectinload(CounselorProfile.user))
        .where(CounselorProfile.user_id == current_user.id)
    )
    counselor = counselor_result.scalar_one_or_none()

    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")

    result = await db.execute(
        select(Booking)
        .options(selectinload(Booking.client), selectinload(Booking.payment))
        .where(Booking.id == booking_id).with_for_update()
    )
    booking = result.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.counselor_id != counselor.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to cancel this booking"
        )

    if booking.status not in [BookingStatus.pending_payment, BookingStatus.confirmed]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel a booking with status '{booking.status.value}'.",
        )

    payment = (
        await db.execute(
            select(Payment).where(Payment.booking_id == booking_id).with_for_update()
        )
    ).scalar_one_or_none()
    if not payment and booking.payment:
        payment = booking.payment

    was_paid = bool(
        booking.status == BookingStatus.confirmed
        or (payment and payment.status in (PaymentStatus.paid, PaymentStatus.refund_pending, PaymentStatus.refunded))
    )

    # Full refund always applies for counselor-initiated cancellations
    refund_issued = False
    if booking.status == BookingStatus.confirmed:
        refund_issued = await refund_payment(booking_id, db)
        if not refund_issued:
            logger.warning(
                "Counselor cancellation for booking %s proceeding without refund due to refund failure.",
                booking_id,
            )
        if payment:
            await db.refresh(payment)

    refund_pending = bool(
        refund_issued
        or (payment and payment.status in (PaymentStatus.refund_pending, PaymentStatus.refunded))
    )

    booking.status = BookingStatus.cancelled
    booking.schedule_version += 1
    from app.services.outbox import booking_job, enqueue
    await booking_job(db, booking, "calendar")
    await enqueue(db, f"cancellation_email:{booking.id}:{booking.schedule_version}", "cancellation_email", {
        "booking_id": booking.id,
        "version": booking.schedule_version,
        "cancelled_by": "counselor",
        "refund_pending": refund_pending,
        "was_paid": was_paid,
    })
    await db.commit()

    return BookingCancelResponse(
        msg="Booking cancelled. Client notification queued.",
        booking_id=booking_id,
        refund_issued=refund_issued,
    )


@router.post("/{booking_id}/mark-paid")
async def mark_booking_paid(booking_id: str, current_user=Depends(require_role(["admin"]))):
    raise HTTPException(status_code=410, detail="Use the administrator payment review queue")


@router.put("/{booking_id}/status", response_model=BookingResponse)
async def update_booking_status(
    booking_id: str,
    body: BookingStatusUpdateRequest,
    current_user: User = Depends(require_role(["counselor"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Counselor marks a session as completed or no_show.
    The session's scheduled_end must be in the past before this is allowed.
    """
    counselor_result = await db.execute(
        select(CounselorProfile).where(CounselorProfile.user_id == current_user.id)
    )
    counselor = counselor_result.scalar_one_or_none()

    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor profile not found")

    result = await db.execute(
        select(Booking)
        .options(
            selectinload(Booking.counselor).selectinload(CounselorProfile.user),
            selectinload(Booking.client),
        )
        .where(Booking.id == booking_id).with_for_update()
    )
    booking = result.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.counselor_id != counselor.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to update this booking"
        )

    if booking.status != BookingStatus.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Only confirmed bookings can be marked completed or no_show.",
        )

    # Ensure the session has ended before allowing status update
    now = datetime.now(timezone.utc)
    scheduled_end = booking.scheduled_end
    if scheduled_end.tzinfo is None:
        scheduled_end = scheduled_end.replace(tzinfo=timezone.utc)

    if now < scheduled_end:
        raise HTTPException(
            status_code=400,
            detail="Cannot mark a session as completed or no_show before it has ended.",
        )

    new_status = (
        BookingStatus.completed
        if body.status == "completed"
        else BookingStatus.no_show
    )
    booking.status = new_status
    await db.commit()
    result = await db.execute(
        select(Booking)
        .options(
            selectinload(Booking.counselor).selectinload(CounselorProfile.user),
            selectinload(Booking.client),
            selectinload(Booking.intake_form),
            selectinload(Booking.payment),
        )
        .where(Booking.id == booking_id).with_for_update()
    )
    return result.scalar_one()


@router.put("/{booking_id}/reschedule", response_model=BookingResponse)
@limiter.limit("20/minute")
async def reschedule_booking(
    request: Request,
    booking_id: str,
    reschedule_data: BookingRescheduleRequest,
    current_user: User = Depends(require_role(["client"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Reschedules an existing booking. Only allowed for the client who made it.
    Must retain the same duration.
    """
    # 1. Fetch existing booking
    result = await db.execute(
        select(Booking)
        .options(
            selectinload(Booking.counselor).selectinload(CounselorProfile.user),
            selectinload(Booking.client),
        )
        .where(Booking.id == booking_id).with_for_update()
    )
    booking = result.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.client_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Not authorized to reschedule this booking"
        )

    if booking.status not in [BookingStatus.pending_payment, BookingStatus.confirmed]:
        raise HTTPException(
            status_code=400,
            detail="Cannot reschedule a completed or cancelled booking.",
        )

    new_start = reschedule_data.new_scheduled_start
    if new_start.tzinfo is None:
        new_start = new_start.replace(tzinfo=timezone.utc)
    else:
        new_start = new_start.astimezone(timezone.utc)

    new_end = reschedule_data.new_scheduled_end
    if new_end.tzinfo is None:
        new_end = new_end.replace(tzinfo=timezone.utc)
    else:
        new_end = new_end.astimezone(timezone.utc)

    original_start = booking.scheduled_start
    if original_start.tzinfo is None:
        original_start = original_start.replace(tzinfo=timezone.utc)
    if (original_start - datetime.now(timezone.utc)).total_seconds() < 86400:
        raise HTTPException(status_code=400, detail="Rescheduling requires 24 hours notice")
    if new_start <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="New session must be in the future")

    # 2. Check duration match
    old_duration = (booking.scheduled_end - booking.scheduled_start).total_seconds()
    new_duration = (new_end - new_start).total_seconds()

    if old_duration != new_duration:
        raise HTTPException(
            status_code=400,
            detail="Rescheduled session must have the same duration as the original session.",
        )

    # 3. Check availability for new slots
    is_available = await check_counselor_availability(
        db,
        booking.counselor_id,
        new_start,
        new_end,
        exclude_booking_id=booking.id,
    )
    if not is_available:
        raise HTTPException(
            status_code=400,
            detail="Counselor is not available for the requested new time block.",
        )

    # 4. Update the booking times
    booking.scheduled_start = new_start
    booking.scheduled_end = new_end
    booking.schedule_version += 1
    booking.provisioning_status = "pending"
    from app.services.outbox import booking_job
    if booking.status == BookingStatus.confirmed:
        await booking_job(db, booking, "calendar")
    payment = (await db.execute(select(Payment).where(Payment.booking_id == booking.id).with_for_update())).scalar_one_or_none()
    if payment and payment.status == PaymentStatus.review and payment.review_deadline:
        deadline = payment.review_deadline
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        payment.review_deadline = min(deadline, new_start)

    await db.commit()

    result = await db.execute(
        select(Booking)
        .options(
            selectinload(Booking.counselor).selectinload(CounselorProfile.user),
            selectinload(Booking.client),
            selectinload(Booking.intake_form),
            selectinload(Booking.payment),
        )
        .where(Booking.id == booking_id).with_for_update()
    )
    return result.scalar_one()


@router.get("/{booking_id}/receipt", response_class=Response)
@limiter.limit("5/minute")
async def download_receipt(
    request: Request,
    booking_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Downloads a PDF receipt for a confirmed or cancelled booking.
    Only accessible by the client who owns the booking or an admin.
    """
    result = await db.execute(
        select(Booking)
        .options(
            selectinload(Booking.client),
            selectinload(Booking.counselor).selectinload(CounselorProfile.user),
            selectinload(Booking.payment),
        )
        .where(Booking.id == booking_id).with_for_update()
    )
    booking = result.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.client_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to download this receipt")

    if not booking.payment or not booking.payment.paid_at or booking.payment.status not in {PaymentStatus.paid, PaymentStatus.refund_pending, PaymentStatus.refunded}:
        raise HTTPException(status_code=400, detail="Receipts are only available for recorded payments")

    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.units import inch
        import io

        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        p.setTitle(f"Receipt - {booking.id}")

        # Header
        p.setFont("Helvetica-Bold", 24)
        p.drawString(1 * inch, 10 * inch, "Alaga Counseling")
        
        p.setFont("Helvetica", 12)
        p.drawString(1 * inch, 9.6 * inch, "Payment Acknowledgment")
        p.drawString(1 * inch, 9.4 * inch, "Manila, Philippines")
        p.drawString(1 * inch, 9.2 * inch, "support@alaga.ph")
        
        # Receipt details
        p.setFont("Helvetica-Bold", 14)
        p.drawString(1 * inch, 8.5 * inch, "Payment Details")
        
        p.setFont("Helvetica", 12)
        y_pos = 8.1 * inch
        line_height = 0.3 * inch
        
        # Resolve payment-derived fields safely
        date_issued = (
            booking.payment.paid_at.strftime("%Y-%m-%d %H:%M:%S UTC")
            if booking.payment and booking.payment.paid_at
            else booking.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
        )
        amount_paid = float(booking.payment.amount) if booking.payment else 0.0

        details = [
            ("Booking ID:", booking.id),
            ("Date Issued:", date_issued),
            ("Client Name:", booking.client.full_name if booking.client else "Unknown"),
            ("Client Email:", booking.client.email if booking.client else "Unknown"),
            ("Counselor:", booking.counselor.user.full_name if booking.counselor and booking.counselor.user else "Unknown"),
            ("Session Start:", booking.scheduled_start.strftime("%Y-%m-%d %H:%M:%S UTC")),
            ("Status:", booking.status.value.title()),
            ("Payment / Refund:", booking.payment.status.value.replace("_", " ").title()),
            ("Amount Paid:", f"PHP {amount_paid:,.2f}"),
        ]
        
        for label, value in details:
            p.drawString(1 * inch, y_pos, label)
            p.drawString(2.5 * inch, y_pos, str(value))
            y_pos -= line_height

        p.showPage()
        p.save()

        buffer.seek(0)
        
        headers = {
            "Content-Disposition": f'attachment; filename="receipt_{booking.id}.pdf"'
        }
        
        return Response(content=buffer.getvalue(), media_type="application/pdf", headers=headers)
        
    except ImportError:
        logger.error("reportlab is not installed. Cannot generate PDF receipts.")
        raise HTTPException(status_code=500, detail="PDF generation is currently unavailable")
    except Exception as e:
        logger.error("Failed to generate receipt: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to generate receipt")
