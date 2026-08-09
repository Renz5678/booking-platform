import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user, require_role
from app.db.session import get_db
from app.models.booking import Booking, BookingStatus
from app.models.counselor_profile import CounselorProfile
from app.models.intake_form import IntakeForm
from app.models.payment import Payment, PaymentStatus
from app.models.user import User
from app.routers.auth import verify_captcha
from app.schemas.booking import (
    BookingCancelResponse,
    BookingCounselorResponse,
    BookingCreate,
    BookingRescheduleRequest,
    BookingResponse,
    BookingStatusUpdateRequest,
)
from app.services.booking_service import (
    check_counselor_availability,
    expire_booking_if_unpaid,
)
from app.services.email_service import (
    send_cancellation_email,
    send_counselor_cancellation_notification,
)
from app.services.payment_service import create_paymongo_checkout, refund_payment

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_booking(
    booking_data: BookingCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates a new booking, creates the intake form, initiates payment session,
    and starts a 15-minute slot hold.
    """
    if booking_data.honeypot:
        raise HTTPException(status_code=400, detail="Bot detected")

    if not await verify_captcha(booking_data.captcha_token):
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

    # 3. Check counselor availability
    is_available = await check_counselor_availability(
        db,
        booking_data.counselor_id,
        booking_data.scheduled_start,
        booking_data.scheduled_end,
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
        scheduled_start=booking_data.scheduled_start,
        scheduled_end=booking_data.scheduled_end,
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

    # 6. Create Payment record
    duration_hours = (
        new_booking.scheduled_end - new_booking.scheduled_start
    ).total_seconds() / 3600.0
    amount = 300.0 * duration_hours
    payment = Payment(
        booking_id=new_booking.id,
        amount=amount,
        currency="PHP",
        status=PaymentStatus.pending,
    )
    db.add(payment)

    await db.commit()

    # 7. Call payment service to get checkout URL
    checkout_url = await create_paymongo_checkout(amount, new_booking.id)

    # 8. Start background task to expire booking in 15 minutes if unpaid
    background_tasks.add_task(expire_booking_if_unpaid, new_booking.id, db, 15)

    return {
        "msg": "Booking initiated. Please complete payment within 15 minutes.",
        "booking_id": new_booking.id,
        "checkout_url": checkout_url,
    }


@router.get("/me", response_model=list[BookingResponse])
async def get_my_bookings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns bookings for the currently authenticated client."""
    result = await db.execute(
        select(Booking)
        .options(selectinload(Booking.counselor).selectinload(CounselorProfile.user))
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
        .options(selectinload(Booking.intake_form))
        .where(Booking.counselor_id == counselor.id)
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


@router.post("/{booking_id}/cancel", response_model=BookingCancelResponse)
async def cancel_booking(
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
        .options(selectinload(Booking.client))
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
    now = datetime.now(timezone.utc)
    scheduled_start = booking.scheduled_start
    if scheduled_start.tzinfo is None:
        scheduled_start = scheduled_start.replace(tzinfo=timezone.utc)

    hours_until_session = (scheduled_start - now).total_seconds() / 3600
    refund_issued = False

    if hours_until_session >= 24 and booking.status == BookingStatus.confirmed:
        # Attempt refund — only confirmed (paid) bookings can be refunded
        refund_issued = await refund_payment(booking_id, db)
        if not refund_issued:
            logger.warning(
                "Cancellation for booking %s proceeding without refund due to refund failure.",
                booking_id,
            )

    booking.status = BookingStatus.cancelled
    await db.commit()

    # Send cancellation email
    client = booking.client
    if client:
        try:
            await send_cancellation_email(client.email, booking_id, refund_issued)
        except Exception as e:
            logger.error("Failed to send cancellation email for booking %s: %s", booking_id, e)

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
        select(CounselorProfile).where(CounselorProfile.user_id == current_user.id)
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

    return BookingCancelResponse(
        msg="Booking cancelled. Client has been notified.",
        booking_id=booking_id,
        refund_issued=refund_issued,
    )


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
    await db.refresh(booking)

    return booking


@router.put("/{booking_id}/reschedule", response_model=BookingResponse)
async def reschedule_booking(
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

    # 2. Check duration match
    old_duration = (booking.scheduled_end - booking.scheduled_start).total_seconds()
    new_duration = (
        reschedule_data.new_scheduled_end - reschedule_data.new_scheduled_start
    ).total_seconds()

    if old_duration != new_duration:
        raise HTTPException(
            status_code=400,
            detail="Rescheduled session must have the same duration as the original session.",
        )

    # 3. Check availability for new slots
    is_available = await check_counselor_availability(
        db,
        booking.counselor_id,
        reschedule_data.new_scheduled_start,
        reschedule_data.new_scheduled_end,
        exclude_booking_id=booking.id,
    )
    if not is_available:
        raise HTTPException(
            status_code=400,
            detail="Counselor is not available for the requested new time block.",
        )

    # 4. Update the booking
    booking.scheduled_start = reschedule_data.new_scheduled_start
    booking.scheduled_end = reschedule_data.new_scheduled_end

    await db.commit()
    await db.refresh(booking)

    return booking
