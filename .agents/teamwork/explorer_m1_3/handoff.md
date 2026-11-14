# Handoff Report: Milestone 1 Test Strategy (R1: Proxy Rate Limiting & Celery Task Sweeper)

**Investigator**: Explorer 3 (Milestone 1)  
**Date**: 2026-10-31  
**Working Directory**: `/home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m1_3`  
**Target Files Analyzed**:
- `render.yaml`
- `backend/app/core/rate_limit.py`
- `backend/app/config.py`
- `backend/app/tasks/reminders.py`
- `backend/app/tasks/operations.py`
- `backend/app/services/booking_service.py`
- `backend/app/db/session.py`
- `backend/tests/conftest.py`
- `backend/tests/test_auth.py`
- `backend/tests/test_bookings.py`
- `backend/tests/test_postgres_constraints.py`

---

## 1. Observation

### 1.1 Rate Limiting Architecture & Vulnerabilities Observed
1. **`render.yaml` Line 9**:
   ```yaml
   startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-proxy-headers
   ```
   Direct observation: Uvicorn runs with `--no-proxy-headers`. It never parses `X-Forwarded-For` into `request.client.host`. To Uvicorn, every client request arrives with `request.client.host` set to Render's internal reverse-proxy / load-balancer IP.

2. **`backend/app/core/rate_limit.py` Lines 1–8**:
   ```python
   from slowapi import Limiter
   from slowapi.util import get_remote_address
   from app.config import settings

   limiter = Limiter(key_func=get_remote_address,
                     storage_uri=settings.REDIS_URL if settings.ENVIRONMENT in {"staging", "production"} else "memory://",
                     default_limits=["120/minute"], swallow_errors=False)
   ```
   Direct observation: `limiter` uses SlowAPI's `get_remote_address`, which strictly returns `request.client.host`. In production/staging behind Render, **all internet visitors share a single client host IP** and therefore share a single rate-limit bucket. When one user triggers a limit (e.g., 5 requests / 15 minutes on `/auth/signup` or `/auth/login`), **all subsequent requests from any client worldwide receive HTTP 429**.

3. **`backend/app/config.py` Lines 4–47**:
   Direct observation: `Settings` has no `TRUST_PROXY_HEADERS` field or computed proxy-trust property. Currently, `ENVIRONMENT` defaults to `"development"`.

4. **`backend/tests/conftest.py` Lines 14–15 & Database Setup**:
   ```python
   # Disable rate limiting for tests
   limiter.enabled = False
   ...
   SQLALCHEMY_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
   ```
   Direct observation: `limiter.enabled = False` is set globally for tests. Any rate limiting test must explicitly toggle `limiter.enabled = True`, run within a `try ... finally: limiter.enabled = False` block, and call `limiter.reset()` to clear in-memory counters.

5. **Existing Rate Limit Test in `backend/tests/test_auth.py` Lines 72–94**:
   ```python
   async def test_rate_limiting(async_client: AsyncClient):
       from app.core.rate_limit import limiter
       limiter.enabled = True
       try:
           ...
           for _ in range(5):
               await async_client.post("/auth/signup", json=signup_data)
           response = await async_client.post("/auth/signup", json=signup_data)
           assert response.status_code == 429
       finally:
           limiter.enabled = False
   ```
   Direct observation: Tests only raw request count from a single unproxied client. There is **zero test coverage** for:
   - Proxy header parsing or rightmost hop extraction.
   - Prevention of client prefix spoofing (e.g. `X-Forwarded-For: 1.1.1.1, 2.2.2.2`).
   - Bucket isolation between two distinct client IPs behind a proxy.
   - Fallback behavior when `TRUST_PROXY_HEADERS` is `False`.

---

### 1.2 Celery Task Event-Loop Lifecycle Observed
1. **`backend/app/tasks/reminders.py` Lines 50–67**:
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
   Direct observation:
   - `_run_async` executes `asyncio.run(coro)`.
   - `AsyncSessionLocal` is imported from `app.db.session`, which is bound to a single module-level `create_async_engine(settings.DATABASE_URL)`.
   - On Run 1: `asyncio.run()` creates Event Loop 1. `AsyncSessionLocal()` borrows a connection from the global engine pool and attaches async socket handles/futures to Loop 1. When `asyncio.run()` finishes, Loop 1 is closed.
   - On Run 2 (5 minutes later): `asyncio.run()` creates Event Loop 2. The global engine pool checks out the existing pooled connection. When asyncpg attempts to interact with futures from closed Loop 1, it crashes with:
     `RuntimeError: Task <...> got Future <...> attached to a different loop` or `RuntimeError: Event loop is closed`.

2. **Existing Working Pattern in `backend/app/tasks/operations.py` Lines 7–23**:
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
               ...
           finally:
               await engine.dispose()
       asyncio.run(run())
   ```
   Direct observation: `dispatch_operations` avoids the bug by instantiating a local `engine` inside the async task and strictly calling `await engine.dispose()` inside `finally:`. `expire_stale_bookings_task` was never updated to follow this pattern.

3. **Existing Stale Booking Tests in `backend/tests/test_bookings.py` Lines 99–107**:
   Direct observation: `test_bookings.py` tests `cancel_stale_pending_bookings(db)` directly using the test fixture session. The Celery task `expire_stale_bookings_task()` is **never invoked anywhere in the test suite**, leaving event loop lifecycle errors completely unverified.

---

## 2. Logic Chain

1. **Proxy Rate Limiting Invariants**:
   - *Premise*: Render's reverse proxy terminates external TLS and forwards requests to Uvicorn, appending the real client IP as the last item in the comma-separated `X-Forwarded-For` list.
   - *Inference 1*: If an attacker sends `X-Forwarded-For: 1.2.3.4, 5.6.7.8`, Render appends the true IP to form `1.2.3.4, 5.6.7.8, 203.0.113.195`.
   - *Inference 2*: Selecting the rightmost hop (`parts[-1].strip()`) guarantees that user-spoofed IP prefixes cannot alter the rate limit key.
   - *Inference 3*: If `TRUST_PROXY_HEADERS` is `False` (local development/tests), proxy headers must be ignored entirely to prevent local header spoofing; requests fall back to `request.client.host` or `"127.0.0.1"`.
   - *Test Strategy Requirement*:
     * Unit tests must exercise `get_client_ip` with: single IP, multi-hop chains, prefix spoofing with rotating prefixes, extra whitespace, trailing commas, missing headers, missing `request.client`, and `TRUST_PROXY_HEADERS=False`.
     * Integration tests must prove that two requests with different rightmost IPs (`203.0.113.195` vs `198.51.100.22`) map to independent rate-limit buckets even when sent with identical spoofed prefixes from the same test client, and that rotating spoofed prefixes does not reset an exhausted bucket.

2. **Celery Task Event-Loop Resiliency Invariants**:
   - *Premise*: In Celery synchronous worker processes, background tasks invoked on a schedule execute `asyncio.run()`, which creates and tears down an event loop per call.
   - *Inference 1*: Any SQLAlchemy `AsyncEngine` connection pool created outside `_sweep` binds internal asyncio primitives to the initial event loop. Reusing that pool across subsequent `asyncio.run()` calls will fail.
   - *Inference 2*: Creating a dedicated engine inside `_sweep` and calling `await engine.dispose()` in `finally:` isolates connection lifecycles to the active event loop and prevents PostgreSQL connection leaks.
   - *Test Strategy Requirement*:
     * The test must invoke `expire_stale_bookings_task()` at least 3 consecutive times within the exact same Python process.
     * The test must prove state transition: Stale bookings (`status=pending_payment` older than 15 minutes) are swept to `cancelled` and payment to `failed` on Run 1; subsequent runs find 0 stale bookings without error; adding another stale booking before Run 3 is swept cleanly.
     * The test must verify resource cleanup: Engine disposal occurs even if the database operation raises an exception.

---

## 3. Caveats

1. **In-Memory SQLite vs File-backed SQLite / PostgreSQL**:
   - `conftest.py` uses `"sqlite+aiosqlite:///:memory:"` for HTTP client tests. In SQLite, `:memory:` databases are connection-isolated. Because `expire_stale_bookings_task` creates a new `AsyncEngine`, calling it against `:memory:` would connect to an empty database without tables.
   - *Resolution*: The Celery lifecycle test must use a file-backed temporary database (`sqlite+aiosqlite:///{temp_file.name}`) or `ALAGA_POSTGRES_TEST_URL` (when available) so multiple engine instances share the exact same table data.
2. **SlowAPI Storage Reset**:
   - SlowAPI stores moving window keys in memory. Integration tests modifying `limiter.enabled = True` must reset `limiter.reset()` before and after execution to ensure no cross-test contamination.
3. **Timezones in Cutoff**:
   - `cancel_stale_pending_bookings` uses `datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)`. Stale test bookings must use timezone-aware UTC timestamps (`datetime.now(timezone.utc) - timedelta(minutes=20)`).

---

## 4. Conclusion & Complete Test Specifications

Milestone 1 test strategy is divided into two comprehensive test files:
1. `backend/tests/test_rate_limit.py` — Unit tests for `get_client_ip` and router integration tests for proxy isolation.
2. `backend/tests/test_celery_lifecycle.py` — Multi-run event-loop resiliency, state transition, and cleanup verification.

### 4.1 Specification for `backend/tests/test_rate_limit.py`

```python
"""
Tests for Proxy-Safe Client IP Rate Limiting (Milestone 1 / Requirement R1)
Covers:
- get_client_ip unit tests (rightmost hop, spoofing prevention, whitespace, fallback, proxy trust flag)
- Router rate limit integration tests with independent IP buckets behind reverse proxy
"""

import pytest
from starlette.requests import Request
from httpx import AsyncClient

from app.config import settings
from app.core.rate_limit import get_client_ip, limiter

pytestmark = pytest.mark.asyncio


def _make_request(headers: list[tuple[bytes, bytes]] | None = None, client: tuple[str, int] | None = ("10.0.0.1", 12345)) -> Request:
    """Helper to build a Starlette Request with specific ASGI scope headers and client."""
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/auth/signup",
        "headers": headers or [],
        "client": client,
    }
    return Request(scope)


# ============================================================================
# 1. UNIT TESTS: get_client_ip
# ============================================================================

def test_get_client_ip_rightmost_hop_single_ip(monkeypatch):
    """When X-Forwarded-For contains a single IP, extract that IP when proxy headers are trusted."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req = _make_request(headers=[(b"x-forwarded-for", b"203.0.113.195")])
    assert get_client_ip(req) == "203.0.113.195"


def test_get_client_ip_rightmost_hop_multi_hop_chain(monkeypatch):
    """When X-Forwarded-For contains multiple proxies/hops, extract the rightmost hop appended by the proxy."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req = _make_request(headers=[(b"x-forwarded-for", b"198.51.100.1, 10.0.0.1, 203.0.113.195")])
    assert get_client_ip(req) == "203.0.113.195"


def test_get_client_ip_prefix_spoofing_prevention(monkeypatch):
    """
    Client prepends arbitrary spoofed IPs to X-Forwarded-For.
    The trusted reverse proxy appends the true remote address at the end.
    get_client_ip must strictly take the rightmost hop and ignore the spoofed prefix.
    """
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    # Attacker attempts to spoof 1.2.3.4
    req1 = _make_request(headers=[(b"x-forwarded-for", b"1.2.3.4, 203.0.113.195")])
    assert get_client_ip(req1) == "203.0.113.195"

    # Attacker attempts to rotate spoofed prefix to 5.6.7.8
    req2 = _make_request(headers=[(b"x-forwarded-for", b"5.6.7.8, 9.9.9.9, 203.0.113.195")])
    assert get_client_ip(req2) == "203.0.113.195"


def test_get_client_ip_whitespace_and_empty_entries(monkeypatch):
    """Handle irregular whitespace and trailing commas in X-Forwarded-For gracefully."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req1 = _make_request(headers=[(b"x-forwarded-for", b"  1.1.1.1  ,   203.0.113.195   ")])
    assert get_client_ip(req1) == "203.0.113.195"

    # Trailing comma with empty segment
    req2 = _make_request(headers=[(b"x-forwarded-for", b"1.1.1.1, 203.0.113.195,  ")])
    assert get_client_ip(req2) == "203.0.113.195"


def test_get_client_ip_fallback_to_client_host_when_header_absent(monkeypatch):
    """When X-Forwarded-For is missing or empty, fall back to request.client.host."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req1 = _make_request(headers=[], client=("192.168.1.55", 50000))
    assert get_client_ip(req1) == "192.168.1.55"

    req2 = _make_request(headers=[(b"x-forwarded-for", b"   ")], client=("192.168.1.55", 50000))
    assert get_client_ip(req2) == "192.168.1.55"


def test_get_client_ip_fallback_when_client_is_none(monkeypatch):
    """When request.client is None and no header is present, safely return 127.0.0.1."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req = _make_request(headers=[], client=None)
    assert get_client_ip(req) == "127.0.0.1"


def test_get_client_ip_untrusted_proxy_headers(monkeypatch):
    """
    When TRUST_PROXY_HEADERS is False (development/test environment):
    X-Forwarded-For headers MUST BE IGNORED to prevent client IP spoofing locally.
    Must return request.client.host.
    """
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", False)
    req = _make_request(
        headers=[(b"x-forwarded-for", b"203.0.113.195")],
        client=("127.0.0.1", 54321),
    )
    assert get_client_ip(req) == "127.0.0.1"


def test_trust_proxy_headers_environment_defaults(monkeypatch):
    """Verify computed trust_proxy_headers defaults according to ENVIRONMENT."""
    # Reset explicit override
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", None)

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    assert settings.trust_proxy_headers is True

    monkeypatch.setattr(settings, "ENVIRONMENT", "staging")
    assert settings.trust_proxy_headers is True

    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    assert settings.trust_proxy_headers is False

    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    assert settings.trust_proxy_headers is False

    # Explicit override takes precedence over ENVIRONMENT
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    assert settings.trust_proxy_headers is True

    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", False)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    assert settings.trust_proxy_headers is False


# ============================================================================
# 2. INTEGRATION TESTS: Router Rate Limiting with Proxy Isolation
# ============================================================================

async def test_router_rate_limiting_proxy_ip_isolation(async_client: AsyncClient, monkeypatch):
    """
    Integration test showing two requests with different rightmost IPs receive independent limits:
    - Client A exhausts its limit (5 requests / 15 min on /auth/signup).
    - Client A's 6th request is blocked with HTTP 429.
    - Client B with a different rightmost IP receives HTTP 201 (independent limit).
    - Client A attempting to spoof a different prefix is STILL blocked with HTTP 429.
    """
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    limiter.enabled = True
    limiter.reset()

    try:
        client_a_ip = "203.0.113.195"
        client_b_ip = "198.51.100.22"

        # Client A data
        signup_a = {
            "full_name": "Client A",
            "email": "client_a@example.com",
            "password": "Password123",
            "website": "http://honeypot.fast",  # returns 201 instantly without DB overhead
            "captcha_token": "dummy",
        }

        # Client A sends 5 requests with spoofed prefix + real IP
        for _ in range(5):
            resp = await async_client.post(
                "/auth/signup",
                json=signup_a,
                headers={"X-Forwarded-For": f"1.1.1.1, {client_a_ip}"},
            )
            assert resp.status_code == 201

        # Client A's 6th request should hit rate limit (429)
        resp_a_blocked = await async_client.post(
            "/auth/signup",
            json=signup_a,
            headers={"X-Forwarded-For": f"1.1.1.1, {client_a_ip}"},
        )
        assert resp_a_blocked.status_code == 429
        assert "Rate limit exceeded" in resp_a_blocked.json().get("detail", resp_a_blocked.json().get("error", ""))

        # Client B sends a request with the SAME spoofed prefix but DIFFERENT rightmost IP
        signup_b = {
            "full_name": "Client B",
            "email": "client_b@example.com",
            "password": "Password123",
            "website": "http://honeypot.fast",
            "captcha_token": "dummy",
        }
        resp_b = await async_client.post(
            "/auth/signup",
            json=signup_b,
            headers={"X-Forwarded-For": f"1.1.1.1, {client_b_ip}"},
        )
        # Client B must NOT be rate limited
        assert resp_b.status_code == 201

        # Client A attempts to bypass rate limit by rotating spoofed prefix
        resp_a_bypass_attempt = await async_client.post(
            "/auth/signup",
            json=signup_a,
            headers={"X-Forwarded-For": f"9.9.9.9, {client_a_ip}"},
        )
        # Must STILL be blocked because rightmost IP matches Client A's exhausted bucket
        assert resp_a_bypass_attempt.status_code == 429

    finally:
        limiter.enabled = False
        limiter.reset()


async def test_router_rate_limiting_untrusted_headers_share_client_bucket(async_client: AsyncClient, monkeypatch):
    """
    When TRUST_PROXY_HEADERS is False, X-Forwarded-For headers are ignored.
    Requests with different X-Forwarded-For headers share the local client host bucket.
    """
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", False)
    limiter.enabled = True
    limiter.reset()

    try:
        signup_data = {
            "full_name": "Untrusted Proxy User",
            "email": "untrusted@example.com",
            "password": "Password123",
            "website": "http://honeypot.fast",
            "captcha_token": "dummy",
        }

        # Send 5 requests alternating fake XFF headers
        for i in range(5):
            resp = await async_client.post(
                "/auth/signup",
                json=signup_data,
                headers={"X-Forwarded-For": f"10.0.0.{i}"},
            )
            assert resp.status_code == 201

        # 6th request with yet another XFF header should STILL hit 429 because host IP is shared
        resp_blocked = await async_client.post(
            "/auth/signup",
            json=signup_data,
            headers={"X-Forwarded-For": "10.0.0.99"},
        )
        assert resp_blocked.status_code == 429

    finally:
        limiter.enabled = False
        limiter.reset()
```

---

### 4.2 Specification for `backend/tests/test_celery_lifecycle.py`

```python
"""
Tests for Celery Stale Bookings Sweeper Task Event-Loop Resiliency (Milestone 1 / Requirement R1)
Covers:
- Repeated invocations (at least 3 consecutive calls) of expire_stale_bookings_task in the same process
- Verification that no event loop mismatch or closed loop errors occur
- Verification of engine disposal and clean resource teardown
- Live PostgreSQL verification when ALAGA_POSTGRES_TEST_URL is provided
"""

import os
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

import app.models
from app.config import settings
from app.db.base import Base
from app.models import User, CounselorProfile, Booking, BookingStatus, RoleEnum
from app.tasks.reminders import expire_stale_bookings_task

pytestmark = pytest.mark.asyncio


@pytest.fixture
def temp_db():
    """
    Sets up a file-backed SQLite database (or uses ALAGA_POSTGRES_TEST_URL if configured).
    A file-backed database ensures that multiple independent AsyncEngine instances created
    by separate expire_stale_bookings_task invocations can access the same persistent tables.
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
    Verify that expire_stale_bookings_task can be invoked repeatedly (at least 3 consecutive calls)
    in the same process without raising RuntimeError (event loop closed / attached to different loop).
    Verifies state transitions and idempotency across invocations.
    """
    db_url = temp_db

    # Seed data: 1 counselor, 1 client, 1 stale pending booking, 1 recent pending booking, 1 confirmed booking
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
            cl_user = User(
                email=f"client_{uuid.uuid4()}@example.com",
                full_name="Client Sweeper",
                password_hash="unused",
                role=RoleEnum.client,
                is_verified=True,
            )
            db.add_all([c_user, cl_user])
            await db.flush()

            counselor = CounselorProfile(user_id=c_user.id, is_active=True, is_verified=True)
            db.add(counselor)
            await db.flush()

            now = datetime.now(timezone.utc)
            # Stale booking: created 25 minutes ago (threshold is 15 minutes)
            b_stale = Booking(
                id=f"stale_{uuid.uuid4()}",
                client_id=cl_user.id,
                counselor_id=counselor.id,
                scheduled_start=now + timedelta(days=2),
                scheduled_end=now + timedelta(days=2, hours=1),
                status=BookingStatus.pending_payment,
                created_at=now - timedelta(minutes=25),
            )
            # Fresh booking: created 5 minutes ago (must NOT be cancelled)
            b_fresh = Booking(
                id=f"fresh_{uuid.uuid4()}",
                client_id=cl_user.id,
                counselor_id=counselor.id,
                scheduled_start=now + timedelta(days=3),
                scheduled_end=now + timedelta(days=3, hours=1),
                status=BookingStatus.pending_payment,
                created_at=now - timedelta(minutes=5),
            )
            # Confirmed booking: created 60 minutes ago (must NOT be cancelled)
            b_confirmed = Booking(
                id=f"confirmed_{uuid.uuid4()}",
                client_id=cl_user.id,
                counselor_id=counselor.id,
                scheduled_start=now + timedelta(days=4),
                scheduled_end=now + timedelta(days=4, hours=1),
                status=BookingStatus.confirmed,
                created_at=now - timedelta(minutes=60),
            )
            db.add_all([b_stale, b_fresh, b_confirmed])
            await db.commit()

        await engine.dispose()
        return b_stale.id, b_fresh.id, b_confirmed.id, counselor.id, cl_user.id

    import asyncio
    stale_id, fresh_id, confirmed_id, counselor_id, client_id = asyncio.run(_seed())

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
            now = datetime.now(timezone.utc)
            b_stale2 = Booking(
                id=f"stale2_{uuid.uuid4()}",
                client_id=client_id,
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
    from sqlalchemy.ext.asyncio import AsyncEngine

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
        with patch("app.services.booking_service.cancel_stale_pending_bookings", side_effect=RuntimeError("DB Transient Failure")):
            with pytest.raises(RuntimeError, match="DB Transient Failure"):
                expire_stale_bookings_task()
            # Must still have disposed the engine in finally:
            assert disposed_count == 2
```

---

## 5. Verification Method

### 5.1 Verification Commands
1. **Run New Milestone 1 Test Suite**:
   ```bash
   cd /home/scarecrow/dev/booking_system/backend
   PYTHONPATH=. .venv/bin/pytest tests/test_rate_limit.py tests/test_celery_lifecycle.py -v
   ```
   *Expected Result*: All unit and integration tests pass with 0 failures and 0 warnings about unawaited coroutines or event-loop mismatch.

2. **Run Full Backend Pytest Suite**:
   ```bash
   cd /home/scarecrow/dev/booking_system/backend
   PYTHONPATH=. .venv/bin/pytest tests/
   ```
   *Expected Result*: 50+ passed, 0 failed, 1 skipped (unless PostgreSQL URL is provided).

3. **Live PostgreSQL Verification (Optional / Recommended)**:
   ```bash
   mkdir -p /tmp/pg_test_m1 && initdb -D /tmp/pg_test_m1 -U alaga --auth=trust
   pg_ctl -D /tmp/pg_test_m1 -o "-p 5434 -k /tmp -h 127.0.0.1" start
   createdb -h 127.0.0.1 -p 5434 -U alaga alaga_m1_test
   
   cd /home/scarecrow/dev/booking_system/backend
   ALAGA_POSTGRES_TEST_URL="postgresql+asyncpg://alaga@127.0.0.1:5434/alaga_m1_test" \
     PYTHONPATH=. .venv/bin/pytest tests/test_celery_lifecycle.py -v
     
   pg_ctl -D /tmp/pg_test_m1 stop
   rm -rf /tmp/pg_test_m1
   ```
   *Expected Result*: `test_expire_stale_bookings_task_repeated_consecutive_runs` runs against live PostgreSQL with asyncpg, executing 4 consecutive runs without any `RuntimeError`.

### 5.2 Invalidation Conditions
- If `get_client_ip` extracts `parts[0]` instead of `parts[-1]`, `test_get_client_ip_prefix_spoofing_prevention` and `test_router_rate_limiting_proxy_ip_isolation` will immediately fail.
- If `expire_stale_bookings_task` continues importing global `AsyncSessionLocal` from `app.db.session`, Run 2 of `test_expire_stale_bookings_task_repeated_consecutive_runs` will fail on PostgreSQL with an event-loop mismatch error.
- If `engine.dispose()` is omitted or placed outside `finally:`, `test_expire_stale_bookings_task_engine_disposal_on_success_and_error` will fail.
