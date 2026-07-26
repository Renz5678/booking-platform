import asyncio
from app.db.session import engine
from app.models.user import Base as UserBase
from app.models.counselor_profile import Base as CPBase
from app.models.availability import Base as AvBase
from app.models.booking import Base as BookingBase
from app.models.intake_form import Base as IFBase
from app.models.payment import Base as PayBase

async def init_models():
    async with engine.begin() as conn:
        await conn.run_sync(UserBase.metadata.create_all)
        await conn.run_sync(CPBase.metadata.create_all)
        await conn.run_sync(AvBase.metadata.create_all)
        await conn.run_sync(BookingBase.metadata.create_all)
        await conn.run_sync(IFBase.metadata.create_all)
        await conn.run_sync(PayBase.metadata.create_all)

asyncio.run(init_models())
