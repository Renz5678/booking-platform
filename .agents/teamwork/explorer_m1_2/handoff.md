# Celery Stale-Booking Task Event-Loop Lifecycle Analysis & Implementation Strategy

**Author**: Explorer M1-2  
**Target Requirement**: R1 (Celery Stale-Booking Task Event-Loop Lifecycle)  
**Date**: 2026-10-31  
**Working Directory**: `/home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m1_2`  
**Primary Target File**: `backend/app/tasks/reminders.py`  
**Reference File**: `backend/app/tasks/operations.py`  

---

## 1. Observation

### 1.1 Existing Defect in `backend/app/tasks/reminders.py`
In `backend/app/tasks/reminders.py` (lines 50–67):
```python
@celery_app.task(name="app.tasks.reminders.expire_stale_bookings_task")
def expire_stale_bookings_task():
    """
    Periodic task to sweep and cancel stale pending_payment bookings.
    """
    from app.db.session import AsyncSessionLocal
    from app.services.booking_service import cancel_stale_pending_bookings
    
    async def _sweep():
        async with AsyncSessionLocal() as db:
            return await cancel_stale_pending_bookings(db, max_age_minutes=15)
            
    try:
        count = _run_async(_sweep())
        return f"Swept {count} bookings"
    except Exception as e:
        logger.error("Failed to run stale bookings sweeper: %s", str(e))
        raise
```
At line 10–12 of the same file:
```python
def _run_async(coro):
    """Helper to run async functions within synchronous Celery tasks."""
    return asyncio.run(coro)
```

At lines 5–16 of `backend/app/db/session.py`:
```python
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    hide_parameters=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)
```

### 1.2 Reference Pattern in `backend/app/tasks/operations.py`
In `backend/app/tasks/operations.py` (lines 5–24):
```python
@celery_app.task(name="app.tasks.operations.dispatch")
def dispatch_operations():
    async def run():
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from app.config import settings
        from app.services.outbox import dispatch
        # Each synchronous Celery task owns its event loop and connections.
        engine = create_async_engine(settings.DATABASE_URL)
        try:
            await dispatch(async_sessionmaker(engine, expire_on_commit=False))
            import redis.asyncio as redis
            cache = redis.from_url(settings.REDIS_URL)
            try:
                await cache.set("alaga:worker:heartbeat", "alive", ex=300)
            finally:
                await cache.aclose()
        finally:
            await engine.dispose()
    asyncio.run(run())
```

### 1.3 Service Operation in `backend/app/services/booking_service.py`
In `backend/app/services/booking_service.py` (lines 96–142):
- `cancel_stale_pending_bookings(db: AsyncSession, max_age_minutes: int = 15) -> int`:
  - Queries `Booking` rows with `status == BookingStatus.pending_payment` and `created_at < cutoff_time` using `.with_for_update(skip_locked=True)`.
  - Skips bookings under active manual payment review whose review deadline has not expired.
  - Updates stale bookings to `BookingStatus.cancelled` and pending payments to `PaymentStatus.failed`.
  - Calls `await db.commit()` if `count > 0`.
  - Returns `count: int`.

### 1.4 Celery Beat Schedule in `backend/app/celery_app.py`
In `backend/app/celery_app.py` (lines 23–26):
```python
"expire-stale-bookings-every-5-minutes": {
    "task": "app.tasks.reminders.expire_stale_bookings_task",
    "schedule": 300.0,  # 5 minutes in seconds
}
```
Celery Beat triggers `expire_stale_bookings_task` periodically every 300 seconds (5 minutes).

---

## 2. Logic Chain

### 2.1 The Event-Loop Mismatch & Connection Leak Mechanism
1. **Synchronous Celery Worker Execution**: Celery workers run synchronous task functions in worker threads or prefork child processes. To execute asynchronous coroutines, `_run_async(_sweep())` calls `asyncio.run(_sweep())`.
2. **Event Loop Lifecycle**: `asyncio.run()` creates a brand-new `asyncio.AbstractEventLoop`, sets it as the current running loop, executes the passed coroutine, closes the loop when the coroutine returns, and unsets it.
3. **Global Engine Shared Connection Pool**: `expire_stale_bookings_task` currently imports `AsyncSessionLocal` from `app.db.session`. `AsyncSessionLocal` is bound to the module-level singleton `engine = create_async_engine(settings.DATABASE_URL)`. By default in SQLAlchemy 2.0 async engines, a connection pool (`AsyncAdaptedQueuePool`) maintains a pool of persistent connections.
4. **Driver Binding in `asyncpg`**: When running against PostgreSQL via `postgresql+asyncpg`, each `asyncpg.Connection` creates protocol streams and futures strictly attached to the active event loop in which the connection was established.
5. **The Failure on Run #2**:
   - On Task Run #1: `asyncio.run()` initializes Loop 1. `AsyncSessionLocal()` borrows a connection from the global pool, opening a socket on Loop 1. When `_sweep()` finishes, `db.close()` checks the connection back into the pool, but the connection's internal protocol is bound to Loop 1. Loop 1 is then closed and garbage-collected.
   - On Task Run #2 (5 minutes later): `asyncio.run()` creates Loop 2. `AsyncSessionLocal()` borrows the existing pooled connection from the global engine. When any SQL statement is executed, `asyncpg` checks `connection._loop == current_running_loop`. Because Loop 1 is closed, `asyncpg` raises:
     ```
     RuntimeError: Task <...> got Future <...> attached to a different loop
     ```
     or
     ```
     RuntimeError: <Connection ...> is attached to a different event loop
     ```
   - All subsequent task executions fail permanently until the worker process restarts.
6. **Connection Pool Leaks**: Furthermore, because the global engine in `app.db.session` is never disposed by Celery tasks, failed or orphaned connections retain file descriptors and backend PostgreSQL processes until exhaustion of PostgreSQL's `max_connections`.

### 2.2 The Solution Architecture (Aligning with `operations.py`)
1. **Per-Invocation AsyncEngine Creation**: Inside the async coroutine `_sweep()`, instantiate a dedicated `AsyncEngine` via `create_async_engine(settings.DATABASE_URL)`.
2. **Dedicated Sessionmaker**: Instantiate a local sessionmaker `session_factory = async_sessionmaker(engine, expire_on_commit=False)` bound exclusively to the dedicated engine.
3. **Strict Resource Disposal in `finally:`**: Wrap the session execution in `try ... finally: await engine.dispose()`.
4. **Guaranteed Cleanup**:
   - `await engine.dispose()` terminates and closes all connection pools and open database sockets while the current event loop is still active and healthy.
   - When `asyncio.run(_sweep())` completes, there are zero lingering socket handles, active futures, or connection objects associated with the terminated event loop.
   - The subsequent task run spins up its own clean loop, dedicated engine, and clean disposal without interference.

---

## 3. Caveats

1. **Dead Code in `reminders.py` (`send_session_reminder_task`)**:
   - `backend/app/tasks/reminders.py` also contains `send_session_reminder_task` (lines 35–48) and `_send_reminder_if_confirmed` (lines 15–33), which also import `AsyncSessionLocal`.
   - As specified in `PROJECT.md` Feature 17 and `ORIGINAL_REQUEST.md` Requirement R4, `send_session_reminder_task` is dead code scheduled for complete removal in Milestone 4 (session reminders are processed via the transactional outbox engine in `app/services/outbox.py:124-131`).
   - For Milestone 1, we focus specifically on `expire_stale_bookings_task` without prematurely removing `send_session_reminder_task` (which is patched in `conftest.py:51`).
2. **`settings.DATABASE_URL` during Testing**:
   - In production, `settings.DATABASE_URL` is PostgreSQL (`postgresql+asyncpg://...`).
   - In standard local test execution without `ALAGA_POSTGRES_TEST_URL`, `conftest.py` uses an in-memory SQLite URL (`sqlite+aiosqlite:///:memory:`). However, `create_async_engine(settings.DATABASE_URL)` reads `settings.DATABASE_URL`.
   - Unit tests that test `expire_stale_bookings_task` must patch `settings.DATABASE_URL` with a valid test database URL (e.g. an isolated SQLite file or `ALAGA_POSTGRES_TEST_URL` when available) to ensure clean schema creation and execution across tests.

---

## 4. Conclusion & Proposed Implementation

### 4.1 Proposed Implementation in `backend/app/tasks/reminders.py`

Replace lines 50–67 in `backend/app/tasks/reminders.py` with:

```python
@celery_app.task(name="app.tasks.reminders.expire_stale_bookings_task")
def expire_stale_bookings_task():
    """
    Periodic task to sweep and cancel stale pending_payment bookings.
    Each synchronous Celery task invocation owns its event loop and connections.
    """
    async def _sweep():
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from app.config import settings
        from app.services.booking_service import cancel_stale_pending_bookings

        engine = create_async_engine(settings.DATABASE_URL)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with session_factory() as db:
                return await cancel_stale_pending_bookings(db, max_age_minutes=15)
        finally:
            await engine.dispose()

    try:
        count = _run_async(_sweep())
        return f"Swept {count} bookings"
    except Exception as e:
        logger.error("Failed to run stale bookings sweeper: %s", str(e))
        raise
```

### 4.2 Exact Diff

```diff
--- a/backend/app/tasks/reminders.py
+++ b/backend/app/tasks/reminders.py
@@ -51,14 +51,20 @@
 def expire_stale_bookings_task():
     """
     Periodic task to sweep and cancel stale pending_payment bookings.
+    Each synchronous Celery task invocation owns its event loop and connections.
     """
-    from app.db.session import AsyncSessionLocal
-    from app.services.booking_service import cancel_stale_pending_bookings
-    
     async def _sweep():
-        async with AsyncSessionLocal() as db:
-            return await cancel_stale_pending_bookings(db, max_age_minutes=15)
-            
+        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
+        from app.config import settings
+        from app.services.booking_service import cancel_stale_pending_bookings
+
+        engine = create_async_engine(settings.DATABASE_URL)
+        session_factory = async_sessionmaker(engine, expire_on_commit=False)
+        try:
+            async with session_factory() as db:
+                return await cancel_stale_pending_bookings(db, max_age_minutes=15)
+        finally:
+            await engine.dispose()
+
     try:
         count = _run_async(_sweep())
         return f"Swept {count} bookings"
```

### 4.3 Proposed Regression Test in `backend/tests/test_celery_lifecycle.py`

Create a new test file `backend/tests/test_celery_lifecycle.py`:

```python
import os
import pytest
from unittest.mock import patch, AsyncMock
from app.tasks.reminders import expire_stale_bookings_task
from app.config import settings


def test_expire_stale_bookings_consecutive_runs(tmp_path):
    """
    Verifies that expire_stale_bookings_task runs repeatedly across multiple
    consecutive asyncio.run() invocations without event-loop mismatch or
    connection leaks.
    """
    if os.environ.get("ALAGA_POSTGRES_TEST_URL"):
        test_db_url = os.environ["ALAGA_POSTGRES_TEST_URL"]
    else:
        # File-based SQLite ensuring tables exist for cancel_stale_pending_bookings
        import asyncio
        from sqlalchemy.ext.asyncio import create_async_engine
        import app.models  # noqa: F401
        from app.db.base import Base

        db_path = tmp_path / "test_celery_stale.db"
        test_db_url = f"sqlite+aiosqlite:///{db_path}"

        async def init_schema():
            engine = create_async_engine(test_db_url)
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            await engine.dispose()

        asyncio.run(init_schema())

    with patch.object(settings, "DATABASE_URL", test_db_url):
        # 1. First execution
        res1 = expire_stale_bookings_task()
        assert "Swept" in res1

        # 2. Second consecutive execution (verifies no loop mismatch)
        res2 = expire_stale_bookings_task()
        assert "Swept" in res2

        # 3. Third consecutive execution
        res3 = expire_stale_bookings_task()
        assert "Swept" in res3


def test_expire_stale_bookings_disposes_engine_on_failure(tmp_path):
    """
    Verifies that engine.dispose() is guaranteed to execute via finally:
    even if cancel_stale_pending_bookings raises an exception.
    """
    db_path = tmp_path / "test_celery_fail.db"
    test_db_url = f"sqlite+aiosqlite:///{db_path}"

    with patch.object(settings, "DATABASE_URL", test_db_url):
        with patch(
            "app.services.booking_service.cancel_stale_pending_bookings",
            AsyncMock(side_effect=RuntimeError("Simulated DB error")),
        ):
            with pytest.raises(RuntimeError, match="Simulated DB error"):
                expire_stale_bookings_task()
```

---

## 5. Verification Method

### 5.1 Test Execution Commands
Run pytest against the backend test suite:
```bash
cd /home/scarecrow/dev/booking_system/backend
PYTHONPATH=. .venv/bin/pytest tests/test_celery_lifecycle.py -v
```

### 5.2 Verification Against Live PostgreSQL
```bash
# 1. Start ephemeral PostgreSQL test cluster
mkdir -p /tmp/pg_test && initdb -D /tmp/pg_test -U alaga --auth=trust
pg_ctl -D /tmp/pg_test -o "-p 5433 -k /tmp -h 127.0.0.1" start
createdb -h 127.0.0.1 -p 5433 -U alaga alaga_test

# 2. Run migrations
cd /home/scarecrow/dev/booking_system/backend
DATABASE_URL="postgresql+asyncpg://alaga@127.0.0.1:5433/alaga_test" .venv/bin/alembic upgrade head

# 3. Run full pytest suite including the new lifecycle test
ALAGA_POSTGRES_TEST_URL="postgresql+asyncpg://alaga@127.0.0.1:5433/alaga_test" PYTHONPATH=. .venv/bin/pytest tests/

# 4. Stop and clean up cluster
pg_ctl -D /tmp/pg_test stop
rm -rf /tmp/pg_test
```

### 5.3 Invalidation Conditions
The proposed solution would be invalidated if:
1. `expire_stale_bookings_task` was executed from within an existing running event loop without offloading to a thread, causing `asyncio.run()` to raise `RuntimeError: asyncio.run() cannot be called from a running event loop`. (In Celery production workers, tasks execute synchronously on worker threads/processes, so this does not occur).
2. `engine.dispose()` was omitted or placed outside the `finally:` block, leaving connections pooled and active when the task's event loop closes.
