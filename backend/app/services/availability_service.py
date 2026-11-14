import logging
logger = logging.getLogger(__name__)
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.availability import Availability
from app.schemas.availability import AvailabilityCreate


async def get_counselor_availability(db: AsyncSession, counselor_id: str):
    """Fetch all availability blocks for a given counselor."""
    stmt = select(Availability).where(Availability.counselor_id == counselor_id)
    result = await db.execute(stmt)
    return result.scalars().all()


async def add_availability_block(
    db: AsyncSession, counselor_id: str, avail_data: AvailabilityCreate
):
    """Add a new availability block for a counselor."""
    db_avail = Availability(
        counselor_id=counselor_id,
        day_of_week=avail_data.day_of_week,
        specific_date=avail_data.specific_date,
        start_time=avail_data.start_time,
        end_time=avail_data.end_time,
        is_recurring=avail_data.is_recurring,
    )
    db.add(db_avail)
    await db.commit()
    await db.refresh(db_avail)
    return db_avail


async def remove_availability_block(
    db: AsyncSession, counselor_id: str, availability_id: str
):
    """Remove a specific availability block. Ensure it belongs to the counselor."""
    stmt = delete(Availability).where(
        Availability.id == availability_id, Availability.counselor_id == counselor_id
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount > 0


async def get_available_slots(
    db: AsyncSession, counselor_id: str, start_date: str, end_date: str, duration_minutes: int, exclude_booking_id: str | None = None
) -> dict[str, dict[str, list[str]]]:
    from datetime import datetime, time, timedelta, timezone

    from sqlalchemy import and_, or_

    from app.models.booking import Booking, BookingStatus

    if duration_minutes != 60:
        raise ValueError("Sessions must be 60 minutes")
    s_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    e_dt = datetime.strptime(end_date, "%Y-%m-%d").date()

    if not 0 <= (e_dt - s_dt).days <= 31:
        raise ValueError("Date range cannot exceed 31 days")

    # Fetch all availability blocks for this counselor
    stmt_avail = select(Availability).where(
        Availability.counselor_id == counselor_id,
        or_(
            Availability.is_recurring == True,
            and_(
                Availability.is_recurring == False,
                Availability.specific_date >= s_dt,
                Availability.specific_date <= e_dt
            )
        )
    )
    avail_result = await db.execute(stmt_avail)
    avail_blocks = avail_result.scalars().all()
    
    if not avail_blocks:
        return {}

    from zoneinfo import ZoneInfo
    PHT = ZoneInfo("Asia/Manila")

    start_of_range = datetime.combine(s_dt, time.min, tzinfo=PHT).astimezone(timezone.utc)
    end_of_range = datetime.combine(e_dt, time.max, tzinfo=PHT).astimezone(timezone.utc)
    
    # Fetch all bookings in range
    conditions = [
        Booking.counselor_id == counselor_id,
        Booking.status.in_([BookingStatus.pending_payment, BookingStatus.confirmed]),
        Booking.scheduled_start >= start_of_range,
        Booking.scheduled_start <= end_of_range
    ]
    if exclude_booking_id:
        conditions.append(Booking.id != exclude_booking_id)
        
    stmt_bookings = select(Booking).where(*conditions)
    booking_result = await db.execute(stmt_bookings)
    bookings = booking_result.scalars().all()
    booked_intervals = []
    for b in bookings:
        b_s = b.scheduled_start.replace(tzinfo=timezone.utc) if b.scheduled_start.tzinfo is None else b.scheduled_start.astimezone(timezone.utc)
        b_e = b.scheduled_end.replace(tzinfo=timezone.utc) if b.scheduled_end.tzinfo is None else b.scheduled_end.astimezone(timezone.utc)
        booked_intervals.append((b_s, b_e))
    
    # Check counselor Google Calendar busy intervals if connected
    from app.models.counselor_profile import CounselorProfile
    c_res = await db.execute(select(CounselorProfile).where(CounselorProfile.id == counselor_id))
    counselor = c_res.scalar_one_or_none()
    if counselor and counselor.google_calendar_connected and counselor.google_refresh_token:
        from app.core.encryption import decrypt_token
        from app.services.calendar_service import get_google_calendar_busy_intervals
        try:
            refresh_token = decrypt_token(counselor.google_refresh_token)
            gcal_busy = await get_google_calendar_busy_intervals(refresh_token, start_of_range, end_of_range)
            for g_s, g_e in gcal_busy:
                g_s_utc = g_s.replace(tzinfo=timezone.utc) if g_s.tzinfo is None else g_s.astimezone(timezone.utc)
                g_e_utc = g_e.replace(tzinfo=timezone.utc) if g_e.tzinfo is None else g_e.astimezone(timezone.utc)
                booked_intervals.append((g_s_utc, g_e_utc))
        except Exception as e:
            logger.warning("Could not sync Google Calendar busy intervals: %s", e)

    duration_delta = timedelta(minutes=duration_minutes)
    interval_delta = timedelta(minutes=30)
    
    result_slots = {}
    
    current_date = s_dt
    while current_date <= e_dt:
        day_str = current_date.isoformat()
        day_of_week = current_date.weekday()
        possible_slots = []
        occupied_slots = []
        
        # Filter blocks for this day
        day_blocks = [
            b for b in avail_blocks 
            if (b.is_recurring and b.day_of_week == day_of_week) or 
               (not b.is_recurring and b.specific_date == current_date)
        ]
        
        for block in day_blocks:
            block_start_pht = datetime.combine(current_date, block.start_time, tzinfo=PHT)
            block_start = block_start_pht.astimezone(timezone.utc)
            block_end_pht = datetime.combine(current_date, block.end_time, tzinfo=PHT)
            block_end = block_end_pht.astimezone(timezone.utc)
            
            current_time = block_start
            while current_time + duration_delta <= block_end:
                slot_end = current_time + duration_delta
                
                overlap = False
                for b_start, b_end in booked_intervals:
                    if current_time < b_end and slot_end > b_start:
                        overlap = True
                        break
                
                if overlap:
                    occupied_slots.append(current_time)
                else:
                    possible_slots.append(current_time)
                
                current_time += interval_delta
                
        if possible_slots or occupied_slots:
            possible_slots = sorted(list(set(possible_slots)))
            occupied_slots = sorted(list(set(occupied_slots)))
            result_slots[day_str] = {
                "available": [slot.astimezone(PHT).isoformat() for slot in possible_slots],
                "occupied": [slot.astimezone(PHT).isoformat() for slot in occupied_slots]
            }
        
        current_date += timedelta(days=1)
        
    return result_slots
