import base64
import httpx
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.models.counselor_profile import CounselorProfile
from app.models.user import User
from app.services.email_service import send_booking_confirmation
from app.services.calendar_service import create_google_meet_event, add_event_to_calendar
from app.core.encryption import decrypt_token

from app.config import settings


PAYMONGO_BASE_URL = "https://api.paymongo.com/v1"

async def create_paymongo_checkout(amount: float, booking_id: str) -> str:
    """
    Creates a payment link via PayMongo Checkout API.
    Amount is assumed to be in PHP (float). PayMongo expects cents (integer).
    """
    amount_cents = int(amount * 100)
    
    auth_str = f"{settings.PAYMONGO_SECRET_KEY}:"
    b64_auth = base64.b64encode(auth_str.encode()).decode()
    
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": f"Basic {b64_auth}"
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
                        "quantity": 1
                    }
                ],
                "payment_method_types": ["gcash", "paymaya", "card", "grab_pay"],
                "success_url": f"{frontend_url}/payment/success?booking_id={booking_id}",
                "cancel_url": f"{frontend_url}/counselors"
            }
        }
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PAYMONGO_BASE_URL}/checkout_sessions",
            json=payload,
            headers=headers
        )
        if response.status_code != 200:
            # Add logging in real app
            raise Exception(f"Failed to create PayMongo checkout: {response.text}")
        
        data = response.json()
        return data["data"]["attributes"]["checkout_url"]


async def process_successful_payment(booking_id: str, db: AsyncSession):
    """
    Processes a successful payment, confirming the booking and generating a Meet link.
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

    # Mark as paid
    payment.status = PaymentStatus.paid
    payment.paid_at = datetime.now(timezone.utc)

    # Confirm booking
    booking.status = BookingStatus.confirmed

    # Fetch counselor profile for refresh token
    profile_result = await db.execute(select(CounselorProfile).where(CounselorProfile.id == booking.counselor_id))
    profile = profile_result.scalar_one_or_none()
    
    refresh_token = None
    if profile and profile.google_calendar_connected and profile.google_refresh_token:
        try:
            refresh_token = decrypt_token(profile.google_refresh_token)
        except Exception as e:
            print(f"Failed to decrypt refresh token: {e}")

    # Generate Google Meet link (on counselor's calendar)
    try:
        meet_link = await create_google_meet_event(
            summary="Counseling Session",
            start_time=booking.scheduled_start,
            end_time=booking.scheduled_end,
            booking_id=booking.id,
            refresh_token=refresh_token
        )
        booking.meeting_link = meet_link
    except Exception as e:
        print(f"Failed to create calendar event on counselor's calendar: {e}")

    # Commit so meeting_link is saved
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
                refresh_token=client_refresh_token
            )
        except Exception as e:
            print(f"Failed to add event to client's calendar: {e}")

    # Send email confirmation
    await send_booking_confirmation("client@example.com", booking.id)

    return "Payment successful and booking confirmed"
