import asyncio
import datetime
import sys

from sqlalchemy.future import select

sys.path.append("/home/scarecrow/dev/booking_system/backend")
from app.db.session import AsyncSessionLocal
from app.models.availability import Availability
from app.models.counselor_profile import CounselorProfile


async def seed_availability():
    async with AsyncSessionLocal() as db:
        # Get all counselors
        result = await db.execute(select(CounselorProfile))
        counselors = result.scalars().all()
        
        for counselor in counselors:
            # Check if they already have availability
            avail_result = await db.execute(select(Availability).where(Availability.counselor_id == counselor.id))
            if not avail_result.scalars().all():
                print(f"Seeding availability for {counselor.id}")
                # Create default 9 AM to 5 PM blocks for Monday to Friday
                for day in range(5):
                    db.add(Availability(
                        counselor_id=counselor.id,
                        day_of_week=day,
                        start_time=datetime.time(9, 0),
                        end_time=datetime.time(17, 0),
                        is_recurring=True
                    ))
                await db.commit()
                print("Seeded successfully.")

if __name__ == "__main__":
    asyncio.run(seed_availability())
