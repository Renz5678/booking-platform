import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.encryption import decrypt_token
from app.models.booking import Booking, BookingStatus
from app.models.counselor_profile import CounselorProfile
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.user import User
from app.services.calendar_service import (
    MANILA_TZ,
    add_event_to_calendar,
    create_google_meet_event,
    to_manila,
)
from app.services.email_service import send_booking_confirmation

logger = logging.getLogger(__name__)


async def refund_payment(booking_id: str, db: AsyncSession) -> bool:
    """
    Marks a paid manual payment as refunded upon eligible cancellation.
    Returns True if refunded (or already refunded), False otherwise.
    """
    payment_result = await db.execute(
        select(Payment).where(Payment.booking_id == booking_id)
    )
    payment = payment_result.scalar_one_or_none()

    if not payment:
        logger.error("refund_payment: No payment record found for booking %s", booking_id)
        return False

    if payment.status == PaymentStatus.refunded:
        logger.info("refund_payment: Payment for booking %s already refunded.", booking_id)
        return True

    if payment.status != PaymentStatus.paid:
        logger.warning(
            "refund_payment: Cannot refund booking %s — payment status is %s",
            booking_id,
            payment.status,
        )
        return False

    payment.status = PaymentStatus.refunded
    await db.commit()
    logger.info("refund_payment: Manual refund recorded for booking %s", booking_id)
    return True


async def process_successful_payment(
    booking_id: str,
    db: AsyncSession,
    provider_payment_id: str | None = None,
    payment_method: PaymentMethod | None = None,
) -> str:
    """
    Processes a verified payment, confirming the booking and generating a Meet link.

    Args:
        booking_id: The booking to confirm.
        db: Async DB session.
        provider_payment_id: Reference number provided by the client for manual verification.
        payment_method: The payment method used (gcash, maya, card).
    """
    # Find the booking and payment
    booking_result = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = booking_result.scalar_one_or_none()

    payment_result = await db.execute(
        select(Payment).where(Payment.booking_id == booking_id)
    )
    payment = payment_result.scalar_one_or_none()

    if not booking or not payment:
        raise ValueError("Booking or Payment not found")

    if payment.status == PaymentStatus.paid:
        return "Already paid"

    # Mark as paid and store provider details for future refunds
    payment.status = PaymentStatus.paid
    payment.paid_at = datetime.now(timezone.utc)
    if provider_payment_id:
        payment.provider_payment_id = provider_payment_id
    if payment_method:
        payment.payment_method = payment_method

    # Confirm booking
    booking.status = BookingStatus.confirmed

    # Fetch counselor profile for refresh token and name
    profile_result = await db.execute(
        select(CounselorProfile)
        .options(selectinload(CounselorProfile.user))
        .where(CounselorProfile.id == booking.counselor_id)
    )
    profile = profile_result.scalar_one_or_none()

    refresh_token = None
    if profile and profile.google_calendar_connected and profile.google_refresh_token:
        try:
            refresh_token = decrypt_token(profile.google_refresh_token)
        except Exception as e:
            logger.error("Failed to decrypt counselor refresh token for booking %s: %s", booking_id, e)

    # Generate Google Meet link (on counselor's calendar) and store event ID
    try:
        meet_link, calendar_event_id = await create_google_meet_event(
            summary="Counseling Session",
            start_time=booking.scheduled_start,
            end_time=booking.scheduled_end,
            booking_id=booking.id,
            refresh_token=refresh_token,
        )
        booking.meeting_link = meet_link
        if calendar_event_id:
            booking.google_calendar_event_id = calendar_event_id
    except Exception as e:
        logger.error("Failed to create calendar event for booking %s: %s", booking_id, e)

    # Commit so meeting_link and google_calendar_event_id are saved
    await db.commit()

    # Also add event to client's Google Calendar if they have connected it
    client_result = await db.execute(select(User).where(User.id == booking.client_id))
    client = client_result.scalar_one_or_none()

    if client and client.google_calendar_connected and client.google_refresh_token:
        try:
            client_refresh_token = decrypt_token(client.google_refresh_token)
            await add_event_to_calendar(
                summary="Counseling Session",
                start_time=booking.scheduled_start,
                end_time=booking.scheduled_end,
                booking_id=booking.id,
                meet_link=booking.meeting_link,
                refresh_token=client_refresh_token,
            )
        except Exception as e:
            logger.error("Failed to add event to client calendar for booking %s: %s", booking_id, e)

    # Send confirmation email to the actual client email
    if client:
        counselor_name = "Your Counselor"
        if profile and profile.user:
            counselor_name = profile.user.full_name
            
        try:
            await send_booking_confirmation(
                client.email,
                booking.id,
                counselor_name,
                booking.scheduled_start,
                booking.meeting_link or "",
            )
        except Exception as e:
            logger.error("Failed to send booking confirmation email for %s: %s", booking_id, e)
        
        # Schedule reminder emails
        from datetime import timedelta
        from app.tasks.reminders import send_session_reminder_task
        
        # Only schedule if the session is still in the future
        now = datetime.now(MANILA_TZ)
        start_time = to_manila(booking.scheduled_start)

        time_until_session = start_time - now
        
        if time_until_session > timedelta(hours=24):
            # Schedule 24h reminder
            reminder_time_24 = start_time - timedelta(hours=24)
            try:
                send_session_reminder_task.apply_async(
                    args=[client.email, booking.id, 24],
                    eta=reminder_time_24
                )
            except Exception as e:
                logger.error("Failed to schedule 24h reminder for booking %s: %s", booking.id, e)
            
        if time_until_session > timedelta(hours=1):
            # Schedule 1h reminder
            reminder_time_1 = start_time - timedelta(hours=1)
            try:
                send_session_reminder_task.apply_async(
                    args=[client.email, booking.id, 1],
                    eta=reminder_time_1
                )
            except Exception as e:
                logger.error("Failed to schedule 1h reminder for booking %s: %s", booking.id, e)
    else:
        logger.warning("Could not send confirmation email: client not found for booking %s", booking_id)

    return "Payment successful and booking confirmed"
