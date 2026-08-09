import asyncio
import logging

from sqlalchemy import and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.encryption import decrypt_token
from app.models.booking import Booking, BookingStatus
from app.models.counselor_profile import CounselorProfile
from app.services.calendar_service import check_google_calendar_busy

logger = logging.getLogger(__name__)


async def check_counselor_availability(
    db: AsyncSession, counselor_id: str, start_time, end_time, exclude_booking_id: str | None = None
) -> bool:
    """
    Checks whether a counselor has any overlapping bookings during the requested time slot.

    We check for three possible overlap scenarios using interval overlap logic:
      1. An existing booking starts before and ends after our start (surrounds the start).
      2. An existing booking starts before and ends after our end (surrounds the end).
      3. An existing booking is completely inside the requested slot.

    Only 'pending_payment' and 'confirmed' bookings are considered active —
    cancelled and completed bookings free up the slot.
    """
    
    conditions = [
        Booking.counselor_id == counselor_id,
        # Only block on active bookings
        Booking.status.in_(
            [BookingStatus.pending_payment, BookingStatus.confirmed]
        ),
        # Simpler and safer overlap logic
        and_(
            Booking.scheduled_start < end_time,
            Booking.scheduled_end > start_time,
        )
    ]
    
    if exclude_booking_id:
        conditions.append(Booking.id != exclude_booking_id)

    overlapping_bookings = await db.execute(select(Booking).where(*conditions))
    if overlapping_bookings.scalars().first():
        return False
        
    # Check Google Calendar if connected
    profile_result = await db.execute(select(CounselorProfile).where(CounselorProfile.id == counselor_id))
    profile = profile_result.scalar_one_or_none()
    
    if profile and profile.google_calendar_connected and profile.google_refresh_token:
        try:
            refresh_token = decrypt_token(profile.google_refresh_token)
            is_busy = await check_google_calendar_busy(refresh_token, start_time, end_time)
            if is_busy:
                return False
        except Exception as e:
            logger.error("Failed to check Google Calendar busy status for counselor %s: %s", counselor_id, e)
            
    return True



async def cancel_stale_pending_bookings(db: AsyncSession, max_age_minutes: int = 15) -> int:
    """
    Sweeps the database for bookings in 'pending_payment' status that are older
    than max_age_minutes and cancels them to free up the slot.
    Returns the number of cancelled bookings.
    """
    from datetime import datetime, timedelta, timezone
    
    cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
    
    # Find stale bookings
    result = await db.execute(
        select(Booking).where(
            and_(
                Booking.status == BookingStatus.pending_payment,
                Booking.created_at < cutoff_time
            )
        )
    )
    stale_bookings = result.scalars().all()
    
    count = 0
    for booking in stale_bookings:
        booking.status = BookingStatus.cancelled
        count += 1
        
    if count > 0:
        await db.commit()
        logger.info("Swept and cancelled %d stale pending_payment bookings.", count)
        
    return count
