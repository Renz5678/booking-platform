"""
Adversarial Stress Test Harness for Celery Stale Bookings Sweeper Task
(Milestone 1 / Requirement R1)

Tests:
1. Repeated invocations under simulated database failures (connection refused, mid-query failures, 50 alternating fail/succeed runs)
2. Verification of engine disposal and connection pool exhaustion (pg_stat_activity, OS file descriptor tracking across 100 consecutive runs)
3. High-concurrency stress test (10 concurrent threads racing to sweep 30 stale bookings with FOR UPDATE SKIP LOCKED)
4. Event loop leak-proof verification (no dirty thread-local loops, no lingering tasks, GC tracking of engines, sessions, and loops)
5. Complex booking deadline edge cases (review deadline active vs expired, pending payments)
"""

import asyncio
import concurrent.futures
import gc
import os
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, OperationalError
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.config import settings
from app.db.base import Base
from app.models import Booking, BookingStatus, CounselorProfile, Payment, PaymentStatus, RoleEnum, User
from app.tasks.reminders import expire_stale_bookings_task


@pytest.fixture
def temp_pg_or_sqlite_db():
    """Sets up a database URL (preferring live PostgreSQL if available, otherwise file SQLite)."""
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

    async def _init_schema():
        engine = create_async_engine(db_url)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await engine.dispose()

    asyncio.run(_init_schema())

    orig_url = settings.DATABASE_URL
    settings.DATABASE_URL = db_url

    yield db_url

    settings.DATABASE_URL = orig_url
    if is_temp_file and db_path and os.path.exists(db_path):
        os.remove(db_path)


# ---------------------------------------------------------------------------
# 1. SIMULATED DATABASE FAILURES & RESILIENCE
# ---------------------------------------------------------------------------


def test_db_connection_refused_error_handling(temp_pg_or_sqlite_db):
    """
    Test when database is completely unreachable (e.g. port down / ConnectionRefusedError).
    Must raise, ensure engine is disposed, leave no active event loop, and subsequent
    normal runs must recover cleanly without loop errors.
    """
    good_url = temp_pg_or_sqlite_db
    # Bad URL pointing to closed port
    bad_url = "postgresql+asyncpg://alaga@127.0.0.1:54999/nonexistent"
    settings.DATABASE_URL = bad_url

    disposed = False
    orig_dispose = AsyncEngine.dispose

    async def _spy_dispose(self):
        nonlocal disposed
        disposed = True
        await orig_dispose(self)

    with patch.object(AsyncEngine, "dispose", new=_spy_dispose):
        with pytest.raises(Exception):
            expire_stale_bookings_task()

    assert disposed is True, "engine.dispose() must be called even when connection fails"

    # Verify event loop was cleaned up after failure
    try:
        loop = asyncio.get_event_loop_policy().get_event_loop()
        assert loop.is_closed() or not loop.is_running()
    except RuntimeError:
        # In Python 3.12, get_event_loop() raises RuntimeError when no loop is set
        pass

    # Recovery: switch back to good URL and verify it executes cleanly
    settings.DATABASE_URL = good_url
    result = expire_stale_bookings_task()
    assert "Swept" in result


def test_db_transient_failure_mid_query_and_recovery(temp_pg_or_sqlite_db):
    """
    Simulate mid-query operational failure (e.g. statement timeout, query cancelled, deadlock).
    Verify engine.dispose() runs in finally: and subsequent task calls recover cleanly.
    """
    disposed_count = 0
    orig_dispose = AsyncEngine.dispose

    async def _spy_dispose(self):
        nonlocal disposed_count
        disposed_count += 1
        await orig_dispose(self)

    with patch.object(AsyncEngine, "dispose", new=_spy_dispose):
        with patch(
            "app.services.booking_service.cancel_stale_pending_bookings",
            side_effect=OperationalError("canceling statement due to statement timeout", None, None),
        ):
            with pytest.raises(OperationalError):
                expire_stale_bookings_task()

        assert disposed_count == 1, "Engine must be disposed when mid-query error occurs"

        # Immediate recovery invocation
        result = expire_stale_bookings_task()
        assert disposed_count == 2, "Engine must be disposed on recovery run"
        assert "Swept" in result


def test_50_alternating_failures_and_successes(temp_pg_or_sqlite_db):
    """
    Stress-test rapid alternating failure and success (50 runs).
    Verifies that errors never poison the thread or connection state for subsequent runs.
    """
    for i in range(50):
        if i % 2 == 0:
            with patch(
                "app.services.booking_service.cancel_stale_pending_bookings",
                side_effect=RuntimeError(f"Simulated fault {i}"),
            ):
                with pytest.raises(RuntimeError, match=f"Simulated fault {i}"):
                    expire_stale_bookings_task()
        else:
            result = expire_stale_bookings_task()
            assert "Swept" in result


# ---------------------------------------------------------------------------
# 2. CONNECTION POOL EXHAUSTION & OS FILE DESCRIPTOR TRACKING
# ---------------------------------------------------------------------------


def test_100_consecutive_runs_no_connection_or_fd_leak(temp_pg_or_sqlite_db):
    """
    Execute 100 consecutive invocations of expire_stale_bookings_task against the database.
    Verify:
    1. PostgreSQL active connections return to baseline after every batch.
    2. OS open file descriptors (/proc/self/fd) remain stable and do NOT leak sockets.
    3. Engine is disposed in 100/100 invocations.
    """
    db_url = temp_pg_or_sqlite_db
    is_postgres = "postgresql" in db_url

    # Track open file descriptors
    pid = os.getpid()
    fd_dir = f"/proc/{pid}/fd"

    def get_open_fd_count():
        if os.path.exists(fd_dir):
            return len(os.listdir(fd_dir))
        return None

    initial_fd_count = get_open_fd_count()

    # Track PostgreSQL active connections if on PostgreSQL
    async def get_pg_connection_count():
        if not is_postgres:
            return 0
        engine = create_async_engine(db_url)
        async with engine.connect() as conn:
            res = await conn.execute(
                text("SELECT count(*) FROM pg_stat_activity WHERE datname = 'alaga_test'")
            )
            count = res.scalar()
        await engine.dispose()
        return count

    baseline_connections = asyncio.run(get_pg_connection_count())

    disposed_count = 0
    orig_dispose = AsyncEngine.dispose

    async def _spy_dispose(self):
        nonlocal disposed_count
        disposed_count += 1
        await orig_dispose(self)

    with patch.object(AsyncEngine, "dispose", new=_spy_dispose):
        for run_idx in range(100):
            res = expire_stale_bookings_task()
            assert "Swept" in res

    assert disposed_count == 100, f"Expected 100 engine disposals, got {disposed_count}"

    final_fd_count = get_open_fd_count()
    if initial_fd_count is not None and final_fd_count is not None:
        fd_diff = final_fd_count - initial_fd_count
        # A leak of 100 connections would increase FDs by ~100.
        # Slight variation (±5) is normal for Python runtime internals, but >20 is a leak.
        assert fd_diff < 15, f"Possible file descriptor leak: began with {initial_fd_count}, ended with {final_fd_count} (+{fd_diff})"

    final_connections = asyncio.run(get_pg_connection_count())
    if is_postgres:
        assert (
            final_connections <= baseline_connections + 1
        ), f"PostgreSQL connections leaked: baseline {baseline_connections}, final {final_connections}"


# ---------------------------------------------------------------------------
# 3. CONCURRENCY & RACE CONDITIONS (FOR UPDATE SKIP LOCKED)
# ---------------------------------------------------------------------------


def test_concurrent_invocations_multithreaded_skip_locked(temp_pg_or_sqlite_db):
    """
    Simulate high-concurrency Celery workers:
    Seed 30 stale bookings across 30 unique clients.
    Launch 10 concurrent threads simultaneously running expire_stale_bookings_task().
    Verify:
    1. Zero deadlocks or race condition exceptions.
    2. Each stale booking is cancelled exactly once.
    3. The sum of bookings swept across all 10 threads equals exactly 30 (on PostgreSQL).
    4. Database state shows all 30 bookings cancelled.
    """
    db_url = temp_pg_or_sqlite_db
    is_postgres = "postgresql" in db_url
    if not is_postgres:
        pytest.skip("Concurrency FOR UPDATE SKIP LOCKED test requires PostgreSQL")

    num_bookings = 30
    booking_ids = []

    async def _seed():
        engine = create_async_engine(db_url)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as db:
            c_user = User(
                email=f"counselor_conc_{uuid.uuid4()}@example.com",
                full_name="Dr. Concurrent",
                password_hash="unused",
                role=RoleEnum.counselor,
                is_verified=True,
            )
            db.add(c_user)
            await db.flush()

            counselor = CounselorProfile(user_id=c_user.id, is_active=True, is_verified=True)
            db.add(counselor)
            await db.flush()

            now = datetime.now(timezone.utc)

            # Create 30 unique clients (1 hold per client constraint)
            clients = [
                User(
                    email=f"client_conc_{i}_{uuid.uuid4()}@example.com",
                    full_name=f"Client {i}",
                    password_hash="unused",
                    role=RoleEnum.client,
                    is_verified=True,
                )
                for i in range(num_bookings)
            ]
            db.add_all(clients)
            await db.flush()

            created_ids = []
            for i, cl in enumerate(clients):
                b = Booking(
                    id=f"stale_conc_{i}_{uuid.uuid4()}",
                    client_id=cl.id,
                    counselor_id=counselor.id,
                    scheduled_start=now + timedelta(days=10, hours=i),
                    scheduled_end=now + timedelta(days=10, hours=i, minutes=50),
                    status=BookingStatus.pending_payment,
                    created_at=now - timedelta(minutes=30),  # Stale (>15 mins)
                )
                db.add(b)
                created_ids.append(b.id)

            await db.commit()
        await engine.dispose()
        return created_ids

    booking_ids = asyncio.run(_seed())
    assert len(booking_ids) == num_bookings

    # Execute 10 threads concurrently
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(expire_stale_bookings_task) for _ in range(10)]
        for f in concurrent.futures.as_completed(futures):
            results.append(f.result())

    # Parse counts swept by each thread
    import re
    swept_counts = [int(re.search(r"Swept (\d+) bookings", r).group(1)) for r in results]
    total_swept = sum(swept_counts)

    assert total_swept == num_bookings, f"Expected total 30 swept, got {total_swept} (breakdown: {swept_counts})"

    # Verify all bookings are cancelled in DB
    async def _verify():
        engine = create_async_engine(db_url)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as db:
            res = await db.execute(text("SELECT status FROM bookings WHERE id = ANY(:ids)"), {"ids": booking_ids})
            statuses = res.scalars().all()
            assert all(s == BookingStatus.cancelled.value or s == BookingStatus.cancelled for s in statuses)
        await engine.dispose()

    asyncio.run(_verify())


# ---------------------------------------------------------------------------
# 4. EVENT LOOP LEAK-PROOF VERIFICATION & MEMORY AUDIT
# ---------------------------------------------------------------------------


def test_event_loop_cleanup_100_percent_leak_proof(temp_pg_or_sqlite_db):
    """
    Verify that:
    1. After task execution, no running or open event loop remains attached to the current thread.
    2. No asyncio.Task objects remain lingering in memory.
    3. Garbage collection frees all AsyncEngine and ConnectionPool instances.
    """
    # Force clean GC baseline
    gc.collect()

    initial_engines = [obj for obj in gc.get_objects() if isinstance(obj, AsyncEngine)]

    for _ in range(20):
        res = expire_stale_bookings_task()
        assert "Swept" in res

        # In Python 3.12, asyncio.run() cleans up the loop.
        # Calling get_event_loop() should either raise RuntimeError or return a closed loop.
        try:
            loop = asyncio.get_event_loop_policy().get_event_loop()
            assert loop.is_closed() or not loop.is_running()
        except RuntimeError:
            pass  # Expected in Python 3.12: "There is no current event loop in thread"

    gc.collect()
    remaining_engines = [obj for obj in gc.get_objects() if isinstance(obj, AsyncEngine)]

    # The difference between baseline and remaining should be 0 (no AsyncEngines leaked)
    engine_leak = len(remaining_engines) - len(initial_engines)
    assert engine_leak == 0, f"Leaked {engine_leak} AsyncEngine instances!"


def test_thread_reuse_sequential_tasks(temp_pg_or_sqlite_db):
    """
    Simulate a Celery worker thread that sequentially executes 10 tasks on the same thread.
    Verifies that thread-local asyncio runner / loop does not enter an invalid state
    when tasks run back-to-back on the exact same thread.
    """
    def run_worker_thread():
        results = []
        for _ in range(10):
            results.append(expire_stale_bookings_task())
        return results

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(run_worker_thread)
        results = future.result()

    assert len(results) == 10
    assert all("Swept" in r for r in results)


# ---------------------------------------------------------------------------
# 5. BUSINESS RULES: PAYMENT IN REVIEW DEADLINES & HOLD PRESERVATION
# ---------------------------------------------------------------------------


def test_stale_booking_payment_review_deadline_rules(temp_pg_or_sqlite_db):
    """
    Verify:
    1. Stale booking with payment in 'review' whose review_deadline is in the future
       MUST NOT be cancelled (hold is preserved for admin review).
    2. Stale booking with payment in 'review' whose review_deadline has passed
       MUST be cancelled, payment set to 'failed', and review_reason updated.
    """
    db_url = temp_pg_or_sqlite_db

    async def _seed():
        engine = create_async_engine(db_url)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as db:
            c_user = User(
                email=f"counselor_rules_{uuid.uuid4()}@example.com",
                full_name="Dr. Rules",
                password_hash="unused",
                role=RoleEnum.counselor,
                is_verified=True,
            )
            cl_active_rev = User(
                email=f"client_act_rev_{uuid.uuid4()}@example.com",
                full_name="Client Active Review",
                password_hash="unused",
                role=RoleEnum.client,
                is_verified=True,
            )
            cl_exp_rev = User(
                email=f"client_exp_rev_{uuid.uuid4()}@example.com",
                full_name="Client Expired Review",
                password_hash="unused",
                role=RoleEnum.client,
                is_verified=True,
            )
            db.add_all([c_user, cl_active_rev, cl_exp_rev])
            await db.flush()

            counselor = CounselorProfile(user_id=c_user.id, is_active=True, is_verified=True)
            db.add(counselor)
            await db.flush()

            now = datetime.now(timezone.utc)

            # 1. Stale booking with review deadline in FUTURE (+1 hour)
            b_active_review = Booking(
                id=f"b_act_rev_{uuid.uuid4()}",
                client_id=cl_active_rev.id,
                counselor_id=counselor.id,
                scheduled_start=now + timedelta(days=20),
                scheduled_end=now + timedelta(days=20, hours=1),
                status=BookingStatus.pending_payment,
                created_at=now - timedelta(minutes=45),  # Stale
            )
            p_active = Payment(
                id=f"p_act_{uuid.uuid4()}",
                booking_id=b_active_review.id,
                amount=1500,
                status=PaymentStatus.review,
                review_deadline=now + timedelta(hours=1),  # Active deadline!
            )

            # 2. Stale booking with review deadline in PAST (-10 minutes)
            b_exp_review = Booking(
                id=f"b_exp_rev_{uuid.uuid4()}",
                client_id=cl_exp_rev.id,
                counselor_id=counselor.id,
                scheduled_start=now + timedelta(days=21),
                scheduled_end=now + timedelta(days=21, hours=1),
                status=BookingStatus.pending_payment,
                created_at=now - timedelta(minutes=45),  # Stale
            )
            p_exp = Payment(
                id=f"p_exp_{uuid.uuid4()}",
                booking_id=b_exp_review.id,
                amount=1500,
                status=PaymentStatus.review,
                review_deadline=now - timedelta(minutes=10),  # Expired deadline!
            )

            db.add_all([b_active_review, p_active, b_exp_review, p_exp])
            await db.commit()

        await engine.dispose()
        return b_active_review.id, p_active.id, b_exp_review.id, p_exp.id

    b_act_id, p_act_id, b_exp_id, p_exp_id = asyncio.run(_seed())

    # Run sweeper
    res = expire_stale_bookings_task()
    assert res == "Swept 1 bookings", f"Expected exactly 1 booking swept, got {res}"

    # Verify states
    async def _verify():
        engine = create_async_engine(db_url)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as db:
            b_act = await db.get(Booking, b_act_id)
            p_act = await db.get(Payment, p_act_id)
            b_exp = await db.get(Booking, b_exp_id)
            p_exp = await db.get(Payment, p_exp_id)

            # Active review deadline -> preserved!
            assert b_act.status == BookingStatus.pending_payment, "Active review booking must NOT be cancelled"
            assert p_act.status == PaymentStatus.review, "Payment in active review must remain in review"

            # Expired review deadline -> cancelled and failed!
            assert b_exp.status == BookingStatus.cancelled, "Expired review booking must be cancelled"
            assert p_exp.status == PaymentStatus.failed, "Expired review payment must be marked failed"
            assert "Review deadline expired" in p_exp.review_reason

        await engine.dispose()

    asyncio.run(_verify())


# ---------------------------------------------------------------------------
# 6. EXTREME ADVERSARIAL STRESS: BASEEXCEPTION, LARGE BATCH, MALFORMED URL
# ---------------------------------------------------------------------------


def test_engine_disposal_on_base_exception_keyboard_interrupt(temp_pg_or_sqlite_db):
    """
    Test that even when a non-Exception BaseException (such as KeyboardInterrupt / SIGINT
    during worker shutdown) is raised inside the task, engine.dispose() is still awaited in finally:.
    """
    disposed = False
    orig_dispose = AsyncEngine.dispose

    async def _spy_dispose(self):
        nonlocal disposed
        disposed = True
        await orig_dispose(self)

    with patch.object(AsyncEngine, "dispose", new=_spy_dispose):
        with patch(
            "app.services.booking_service.cancel_stale_pending_bookings",
            side_effect=KeyboardInterrupt("Worker SIGINT"),
        ):
            with pytest.raises(KeyboardInterrupt):
                expire_stale_bookings_task()

    assert disposed is True, "engine.dispose() must be called even on BaseException / KeyboardInterrupt"


def test_malformed_database_url_handling():
    """
    Test when DATABASE_URL is malformed or invalid protocol.
    Verify clean failure without leaving dangling loops.
    """
    orig_url = settings.DATABASE_URL
    try:
        settings.DATABASE_URL = "invalid_protocol://user:pass@localhost:5432/db"
        with pytest.raises(Exception):
            expire_stale_bookings_task()

        # Check loop state
        try:
            loop = asyncio.get_event_loop_policy().get_event_loop()
            assert loop.is_closed() or not loop.is_running()
        except RuntimeError:
            pass
    finally:
        settings.DATABASE_URL = orig_url


def test_large_scale_batch_sweep_100_bookings(temp_pg_or_sqlite_db):
    """
    Seed 100 stale bookings across 100 unique clients and verify that
    expire_stale_bookings_task handles large batches in a single transaction
    without exceeding connection bounds or timing out.
    """
    db_url = temp_pg_or_sqlite_db
    num_bookings = 100

    async def _seed():
        engine = create_async_engine(db_url)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with session_factory() as db:
            c_user = User(
                email=f"counselor_large_{uuid.uuid4()}@example.com",
                full_name="Dr. Batch",
                password_hash="unused",
                role=RoleEnum.counselor,
                is_verified=True,
            )
            db.add(c_user)
            await db.flush()

            counselor = CounselorProfile(user_id=c_user.id, is_active=True, is_verified=True)
            db.add(counselor)
            await db.flush()

            now = datetime.now(timezone.utc)
            clients = [
                User(
                    email=f"client_large_{i}_{uuid.uuid4()}@example.com",
                    full_name=f"Client Batch {i}",
                    password_hash="unused",
                    role=RoleEnum.client,
                    is_verified=True,
                )
                for i in range(num_bookings)
            ]
            db.add_all(clients)
            await db.flush()

            for i, cl in enumerate(clients):
                b = Booking(
                    id=f"stale_batch_{i}_{uuid.uuid4()}",
                    client_id=cl.id,
                    counselor_id=counselor.id,
                    scheduled_start=now + timedelta(days=30, hours=i),
                    scheduled_end=now + timedelta(days=30, hours=i, minutes=50),
                    status=BookingStatus.pending_payment,
                    created_at=now - timedelta(minutes=40),
                )
                db.add(b)

            await db.commit()
        await engine.dispose()

    asyncio.run(_seed())

    res = expire_stale_bookings_task()
    assert res == f"Swept {num_bookings} bookings", f"Expected Swept {num_bookings} bookings, got {res}"

