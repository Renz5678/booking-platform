import asyncio
import sys

from sqlalchemy.future import select

sys.path.append("/home/scarecrow/dev/booking_system/backend")
from app.db.session import AsyncSessionLocal
from app.models.availability import Availability
from app.models.counselor_profile import CounselorProfile


async def test():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(CounselorProfile))
        counselors = result.scalars().all()
        for c in counselors:
            print(f"Counselor {c.id}")
            avail_res = await db.execute(select(Availability).where(Availability.counselor_id == c.id))
            for a in avail_res.scalars().all():
                print(f"  {a.day_of_week} {a.start_time} - {a.end_time}")

if __name__ == "__main__":
    asyncio.run(test())
