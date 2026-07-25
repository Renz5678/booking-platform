import base64
import httpx
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.services.email_service import send_booking_confirmation
from app.services.calendar_service import create_google_meet_event

from app.config import settings


PAYMONGO_BASE_URL = "https://api.paymongo.com/v1"

async def create_paymongo_checkout(amount: float, booking_id: str) -> str:
    """
    Creates a payment link via PayMongo API.
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
    
    payload = {
        "data": {
            "attributes": {
                "amount": amount_cents,
                "description": f"Counseling Session Booking {booking_id}",
                "remarks": str(booking_id)
            }
        }
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PAYMONGO_BASE_URL}/links",
            json=payload,
            headers=headers
        )
        if response.status_code != 200:
            # Add logging in real app
            raise Exception(f"Failed to create PayMongo link: {response.text}")
        
        data = response.json()
        return data["data"]["attributes"]["checkout_url"]


async def simulate_payment_success(booking_id: str, db: AsyncSession):
    """
    Simulates receiving a successful webhook from the payment provider.
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

    # Generate Google Meet link
    try:
        meet_link = await create_google_meet_event(
            summary="Counseling Session",
            start_time=booking.scheduled_start,
            end_time=booking.scheduled_end,
            booking_id=booking.id
        )
        booking.meeting_link = meet_link
    except Exception as e:
        # In production, we might just log this and not fail the payment success
        print(f"Failed to create calendar event: {e}")

    # Wait, the commit should happen in the router or here
    await db.commit()

    # Send email confirmation
    # Assuming booking.client is eager-loaded or we fetch the user
    # For simulation, we'll just print it
    await send_booking_confirmation("client@example.com", booking.id)

    return "Payment successful and booking confirmed"
