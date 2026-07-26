import asyncio
from datetime import datetime, timedelta, timezone

from app.services.calendar_service import create_google_meet_event


async def test_cal():
    now = datetime.now(timezone.utc)
    try:
        link = await create_google_meet_event(
            summary="Test Counseling Session",
            start_time=now + timedelta(days=1),
            end_time=now + timedelta(days=1, hours=1),
            booking_id="test-booking-id"
        )
        print("Success! Link:", link)
    except Exception as e:
        print("Error:", repr(e))

if __name__ == "__main__":
    asyncio.run(test_cal())
