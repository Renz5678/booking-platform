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
    
    from datetime import datetime, timezone, timedelta
    from zoneinfo import ZoneInfo
    from app.models.availability import Availability
    if start_time.tzinfo is None or end_time.tzinfo is None:
        return False
    if start_time <= datetime.now(timezone.utc) or end_time - start_time != timedelta(minutes=60):
        return False
    local_start = start_time.astimezone(ZoneInfo("Asia/Manila"))
    local_end = end_time.astimezone(ZoneInfo("Asia/Manila"))
    blocks = (await db.execute(select(Availability).where(Availability.counselor_id == counselor_id))).scalars().all()
    if local_start.date() != local_end.date() or not any(
        ((block.is_recurring and block.day_of_week == local_start.weekday())
         or (not block.is_recurring and block.specific_date == local_start.date()))
        and block.start_time <= local_start.time().replace(tzinfo=None)
        and block.end_time >= local_end.time().replace(tzinfo=None)
        for block in blocks
    ):
        return False
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
    
    if not profile or not profile.is_active or not profile.is_verified:
        return False
    from app.models.user import User
    owner = (await db.execute(select(User).where(User.id == profile.user_id))).scalar_one_or_none()
    if not owner or not owner.is_active or not owner.is_verified:
        return False
    from app.config import settings
    if settings.ENVIRONMENT in {"staging", "production"} and not (profile.google_calendar_connected and profile.google_refresh_token):
        return False
    if profile.google_calendar_connected and profile.google_refresh_token:
        try:
            refresh_token = decrypt_token(profile.google_refresh_token)
            is_busy = await check_google_calendar_busy(refresh_token, start_time, end_time)
            if is_busy:
                return False
        except Exception as e:
            logger.error("Calendar availability unavailable for counselor %s", counselor_id)
            return False
            
    return True



async def cancel_stale_pending_bookings(db: AsyncSession, max_age_minutes: int = 15) -> int:
    """
    Sweeps the database for bookings in 'pending_payment' status that are older
    than max_age_minutes and cancels them to free up the slot.
    Returns the number of cancelled bookings.
    """
    from datetime import datetime, timedelta, timezone
    
    cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
    
    from app.models.payment import Payment, PaymentStatus
    from sqlalchemy.orm import selectinload

    # Find stale bookings with payments
    result = await db.execute(
        select(Booking)
        .options(selectinload(Booking.payment)).with_for_update(skip_locked=True)
        .where(
            and_(
                Booking.status == BookingStatus.pending_payment,
                Booking.created_at < cutoff_time
            )
        )
    )
    stale_bookings = result.scalars().all()
    
    count = 0
    for booking in stale_bookings:
        if booking.payment and booking.payment.status == PaymentStatus.review:
            deadline = booking.payment.review_deadline
            if deadline and deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=timezone.utc)
            if deadline and deadline > datetime.now(timezone.utc):
                continue
            booking.payment.status = PaymentStatus.failed
            booking.payment.review_reason = "Review deadline expired; reconcile any received funds"
        booking.status = BookingStatus.cancelled
        if booking.payment and booking.payment.status == PaymentStatus.pending:
            booking.payment.status = PaymentStatus.failed
        count += 1
        
    if count > 0:
        await db.commit()
        logger.info("Swept and cancelled %d stale pending_payment bookings.", count)
        
    return count
