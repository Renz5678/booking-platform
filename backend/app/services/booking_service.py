import logging
from datetime import datetime

from sqlalchemy import and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.encryption import decrypt_token
from app.models.availability import Availability
from app.models.booking import Booking, BookingStatus
from app.models.counselor_profile import CounselorProfile
from app.services.calendar_service import (
    MANILA_TZ,
    check_google_calendar_busy,
    to_manila,
)

logger = logging.getLogger(__name__)


async def check_counselor_availability(
    db: AsyncSession, counselor_id: str, start_time, end_time, exclude_booking_id: str | None = None
) -> bool:
    """
    Checks whether a counselor can be booked during [start_time, end_time]:
      1. Acquires a row-level lock on CounselorProfile to serialize concurrent booking checks.
      2. Verifies the requested window falls inside the counselor's configured Availability blocks.
      3. Checks for overlapping pending_payment/confirmed bookings.
      4. Checks Google Calendar freeBusy if connected.
    """
    start_manila = to_manila(start_time)
    end_manila = to_manila(end_time)

    # Acquire row-level lock on counselor profile to serialize concurrent booking attempts
    profile_result = await db.execute(
        select(CounselorProfile)
        .where(CounselorProfile.id == counselor_id)
        .with_for_update()
    )
    profile = profile_result.scalar_one_or_none()
    if not profile:
        return False

    # Verify requested time falls within an availability block for this Manila date
    target_date = start_manila.date()
    target_dow = target_date.weekday()
    avail_result = await db.execute(
        select(Availability).where(
            Availability.counselor_id == counselor_id,
            or_(
                and_(
                    Availability.is_recurring == True,
                    Availability.day_of_week == target_dow,
                ),
                and_(
                    Availability.is_recurring == False,
                    Availability.specific_date == target_date,
                ),
            ),
        )
    )
    avail_blocks = avail_result.scalars().all()
    merged_intervals: list[tuple[datetime, datetime]] = []
    for block in sorted(avail_blocks, key=lambda b: (b.start_time, b.end_time)):
        b_start = datetime.combine(target_date, block.start_time, tzinfo=MANILA_TZ)
        b_end = datetime.combine(target_date, block.end_time, tzinfo=MANILA_TZ)
        if merged_intervals and b_start <= merged_intervals[-1][1]:
            merged_intervals[-1] = (
                merged_intervals[-1][0],
                max(merged_intervals[-1][1], b_end),
            )
        else:
            merged_intervals.append((b_start, b_end))

    within_block = any(
        b_start <= start_manila and end_manila <= b_end
        for b_start, b_end in merged_intervals
    )
    if not within_block:
        return False

    conditions = [
        Booking.counselor_id == counselor_id,
        Booking.status.in_([BookingStatus.pending_payment, BookingStatus.confirmed]),
        and_(
            Booking.scheduled_start < end_manila,
            Booking.scheduled_end > start_manila,
        ),
    ]
    if exclude_booking_id:
        conditions.append(Booking.id != exclude_booking_id)

    overlapping_bookings = await db.execute(select(Booking).where(*conditions))
    for existing in overlapping_bookings.scalars().all():
        if to_manila(existing.scheduled_start) < end_manila and to_manila(existing.scheduled_end) > start_manila:
            return False

    # Check Google Calendar if connected
    if profile.google_calendar_connected and profile.google_refresh_token:
        try:
            refresh_token = decrypt_token(profile.google_refresh_token)
            is_busy = await check_google_calendar_busy(refresh_token, start_manila, end_manila)
            if is_busy:
                return False
        except Exception as e:
            logger.error("Failed to check Google Calendar busy status for counselor %s: %s", counselor_id, e)

    return True



async def cancel_stale_pending_bookings(db: AsyncSession, max_age_minutes: int = 60) -> int:
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
