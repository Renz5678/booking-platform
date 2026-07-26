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
    db: AsyncSession, counselor_id: str, start_date: str, end_date: str, duration_minutes: int
) -> dict[str, dict[str, list[str]]]:
    from datetime import datetime, time, timedelta, timezone

    from sqlalchemy import and_, or_

    from app.models.booking import Booking, BookingStatus

    s_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    e_dt = datetime.strptime(end_date, "%Y-%m-%d").date()

    if (e_dt - s_dt).days > 31:
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

    start_of_range = datetime.combine(s_dt, time.min).replace(tzinfo=timezone.utc)
    end_of_range = datetime.combine(e_dt, time.max).replace(tzinfo=timezone.utc)
    
    # Fetch all bookings in range
    stmt_bookings = select(Booking).where(
        Booking.counselor_id == counselor_id,
        Booking.status.in_([BookingStatus.pending_payment, BookingStatus.confirmed]),
        Booking.scheduled_start >= start_of_range,
        Booking.scheduled_start <= end_of_range
    )
    booking_result = await db.execute(stmt_bookings)
    bookings = booking_result.scalars().all()
    booked_intervals = [(b.scheduled_start, b.scheduled_end) for b in bookings]
    
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
            block_start = datetime.combine(current_date, block.start_time).replace(tzinfo=timezone.utc)
            block_end = datetime.combine(current_date, block.end_time).replace(tzinfo=timezone.utc)
            
            # If the block itself is in the past, skip generating slots for it
            # (In reality, we should check against current time, but for simplicity we'll just generate them)
            # We'll filter out past slots in the frontend or here.
            
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
                "available": [slot.isoformat() for slot in possible_slots],
                "occupied": [slot.isoformat() for slot in occupied_slots]
            }
        
        current_date += timedelta(days=1)
        
    return result_slots
