"""
Tests for Celery Stale Bookings Sweeper Task Event-Loop Resiliency (Milestone 1 / Requirement R1)

Covers:
- Repeated invocations (4 consecutive calls) of expire_stale_bookings_task in the same process
- Verification that no event loop mismatch or closed loop errors occur
- State verification of bookings across runs (stale cancelled, fresh preserved, confirmed untouched)
- Verification of engine disposal and clean resource teardown on success and failure
"""

import os
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.config import settings
from app.db.base import Base
from app.models import Booking, BookingStatus, CounselorProfile, RoleEnum, User
from app.tasks.reminders import expire_stale_bookings_task


@pytest.fixture
def temp_db():
    """
    Sets up a file-backed SQLite database (or uses ALAGA_POSTGRES_TEST_URL if configured).
    A persistent database URL ensures that multiple independent AsyncEngine instances
    created by separate expire_stale_bookings_task invocations can access the same persistent tables.
    """
    pg_url = os.environ.get("ALAGA_POSTGRES_TEST_URL")
    if pg_url:
        db_url = pg_url
        is_temp_file = False
        db_path = None
    else:
        f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        db_path = f.name
        f.close()
        db_url = f"sqlite+aiosqlite:///{db_path}"
        is_temp_file = True

    # Initialize tables
    async def _init_schema():
        engine = create_async_engine(db_url)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await engine.dispose()

    import asyncio
    asyncio.run(_init_schema())

    orig_url = settings.DATABASE_URL
    settings.DATABASE_URL = db_url

    yield db_url

    # Teardown
    settings.DATABASE_URL = orig_url
    if is_temp_file and db_path and os.path.exists(db_path):
        os.remove(db_path)


def test_expire_stale_bookings_task_repeated_consecutive_runs(temp_db):
    """
    Verify that expire_stale_bookings_task can be invoked repeatedly (at least 3-4 consecutive calls)
    in the same process without raising RuntimeError (event loop closed / attached to different loop).
    Verifies state transitions and idempotency across invocations.
    """
    db_url = temp_db

    # Seed data: 1 counselor, 3 clients (1 per booking to satisfy bookings_one_pending_client)
    async def _seed():
        engine = create_async_engine(db_url)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as db:
            c_user = User(
                email=f"counselor_{uuid.uuid4()}@example.com",
                full_name="Dr. Sweeper",
                password_hash="unused",
                role=RoleEnum.counselor,
                is_verified=True,
            )
            cl_stale = User(
                email=f"client_stale_{uuid.uuid4()}@example.com",
                full_name="Client Stale",
                password_hash="unused",
                role=RoleEnum.client,
                is_verified=True,
            )
            cl_fresh = User(
                email=f"client_fresh_{uuid.uuid4()}@example.com",
                full_name="Client Fresh",
                password_hash="unused",
                role=RoleEnum.client,
                is_verified=True,
            )
            cl_confirmed = User(
                email=f"client_conf_{uuid.uuid4()}@example.com",
                full_name="Client Confirmed",
                password_hash="unused",
                role=RoleEnum.client,
                is_verified=True,
            )
            db.add_all([c_user, cl_stale, cl_fresh, cl_confirmed])
            await db.flush()

            counselor = CounselorProfile(user_id=c_user.id, is_active=True, is_verified=True)
            db.add(counselor)
            await db.flush()

            now = datetime.now(timezone.utc)
            # Stale booking: created 25 minutes ago (threshold is 15 minutes)
            b_stale = Booking(
                id=f"stale_{uuid.uuid4()}",
                client_id=cl_stale.id,
                counselor_id=counselor.id,
                scheduled_start=now + timedelta(days=2),
                scheduled_end=now + timedelta(days=2, hours=1),
                status=BookingStatus.pending_payment,
                created_at=now - timedelta(minutes=25),
            )
            # Fresh booking: created 5 minutes ago (must NOT be cancelled)
            b_fresh = Booking(
                id=f"fresh_{uuid.uuid4()}",
                client_id=cl_fresh.id,
                counselor_id=counselor.id,
                scheduled_start=now + timedelta(days=3),
                scheduled_end=now + timedelta(days=3, hours=1),
                status=BookingStatus.pending_payment,
                created_at=now - timedelta(minutes=5),
            )
            # Confirmed booking: created 60 minutes ago (must NOT be cancelled)
            b_confirmed = Booking(
                id=f"confirmed_{uuid.uuid4()}",
                client_id=cl_confirmed.id,
                counselor_id=counselor.id,
                scheduled_start=now + timedelta(days=4),
                scheduled_end=now + timedelta(days=4, hours=1),
                status=BookingStatus.confirmed,
                created_at=now - timedelta(minutes=60),
            )
            db.add_all([b_stale, b_fresh, b_confirmed])
            await db.commit()

        await engine.dispose()
        return b_stale.id, b_fresh.id, b_confirmed.id, counselor.id

    import asyncio
    stale_id, fresh_id, confirmed_id, counselor_id = asyncio.run(_seed())

    # --- INVOCATION 1: Should sweep exactly 1 stale booking ---
    result1 = expire_stale_bookings_task()
    assert result1 == "Swept 1 bookings"

    # Verify database state after Run 1
    async def _verify_run1():
        engine = create_async_engine(db_url)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as db:
            stale = await db.get(Booking, stale_id)
            fresh = await db.get(Booking, fresh_id)
            confirmed = await db.get(Booking, confirmed_id)
            assert stale.status == BookingStatus.cancelled
            assert fresh.status == BookingStatus.pending_payment
            assert confirmed.status == BookingStatus.confirmed
        await engine.dispose()

    asyncio.run(_verify_run1())

    # --- INVOCATION 2: Should find 0 stale bookings (idempotent, fresh event loop) ---
    result2 = expire_stale_bookings_task()
    assert result2 == "Swept 0 bookings"

    # Seed an additional stale booking for Invocation 3
    async def _add_second_stale():
        engine = create_async_engine(db_url)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as db:
            cl_stale2 = User(
                email=f"client_stale2_{uuid.uuid4()}@example.com",
                full_name="Client Stale 2",
                password_hash="unused",
                role=RoleEnum.client,
                is_verified=True,
            )
            db.add(cl_stale2)
            await db.flush()

            now = datetime.now(timezone.utc)
            b_stale2 = Booking(
                id=f"stale2_{uuid.uuid4()}",
                client_id=cl_stale2.id,
                counselor_id=counselor_id,
                scheduled_start=now + timedelta(days=5),
                scheduled_end=now + timedelta(days=5, hours=1),
                status=BookingStatus.pending_payment,
                created_at=now - timedelta(minutes=30),
            )
            db.add(b_stale2)
            await db.commit()
            stale2_id = b_stale2.id
        await engine.dispose()
        return stale2_id

    stale2_id = asyncio.run(_add_second_stale())

    # --- INVOCATION 3: Should sweep newly added stale booking (3rd consecutive call) ---
    result3 = expire_stale_bookings_task()
    assert result3 == "Swept 1 bookings"

    # --- INVOCATION 4: Consecutive 4th run to confirm complete clean state ---
    result4 = expire_stale_bookings_task()
    assert result4 == "Swept 0 bookings"


def test_expire_stale_bookings_task_engine_disposal_on_success_and_error(temp_db):
    """
    Verify that expire_stale_bookings_task explicitly calls await engine.dispose() inside finally:
    both when the sweep succeeds and when an error is encountered.
    """
    disposed_count = 0
    orig_dispose = AsyncEngine.dispose

    async def _mock_dispose(self):
        nonlocal disposed_count
        disposed_count += 1
        await orig_dispose(self)

    with patch.object(AsyncEngine, "dispose", new=_mock_dispose):
        # 1. Normal run
        expire_stale_bookings_task()
        assert disposed_count == 1

        # 2. Run where cancel_stale_pending_bookings raises an exception
        with patch(
            "app.services.booking_service.cancel_stale_pending_bookings",
            side_effect=RuntimeError("DB Transient Failure"),
        ):
            with pytest.raises(RuntimeError, match="DB Transient Failure"):
                expire_stale_bookings_task()
            # Must still have disposed the engine in finally:
            assert disposed_count == 2
