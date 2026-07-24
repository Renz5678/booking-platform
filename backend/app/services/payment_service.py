from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.payment import Payment, PaymentStatus
from app.models.booking import Booking, BookingStatus
from datetime import datetime, timezone
from app.services.email_service import send_booking_confirmation

async def create_simulated_checkout(amount: float, booking_id: str) -> str:
    """
    Simulates a payment gateway session generation.
    """
    # In a real app, this would call PayMongo API and return a checkout_url
    return f"http://localhost:5173/mock-checkout/{booking_id}"

async def simulate_payment_success(booking_id: str, db: AsyncSession):
    """
    Simulates receiving a successful webhook from the payment provider.
    """
    # Find the booking and payment
    booking_result = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = booking_result.scalar_one_or_none()
    
    payment_result = await db.execute(select(Payment).where(Payment.booking_id == booking_id))
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
    
    # Wait, the commit should happen in the router or here
    await db.commit()
    
    # Send email confirmation
    # Assuming booking.client is eager-loaded or we fetch the user
    # For simulation, we'll just print it
    await send_booking_confirmation("client@example.com", booking.id)
    
    return "Payment successful and booking confirmed"
