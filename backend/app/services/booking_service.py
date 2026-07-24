from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, and_
from app.models.booking import Booking, BookingStatus
from app.models.availability import Availability
import asyncio

async def check_counselor_availability(db: AsyncSession, counselor_id: str, start_time, end_time) -> bool:
    """
    Checks if the counselor has overlapping confirmed or pending bookings.
    TODO: In the future, this should also check the `Availability` table to ensure 
    it falls within their working hours, and check their Google Calendar.
    """
    overlapping_bookings = await db.execute(
        select(Booking).where(
            Booking.counselor_id == counselor_id,
            Booking.status.in_([BookingStatus.pending_payment, BookingStatus.confirmed]),
            or_(
                and_(Booking.scheduled_start <= start_time, Booking.scheduled_end > start_time),
                and_(Booking.scheduled_start < end_time, Booking.scheduled_end >= end_time),
                and_(Booking.scheduled_start >= start_time, Booking.scheduled_end <= end_time)
            )
        )
    )
    if overlapping_bookings.scalar_one_or_none():
        return False
    return True

async def expire_booking_if_unpaid(booking_id: str, db: AsyncSession, delay_minutes: int = 30):
    """
    Background task to automatically release a slot if the payment isn't completed within the hold time.
    """
    # Sleep without blocking the main event loop
    await asyncio.sleep(delay_minutes * 60)
    
    # After sleep, check booking status
    result = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = result.scalar_one_or_none()
    
    if booking and booking.status == BookingStatus.pending_payment:
        # Auto-cancel due to non-payment
        booking.status = BookingStatus.cancelled
        # Note: In a production app with concurrent workers, a task queue (like Celery) 
        # or a cron job sweeping the DB is safer than sleeping in memory, 
        # but this works well for MVP testing.
        await db.commit()
