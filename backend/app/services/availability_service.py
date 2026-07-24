from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from app.models.availability import Availability
from app.schemas.availability import AvailabilityCreate
from typing import List

async def get_counselor_availability(db: AsyncSession, counselor_id: str):
    """Fetch all availability blocks for a given counselor."""
    stmt = select(Availability).where(Availability.counselor_id == counselor_id)
    result = await db.execute(stmt)
    return result.scalars().all()

async def add_availability_block(db: AsyncSession, counselor_id: str, avail_data: AvailabilityCreate):
    """Add a new availability block for a counselor."""
    db_avail = Availability(
        counselor_id=counselor_id,
        day_of_week=avail_data.day_of_week,
        specific_date=avail_data.specific_date,
        start_time=avail_data.start_time,
        end_time=avail_data.end_time,
        is_recurring=avail_data.is_recurring
    )
    db.add(db_avail)
    await db.commit()
    await db.refresh(db_avail)
    return db_avail

async def remove_availability_block(db: AsyncSession, counselor_id: str, availability_id: str):
    """Remove a specific availability block. Ensure it belongs to the counselor."""
    stmt = delete(Availability).where(
        Availability.id == availability_id,
        Availability.counselor_id == counselor_id
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.rowcount > 0
