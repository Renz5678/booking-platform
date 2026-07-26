import sys

sys.path.append("/home/scarecrow/dev/booking_system/backend")
from pydantic import ValidationError

from app.schemas.availability import AvailabilityCreate

try:
    obj = AvailabilityCreate(
        day_of_week=0,
        start_time="08:00:00",
        end_time="09:00:00",
        is_recurring=True
    )
    print("Success:", obj)
except ValidationError as e:
    print("Error:", e.errors())
