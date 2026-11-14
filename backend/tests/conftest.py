from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.core.rate_limit import limiter

# Disable rate limiting for tests
limiter.enabled = False

# Use in-memory SQLite for testing
SQLALCHEMY_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=None,
)

TestingSessionLocal = async_sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)

async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session

app.dependency_overrides[get_db] = override_get_db

from app.celery_app import celery_app

celery_app.conf.update(
    task_always_eager=True,
    task_eager_propagates=True,
)

@pytest_asyncio.fixture(scope="function", autouse=True)
async def mock_external_services():
    with patch("app.services.email_service._send_email_sync", return_value=True), \
         patch("app.services.calendar_service.create_google_meet_event", new_callable=AsyncMock, return_value=("https://meet.google.com/test-meet", "test_ev_123")), \
         patch("app.services.payment_service.create_google_meet_event", new_callable=AsyncMock, return_value=("https://meet.google.com/test-meet", "test_ev_123")), \
         patch("app.services.calendar_service.add_event_to_calendar", new_callable=AsyncMock), \
         patch("app.services.payment_service.add_event_to_calendar", new_callable=AsyncMock), \
         patch("app.services.calendar_service.delete_calendar_event", new_callable=AsyncMock), \
         patch("app.services.calendar_service.update_calendar_event", new_callable=AsyncMock), \
         patch("app.services.calendar_service.get_google_calendar_busy_intervals", new_callable=AsyncMock, return_value=[]), \
         patch("app.tasks.reminders.send_session_reminder_task.apply_async"):
        yield

@pytest_asyncio.fixture(scope="function")
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
    finally:
        # aiosqlite owns worker threads; close pooled connections so pytest can exit.
        await engine.dispose()

@pytest_asyncio.fixture(scope="function")
async def async_client(init_db) -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client

@pytest_asyncio.fixture(scope="function")
async def db(init_db) -> AsyncGenerator[AsyncSession, None]:
    async with TestingSessionLocal() as session:
        yield session
