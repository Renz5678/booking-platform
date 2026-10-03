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
        provider="gcash_manual",
    )
    db.add(payment)

    await db.commit()

    # 7. Send GCash payment instructions email to the client
    try:
        await send_payment_pending_email(
            current_user.email,
            str(new_booking.id),
            float(amount),
        )
    except Exception as e:
        logger.error("Failed to send payment pending email for booking %s: %s", new_booking.id, e)

    # Slot expiry is handled by the Celery Beat sweeper (every 5 minutes) — no in-process timer needed.
    return {
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

    # Clean up Google Calendar event if one was created
    if booking.google_calendar_event_id:
        try:
            profile_result = await db.execute(
                select(CounselorProfile).where(CounselorProfile.id == booking.counselor_id)
            )
            cal_profile = profile_result.scalar_one_or_none()
            if cal_profile and cal_profile.google_calendar_connected and cal_profile.google_refresh_token:
                refresh_token = decrypt_token(cal_profile.google_refresh_token)
                await delete_calendar_event(refresh_token, booking.google_calendar_event_id)
        except Exception as e:
            logger.error("Failed to delete calendar event for booking %s: %s", booking_id, e)

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

    # Clean up Google Calendar event if one was created
    if booking.google_calendar_event_id:
        try:
            profile_result = await db.execute(
                select(CounselorProfile).where(CounselorProfile.id == booking.counselor_id)
            )
            cal_profile = profile_result.scalar_one_or_none()
            if cal_profile and cal_profile.google_calendar_connected and cal_profile.google_refresh_token:
                refresh_token = decrypt_token(cal_profile.google_refresh_token)
                await delete_calendar_event(refresh_token, booking.google_calendar_event_id)
        except Exception as e:
            logger.error("Failed to delete calendar event for counselor-cancel booking %s: %s", booking_id, e)

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


@router.post("/{booking_id}/mark-paid", response_model=BookingResponse)
async def mark_booking_paid(
    booking_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Counselor or Admin confirms that a GCash payment has been received and
    manually marks the booking as paid.

    This triggers:
    - Booking status: pending_payment → confirmed
    - Google Meet link generation and calendar event creation
    - Confirmation email with meeting details sent to the client
    - Session reminder tasks scheduled via Celery

    Permissions:
    - Counselors can only confirm payment for their own bookings.
    - Admins can confirm payment for any booking.
    """
    if current_user.role.value not in ["counselor", "admin"]:
        raise HTTPException(status_code=403, detail="Only counselors or admins can confirm payments")

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

    # Counselors may only confirm payment for their own clients' bookings
    if current_user.role.value == "counselor":
        counselor_result = await db.execute(
            select(CounselorProfile).where(CounselorProfile.user_id == current_user.id)
        )
        counselor = counselor_result.scalar_one_or_none()
        if not counselor or booking.counselor_id != counselor.id:
            raise HTTPException(status_code=403, detail="Not authorized to confirm this booking's payment")

    if booking.status == BookingStatus.confirmed:
        raise HTTPException(status_code=400, detail="This booking is already confirmed.")

    if booking.status != BookingStatus.pending_payment:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot confirm payment for a booking with status '{booking.status.value}'.",
        )

    # Delegate to the shared payment confirmation service — handles calendar event,
    # confirmation email to client, and Celery reminder scheduling.
    from app.models.payment import PaymentMethod

    try:
        await process_successful_payment(
            booking_id,
            db,
            payment_method=PaymentMethod.gcash,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(
            "Failed to process manual payment confirmation for booking %s: %s",
            booking_id,
            e,
        )
        raise HTTPException(status_code=500, detail="Failed to confirm payment. Please try again.")

    # Re-fetch the updated booking to return the confirmed state
    result = await db.execute(
        select(Booking)
        .options(
            selectinload(Booking.counselor).selectinload(CounselorProfile.user),
            selectinload(Booking.client),
        )
        .where(Booking.id == booking_id)
    )
    updated_booking = result.scalar_one_or_none()
    return updated_booking


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

    # 4. Update the booking times
    booking.scheduled_start = reschedule_data.new_scheduled_start
    booking.scheduled_end = reschedule_data.new_scheduled_end

    await db.commit()

    # Update Google Calendar event to reflect new time
    if booking.google_calendar_event_id:
        try:
            profile_result = await db.execute(
                select(CounselorProfile).where(CounselorProfile.id == booking.counselor_id)
            )
            cal_profile = profile_result.scalar_one_or_none()
            if cal_profile and cal_profile.google_calendar_connected and cal_profile.google_refresh_token:
                refresh_token = decrypt_token(cal_profile.google_refresh_token)
                await update_calendar_event(
                    refresh_token,
                    booking.google_calendar_event_id,
                    reschedule_data.new_scheduled_start,
                    reschedule_data.new_scheduled_end,
                )
        except Exception as e:
            logger.error("Failed to update calendar event for reschedule booking %s: %s", booking_id, e)

    await db.refresh(booking)

    return booking


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
        .where(Booking.id == booking_id)
    )
    booking = result.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.client_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to download this receipt")

    if booking.status == BookingStatus.pending_payment:
        raise HTTPException(status_code=400, detail="Receipts are only available for paid bookings")

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
        p.drawString(1 * inch, 9.6 * inch, "Official Receipt")
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
