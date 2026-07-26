import asyncio
from sqlalchemy.future import select
from app.db.session import AsyncSessionLocal
from app.models.booking import Booking
from app.services.calendar_service import create_google_meet_event

async def run_test():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Booking))
        booking = result.scalars().first()
        if not booking:
            print("No booking found")
            return
            
        print("Booking dates:", repr(booking.scheduled_start), repr(booking.scheduled_end))
        print("Booking dates iso:", booking.scheduled_start.isoformat(), booking.scheduled_end.isoformat())
        
        try:
            meet = await create_google_meet_event(
                summary="Test",
                start_time=booking.scheduled_start,
                end_time=booking.scheduled_end,
                booking_id=booking.id
            )
            print("Meet link:", meet)
        except Exception as e:
            print("Error creating meet:", repr(e))

asyncio.run(run_test())
