import asyncio
from app.db.base import Base
from app.db.session import engine
from app.models.user import User
from app.models.counselor_profile import CounselorProfile
from app.models.availability import Availability
from app.models.booking import Booking
from app.models.intake_form import IntakeForm
from app.models.payment import Payment

async def init_db():
    async with engine.begin() as conn:
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)

if __name__ == "__main__":
    asyncio.run(init_db())
    print("Local database initialized successfully for manual testing!")
