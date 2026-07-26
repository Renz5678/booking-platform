import asyncio

from app.db.base import Base
from app.db.session import engine


async def init_db():
    async with engine.begin() as conn:
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)

if __name__ == "__main__":
    asyncio.run(init_db())
    print("Local database initialized successfully for manual testing!")
