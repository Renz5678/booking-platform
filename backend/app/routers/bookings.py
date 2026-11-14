import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.encryption import decrypt_token
from app.core.rate_limit import limiter
from app.core.security import get_current_user, require_role
from app.db.session import get_db
from app.models.booking import Booking, BookingStatus
from app.models.counselor_profile import CounselorProfile
from app.models.intake_form import IntakeForm
from app.models.payment import Payment, PaymentStatus
from app.models.user import User
from app.services.auth_service import verify_captcha
from app.schemas.booking import (
    BookingCancelResponse,
    BookingCounselorResponse,
    BookingCreate,
    BookingDetailResponse,
    BookingRescheduleRequest,
    BookingResponse,
    BookingStatusUpdateRequest,
)
from app.services.booking_service import check_counselor_availability
from app.services.calendar_service import (
    MANILA_TZ,
    delete_calendar_event,
    to_manila,
    update_calendar_event,
)
from app.services.email_service import (
    generate_ics_content,
    send_admin_cancellation_alert,
    send_cancellation_email,
    send_counselor_cancellation_notification,
)
from app.services.payment_service import refund_payment

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bookings", tags=["bookings"])


def _resolve_counselor_refresh_token(counselor: CounselorProfile | None) -> str | None:
    if counselor and counselor.google_calendar_connected and counselor.google_refresh_token:
        return decrypt_token(counselor.google_refresh_token)
    return None


def _validate_schedule_window(
    start_manila: datetime, end_manila: datetime, now_manila: datetime
) -> None:
    if end_manila <= start_manila:
        raise HTTPException(
            status_code=400,
            detail="Session end time must be after start time.",
        )
    if start_manila <= now_manila:
        raise HTTPException(
            status_code=400,
            detail="Cannot book or reschedule a session in the past.",
        )
    if start_manila.date() != end_manila.date():
        raise HTTPException(
            status_code=400,
            detail="Sessions must start and end on the same calendar day.",
        )
    if start_manila > now_manila + timedelta(days=90):
        raise HTTPException(
            status_code=400,
            detail="Sessions cannot be scheduled more than 90 days in advance.",
        )
    if (
        start_manila.second != 0
        or start_manila.microsecond != 0
        or end_manila.second != 0
        or end_manila.microsecond != 0
        or start_manila.minute not in (0, 30)
        or end_manila.minute not in (0, 30)
    ):
        raise HTTPException(
            status_code=400,
            detail="Session start and end times must align to 30-minute intervals.",
        )
    duration = end_manila - start_manila
    if duration < timedelta(minutes=30):
        raise HTTPException(
            status_code=400,
            detail="Session duration must be at least 30 minutes.",
        )
    if duration > timedelta(hours=4):
        raise HTTPException(
            status_code=400,
            detail="Session duration cannot exceed 4 hours.",
        )


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

    if not await verify_captcha(booking_data.captcha_token, expected_action="booking"):
        raise HTTPException(status_code=400, detail="Invalid CAPTCHA token")

    # 1. Only clients can book
    if current_user.role.value != "client":
        raise HTTPException(status_code=403, detail="Only clients can book sessions")

    # 2. Slot-squatting guard — one pending_payment booking per client at a time
    existing_pending = await db.execute(
        select(Booking).where(
            Booking.client_id == current_user.id,
            Booking.status == BookingStatus.pending_payment,
        )
    )
    if existing_pending.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="You already have a pending unpaid booking. "
            "Please complete payment or wait for it to expire before booking again.",
        )

    scheduled_start = to_manila(booking_data.scheduled_start)
    scheduled_end = to_manila(booking_data.scheduled_end)
    now_manila = datetime.now(MANILA_TZ)

    _validate_schedule_window(scheduled_start, scheduled_end, now_manila)

    # 3. Check counselor availability
    is_available = await check_counselor_availability(
        db,
        booking_data.counselor_id,
        scheduled_start,
        scheduled_end,
    )
    if not is_available:
        raise HTTPException(
            status_code=400,
            detail="The counselor is not available during this time slot.",
        )

    # 4. Create Booking (status: pending_payment)
    new_booking = Booking(
        client_id=current_user.id,
        counselor_id=booking_data.counselor_id,
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
        status=BookingStatus.pending_payment,
    )
    db.add(new_booking)
    await db.flush()  # flush to get the new_booking.id

    # 5. Create Intake Form
    intake_form = IntakeForm(
        booking_id=new_booking.id,
        concern_category=booking_data.intake_concern_category,
        notes=booking_data.intake_notes,
    )
    db.add(intake_form)

    # 6. Create manual Payment record (1-hour verification window)
    duration_hours = (
        new_booking.scheduled_end - new_booking.scheduled_start
    ).total_seconds() / 3600.0
    amount = settings.SESSION_HOURLY_RATE * duration_hours
    payment = Payment(
        booking_id=new_booking.id,
        amount=amount,
        currency="PHP",
        provider="manual",
        status=PaymentStatus.pending,
    )
    db.add(payment)

    await db.commit()

    return {
        "msg": "Booking created. Please complete payment within 1 hour for counselor verification.",
        "booking_id": new_booking.id,
        "amount": amount,
        "payment_window_minutes": 60,
    }


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
            selectinload(Booking.payment),
            selectinload(Booking.client),
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
            selectinload(Booking.intake_form),
            selectinload(Booking.payment),
            selectinload(Booking.client),
            selectinload(Booking.counselor).selectinload(CounselorProfile.user),
        )
        .where(Booking.counselor_id == counselor.id)
    )
    return result.scalars().all()


@router.get("/{booking_id}", response_model=BookingDetailResponse)
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
        .where(Booking.id == booking_id)
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
        .where(Booking.id == booking_id)
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
        .options(
            selectinload(Booking.client),
            selectinload(Booking.counselor),
        )
        .where(Booking.id == booking_id)
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

    # Server-side 24-hour cutoff check — never trust the client timestamp
    now = datetime.now(MANILA_TZ)
    scheduled_start = to_manila(booking.scheduled_start)

    hours_until_session = (scheduled_start - now).total_seconds() / 3600
    was_confirmed = booking.status == BookingStatus.confirmed
    refund_issued = False

    if hours_until_session >= 24 and was_confirmed:
        # Attempt refund — only confirmed (paid) bookings can be refunded
        refund_issued = await refund_payment(booking_id, db)
        if not refund_issued:
            logger.warning(
                "Cancellation for booking %s proceeding without refund due to refund failure.",
                booking_id,
            )

    booking.status = BookingStatus.cancelled
    await db.commit()

    if booking.google_calendar_event_id:
        try:
            refresh_token = _resolve_counselor_refresh_token(booking.counselor)
            await delete_calendar_event(refresh_token, booking.google_calendar_event_id)
        except Exception as e:
            logger.error("Failed to delete Google Calendar event for booking %s: %s", booking_id, e)

    # Send cancellation email
    client = booking.client
    if client:
        try:
            await send_cancellation_email(
                client.email, booking_id, refund_issued, was_paid=was_confirmed
            )
        except Exception as e:
            logger.error("Failed to send cancellation email for booking %s: %s", booking_id, e)

    return BookingCancelResponse(
        msg="Booking cancelled successfully.",
        booking_id=booking_id,
        refund_issued=refund_issued,
    )


@router.post("/{booking_id}/counselor-cancel", response_model=BookingCancelResponse)
@limiter.limit("20/minute")
async def counselor_cancel_booking(
    request: Request,
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
        .options(selectinload(Booking.client))
        .where(Booking.id == booking_id)
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

    # Full refund always applies for counselor-initiated cancellations
    refund_issued = False
    if booking.status == BookingStatus.confirmed:
        refund_issued = await refund_payment(booking_id, db)
        if not refund_issued:
            logger.warning(
                "Counselor cancellation for booking %s proceeding without refund due to refund failure.",
                booking_id,
            )

    booking.status = BookingStatus.cancelled
    await db.commit()

    if booking.google_calendar_event_id:
        try:
            refresh_token = _resolve_counselor_refresh_token(counselor)
            await delete_calendar_event(refresh_token, booking.google_calendar_event_id)
        except Exception as e:
            logger.error("Failed to delete Google Calendar event for booking %s: %s", booking_id, e)

    # Notify the client immediately
    client = booking.client
    if client:
        try:
            await send_counselor_cancellation_notification(client.email, booking_id)
        except Exception as e:
            logger.error(
                "Failed to send counselor cancellation notification for booking %s: %s",
                booking_id,
                e,
            )
            
    # Notify admin
    counselor_name = counselor.user.full_name if counselor and counselor.user else "Unknown Counselor"
    client_name = client.full_name if client else "Unknown Client"
    try:
        await send_admin_cancellation_alert(booking_id, counselor_name, client_name)
    except Exception as e:
        logger.error("Failed to send admin cancellation alert for booking %s: %s", booking_id, e)

    return BookingCancelResponse(
        msg="Booking cancelled. Client has been notified.",
        booking_id=booking_id,
        refund_issued=refund_issued,
    )


@router.put("/{booking_id}/status", response_model=BookingResponse)
@limiter.limit("20/minute")
async def update_booking_status(
    request: Request,
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
            selectinload(Booking.payment),
        )
        .where(Booking.id == booking_id)
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
    now = datetime.now(MANILA_TZ)
    scheduled_end = to_manila(booking.scheduled_end)

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

    return booking


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
            selectinload(Booking.payment),
        )
        .where(Booking.id == booking_id)
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

    new_start = to_manila(reschedule_data.new_scheduled_start)
    new_end = to_manila(reschedule_data.new_scheduled_end)
    now_manila = datetime.now(MANILA_TZ)

    if to_manila(booking.scheduled_start) <= now_manila:
        raise HTTPException(
            status_code=400,
            detail="Cannot reschedule a session that has already started or passed.",
        )
    _validate_schedule_window(new_start, new_end, now_manila)

    # 2. Check duration match
    old_duration = (to_manila(booking.scheduled_end) - to_manila(booking.scheduled_start)).total_seconds()
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

    # 4. Update the booking
    booking.scheduled_start = new_start
    booking.scheduled_end = new_end

    await db.commit()

    if booking.google_calendar_event_id:
        try:
            refresh_token = _resolve_counselor_refresh_token(booking.counselor)
            await update_calendar_event(
                refresh_token, booking.google_calendar_event_id, new_start, new_end
            )
        except Exception as e:
            logger.error("Failed to update Google Calendar event for booking %s: %s", booking_id, e)

    return booking
