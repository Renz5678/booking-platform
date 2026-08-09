import base64
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import settings
from app.core.encryption import decrypt_token
from app.models.booking import Booking, BookingStatus
from app.models.counselor_profile import CounselorProfile
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.user import User
from app.services.calendar_service import (
    add_event_to_calendar,
    create_google_meet_event,
)
from app.services.email_service import send_booking_confirmation

logger = logging.getLogger(__name__)

PAYMONGO_BASE_URL = "https://api.paymongo.com/v1"


def _get_paymongo_auth_header() -> str:
    """Returns the base64-encoded Basic auth header for PayMongo API calls."""
    auth_str = f"{settings.PAYMONGO_SECRET_KEY}:"
    return base64.b64encode(auth_str.encode()).decode()


async def create_paymongo_checkout(amount: float, booking_id: str) -> str:
    """
    Creates a payment link via PayMongo Checkout API.
    Amount is assumed to be in PHP (float). PayMongo expects cents (integer).
    """
    amount_cents = int(amount * 100)

    b64_auth = _get_paymongo_auth_header()
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": f"Basic {b64_auth}",
    }

    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")

    payload = {
        "data": {
            "attributes": {
                "send_email_receipt": False,
                "show_description": True,
                "show_line_items": True,
                "description": f"Counseling Session Booking {booking_id}",
                "line_items": [
                    {
                        "currency": "PHP",
                        "amount": amount_cents,
                        "name": "Counseling Session",
                        "quantity": 1,
                    }
                ],
                "payment_method_types": ["gcash", "paymaya", "card", "grab_pay"],
                "success_url": f"{frontend_url}/payment/success?booking_id={booking_id}",
                "cancel_url": f"{frontend_url}/counselors",
            }
        }
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PAYMONGO_BASE_URL}/checkout_sessions",
            json=payload,
            headers=headers,
        )
        if response.status_code != 200:
            raise Exception(f"Failed to create PayMongo checkout: {response.text}")

        data = response.json()
        return data["data"]["attributes"]["checkout_url"]


async def refund_payment(booking_id: str, db: AsyncSession) -> bool:
    """
    Issues a refund via the PayMongo Refunds API for the payment associated
    with the given booking.

    Returns True if the refund was successfully issued, False otherwise.

    The PayMongo refund API requires the Payment Intent ID (provider_payment_id),
    which is stored on the Payment record after the webhook confirms payment.
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

    if not payment.provider_payment_id:
        logger.error(
            "refund_payment: No provider_payment_id stored for booking %s. "
            "Cannot issue refund without the PayMongo Payment Intent ID.",
            booking_id,
        )
        return False

    amount_cents = int(payment.amount * 100)
    b64_auth = _get_paymongo_auth_header()
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": f"Basic {b64_auth}",
    }
    payload = {
        "data": {
            "attributes": {
                "amount": amount_cents,
                "payment_id": payment.provider_payment_id,
                "reason": "others",
                "notes": f"Refund for cancelled booking {booking_id}",
            }
        }
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PAYMONGO_BASE_URL}/refunds",
            json=payload,
            headers=headers,
        )
        if response.status_code not in (200, 201):
            logger.error(
                "refund_payment: PayMongo refund failed for booking %s: %s",
                booking_id,
                response.text,
            )
            return False

    payment.status = PaymentStatus.refunded
    await db.commit()
    logger.info("refund_payment: Refund issued successfully for booking %s", booking_id)
    return True


async def process_successful_payment(
    booking_id: str,
    db: AsyncSession,
    provider_payment_id: str | None = None,
    payment_method: PaymentMethod | None = None,
) -> str:
    """
    Processes a successful payment, confirming the booking and generating a Meet link.

    Args:
        booking_id: The booking to confirm.
        db: Async DB session.
        provider_payment_id: The PayMongo Payment ID from the webhook event, used for future refunds.
        payment_method: The payment method used (gcash, maya, card), extracted from the webhook.
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

    # Fetch counselor profile for refresh token
    profile_result = await db.execute(
        select(CounselorProfile).where(CounselorProfile.id == booking.counselor_id)
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
        await send_booking_confirmation(client.email, booking.id)
        
        # Schedule reminder emails
        from datetime import timedelta
        from app.tasks.reminders import send_session_reminder_task
        
        # Only schedule if the session is still in the future
        now = datetime.now(timezone.utc)
        start_time = booking.scheduled_start
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
            
        time_until_session = start_time - now
        
        if time_until_session > timedelta(hours=24):
            # Schedule 24h reminder
            reminder_time_24 = start_time - timedelta(hours=24)
            send_session_reminder_task.apply_async(
                args=[client.email, booking.id, 24],
                eta=reminder_time_24
            )
            
        if time_until_session > timedelta(hours=1):
            # Schedule 1h reminder
            reminder_time_1 = start_time - timedelta(hours=1)
            send_session_reminder_task.apply_async(
                args=[client.email, booking.id, 1],
                eta=reminder_time_1
            )
    else:
        logger.warning("Could not send confirmation email: client not found for booking %s", booking_id)

    return "Payment successful and booking confirmed"
