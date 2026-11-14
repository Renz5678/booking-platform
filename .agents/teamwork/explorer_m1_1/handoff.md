# Handoff Report — Explorer M1 (Proxy Rate Limiting & Celery Task Sweeper)

**Investigator**: Explorer M1-1  
**Working Directory**: `/home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m1_1`  
**Date**: 2026-10-31T10:42:00Z  
**Milestone**: Milestone 1 (R1: Proxy Rate Limiting & Celery Task Sweeper)  
**Target Files**:
- `render.yaml`
- `backend/app/config.py`
- `backend/app/core/config.py`
- `backend/app/core/rate_limit.py`
- `backend/app/tasks/reminders.py`
- `backend/tests/test_rate_limit.py` (new test file)
- `backend/tests/test_celery_lifecycle.py` (new test file)

---

## 1. Observation

### 1.1 Render Deployment Configuration (`render.yaml:9`)
In `/home/scarecrow/dev/booking_system/render.yaml`:
```yaml
9:     startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-proxy-headers
```
- Line 9 uses `--no-proxy-headers`.
- Direct inspection of Uvicorn's `ProxyHeadersMiddleware` in `.venv/lib/python3.12/site-packages/uvicorn/middleware/proxy_headers.py:32-34`:
  ```python
  def get_trusted_client_host(self, x_forwarded_for_hosts: list[str]) -> str | None:
      if self.always_trust:
          return x_forwarded_for_hosts[0]
  ```
  If Uvicorn's proxy headers middleware is enabled with `--forwarded-allow-ips='*'`, it resolves `scope["client"]` using `x_forwarded_for_hosts[0]` (the **leftmost** hop). This leftmost hop is client-supplied and trivially spoofable by an attacker sending `X-Forwarded-For: 1.2.3.4`.
- Under `--no-proxy-headers`, Uvicorn does not modify `scope["client"]`, meaning `request.client.host` retains the connecting peer IP (the Render ingress proxy IP).

### 1.2 Rate Limiting Key Function Defect (`backend/app/core/rate_limit.py:1-8`)
In `/home/scarecrow/dev/booking_system/backend/app/core/rate_limit.py`:
```python
1: from slowapi import Limiter
2: from slowapi.util import get_remote_address
3: from app.config import settings
4: 
5: # Proxy headers must be trusted only at the deployment proxy boundary.
6: limiter = Limiter(key_func=get_remote_address,
7:                   storage_uri=settings.REDIS_URL if settings.ENVIRONMENT in {"staging", "production"} else "memory://",
8:                   default_limits=["120/minute"], swallow_errors=False)
```
- Line 6 configures `key_func=get_remote_address`.
- In `slowapi.util`:
  ```python
  def get_remote_address(request: Request) -> str:
      if not request.client or not request.client.host:
          return "127.0.0.1"
      return request.client.host
  ```
- Because Uvicorn receives all client traffic through Render's reverse proxy and `--no-proxy-headers` is active, `request.client.host` is identical for **all** incoming requests (e.g. `10.x.x.x`).
- Every client worldwide shares a single rate-limit bucket. When one client exhausts the rate limit on `/auth/login` (5/15min) or `/availability/` (30/min), all other users are locked out with HTTP 429.

### 1.3 Application Configuration (`backend/app/config.py`)
In `/home/scarecrow/dev/booking_system/backend/app/config.py`:
- `Settings(BaseSettings)` currently defines `ENVIRONMENT: str = "development"`.
- It currently **lacks** `TRUST_PROXY_HEADERS`.
- All modules across the codebase import configuration via `from app.config import settings`.
- The directory `backend/app/core/` currently does not contain a `config.py`.

### 1.4 Celery Sweeper Event Loop Mismatch (`backend/app/tasks/reminders.py:50-67`)
In `/home/scarecrow/dev/booking_system/backend/app/tasks/reminders.py`:
```python
50: @celery_app.task(name="app.tasks.reminders.expire_stale_bookings_task")
51: def expire_stale_bookings_task():
...
55:     from app.db.session import AsyncSessionLocal
56:     from app.services.booking_service import cancel_stale_pending_bookings
57:     
58:     async def _sweep():
59:         async with AsyncSessionLocal() as db:
60:             return await cancel_stale_pending_bookings(db, max_age_minutes=15)
61:             
62:     try:
63:         count = _run_async(_sweep())
64:         return f"Swept {count} bookings"
```
- Line 55 imports `AsyncSessionLocal` which is bound to the module-level global engine `app.db.session.engine`.
- `_run_async(_sweep())` calls `asyncio.run()`, which creates a new event loop and closes it when done.
- The global engine retains connections in its pool associated with the closed loop.
- When the Celery task triggers a second time, `asyncio.run()` creates a second event loop, but checking out a connection from the global pool raises `RuntimeError: Task <...> got Future <...> attached to a different loop`.
- In contrast, `backend/app/tasks/operations.py:12-22` correctly manages per-invocation lifecycle:
  ```python
  engine = create_async_engine(settings.DATABASE_URL)
  try:
      await dispatch(async_sessionmaker(engine, expire_on_commit=False))
  finally:
      await engine.dispose()
  ```

### 1.5 Verification of Existing Tests
- Running `PYTHONPATH=. .venv/bin/pytest tests/` in `/home/scarecrow/dev/booking_system/backend` passes 50 tests and skips 1 (`test_postgres_constraints.py` which requires PostgreSQL).
- In `backend/tests/conftest.py:15`, `limiter.enabled = False` is set by default.
- In `backend/tests/test_auth.py:72-94`, `test_rate_limiting` temporarily enables `limiter.enabled = True` to verify that 5 signup requests are allowed and the 6th is rejected with HTTP 429. However, it tests only a single IP without `X-Forwarded-For`.

---

## 2. Logic Chain

### 2.1 Why `--no-proxy-headers` Must Remain in `render.yaml`
1. Render's infrastructure uses an edge proxy that prepends/appends client IP information into `X-Forwarded-For`.
2. Direct client requests can include arbitrary spoofed `X-Forwarded-For` headers (e.g. `X-Forwarded-For: 1.1.1.1`).
3. Render's proxy appends the true remote address to the rightmost position: `X-Forwarded-For: 1.1.1.1, <true_client_ip>`.
4. If Uvicorn's `--proxy-headers` is enabled with `always_trust`, Uvicorn takes `x_forwarded_for_hosts[0]` (the leftmost IP `1.1.1.1`), which is controlled by the attacker and enables trivial rate-limit bypass.
5. With `--no-proxy-headers`, Uvicorn does not alter `scope["client"]`. FastAPI receives the full, untruncated `X-Forwarded-For` header.
6. The application rate limiter can then safely extract the rightmost hop (`parts[-1].strip()`), which was appended by the trusted Render proxy.

### 2.2 Configuration Architecture (`backend/app/config.py` & `backend/app/core/config.py`)
1. In `backend/app/config.py`, add `TRUST_PROXY_HEADERS: bool | None = None`.
2. Using Pydantic V2 `@model_validator(mode="after")`:
   ```python
   @model_validator(mode="after")
   def _resolve_trust_proxy_headers(self) -> "Settings":
       if self.TRUST_PROXY_HEADERS is None:
           self.TRUST_PROXY_HEADERS = self.ENVIRONMENT in {"staging", "production"}
       return self
   ```
3. This guarantees:
   - In `development` and `test` environments: `TRUST_PROXY_HEADERS` is `False`.
   - In `staging` and `production` environments: `TRUST_PROXY_HEADERS` is `True`.
   - Explicit environment variable override (`TRUST_PROXY_HEADERS=true` or `TRUST_PROXY_HEADERS=false`) is respected.
   - Test suites can safely monkeypatch `settings.TRUST_PROXY_HEADERS = True/False`.
4. Create `backend/app/core/config.py` as a re-export module:
   ```python
   from app.config import Settings, settings

   __all__ = ["Settings", "settings"]
   ```
   This satisfies the milestone path requirement while preserving absolute backwards compatibility across all existing files importing `from app.config import settings`.

### 2.3 Extraction Logic in `get_client_ip(request: Request) -> str`
1. **Fallback definition**:
   If `request.client` exists and `request.client.host` is non-empty, use `request.client.host`. Otherwise, use `"127.0.0.1"`.
   This ensures that synthetic ASGI requests, mock objects, or Unix domain sockets never cause `AttributeError` or `TypeError`.
2. **Untrusted proxy headers (`TRUST_PROXY_HEADERS=False`)**:
   In local development and test environments, `X-Forwarded-For` must be ignored completely. Return `fallback`.
3. **Trusted proxy headers (`TRUST_PROXY_HEADERS=True`)**:
   Retrieve the `X-Forwarded-For` header.
   Using `request.headers.getlist("x-forwarded-for")` handles both comma-separated single headers and multiple header lines.
   Join with commas: `raw_xff = ", ".join(xff_list)`.
   Split on `,` and filter out whitespace: `parts = [p.strip() for p in raw_xff.split(",") if p.strip()]`.
   - If `parts` has elements: return `parts[-1]` (the rightmost hop).
   - If `parts` is empty (e.g. `X-Forwarded-For: ""` or `"   ,   "`): fall back to `fallback`.
   - If the header is missing: fall back to `fallback`.

### 2.4 Celery Sweeper Task Fix (`reminders.py`)
1. Celery worker threads run synchronous tasks. Each execution of `_run_async` spins up a new asyncio event loop via `asyncio.run()`.
2. Module-level connection pools (`AsyncSessionLocal`) cannot be shared across multiple event loops.
3. Therefore, `expire_stale_bookings_task` must instantiate a dedicated `AsyncEngine` inside `_sweep()`, create a sessionmaker, and ensure `await engine.dispose()` is called inside a `finally:` block before the event loop closes.
4. This completely eliminates event loop mismatch errors and connection pool leakage across consecutive periodic runs.

---

## 3. Caveats

1. **Proxy Topology Assumption**:
   - The rightmost hop in `X-Forwarded-For` represents the client IP as observed by the immediate upstream reverse proxy (Render).
   - If Cloudflare is placed in front of Render, Render's proxy appends Cloudflare's IP to the rightmost position. However, for Alaga's direct Render deployment, Render acts as the sole ingress proxy, making `parts[-1]` the genuine client IP.
2. **SlowAPI Storage Backend**:
   - In `development` and `test`, `limiter` uses `memory://`.
   - In `production` and `staging`, `limiter` connects to `settings.REDIS_URL`.
   - SlowAPI keys are constructed using the string returned by `get_client_ip`. If `get_client_ip` returns distinct IPs, SlowAPI tracks distinct buckets.
3. **Existing Dead Code**:
   - `send_session_reminder_task` in `reminders.py:35-48` also uses `AsyncSessionLocal`. This function is dead code slated for removal in Milestone 4 (R4). Milestone 1 only modifies `expire_stale_bookings_task`.

---

## 4. Conclusion & Recommended Implementation Strategy

### 4.1 Changes to `render.yaml`
Add explanatory documentation above line 9:
```yaml
    # Use --no-proxy-headers so Uvicorn does not rewrite client IP to the spoofable
    # leftmost X-Forwarded-For hop. Application-level rate limiting (rate_limit.py)
    # securely parses the rightmost proxy hop when TRUST_PROXY_HEADERS is True.
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-proxy-headers
```

### 4.2 Changes to `backend/app/config.py`
In `backend/app/config.py`:
1. Import `model_validator` from `pydantic`.
2. Add `TRUST_PROXY_HEADERS: bool | None = None` to `Settings`.
3. Add `@model_validator(mode="after")` to dynamically set `TRUST_PROXY_HEADERS`:
```python
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET: str
    ...
    ENVIRONMENT: str = "development"
    TRUST_PROXY_HEADERS: bool | None = None
    ...

    @model_validator(mode="after")
    def _resolve_trust_proxy_headers(self) -> "Settings":
        if self.TRUST_PROXY_HEADERS is None:
            self.TRUST_PROXY_HEADERS = self.ENVIRONMENT in {"staging", "production"}
        return self

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
```

### 4.3 Create `backend/app/core/config.py`
Create `backend/app/core/config.py` as a clean re-export:
```python
"""Application settings bridge.

Re-exports configuration from app.config for backwards compatibility.
"""
from app.config import Settings, settings

__all__ = ["Settings", "settings"]
```

### 4.4 Changes to `backend/app/core/rate_limit.py`
Replace the entire file content with:
```python
from starlette.requests import Request
from slowapi import Limiter
from app.config import settings


def get_client_ip(request: Request) -> str:
    """Extract client IP safely across reverse proxies.

    When TRUST_PROXY_HEADERS is enabled (production/staging), extracts the
    rightmost hop from X-Forwarded-For, which is appended by the trusted
    ingress reverse proxy (e.g. Render). Any client-spoofed prefix IPs
    are safely ignored.

    When TRUST_PROXY_HEADERS is False or headers are missing/empty, falls back
    to request.client.host (or '127.0.0.1' if client is None).
    """
    fallback = (
        request.client.host
        if (request.client and request.client.host)
        else "127.0.0.1"
    )

    if getattr(settings, "TRUST_PROXY_HEADERS", False):
        if hasattr(request.headers, "getlist"):
            xff_list = request.headers.getlist("x-forwarded-for")
            raw_xff = ", ".join(xff_list) if xff_list else None
        else:
            raw_xff = request.headers.get("x-forwarded-for")

        if raw_xff:
            parts = [p.strip() for p in raw_xff.split(",") if p.strip()]
            if parts:
                return parts[-1]

    return fallback


limiter = Limiter(
    key_func=get_client_ip,
    storage_uri=settings.REDIS_URL if settings.ENVIRONMENT in {"staging", "production"} else "memory://",
    default_limits=["120/minute"],
    swallow_errors=False,
)

__all__ = ["limiter", "get_client_ip"]
```

### 4.5 Changes to `backend/app/tasks/reminders.py`
Refactor `expire_stale_bookings_task`:
```python
@celery_app.task(name="app.tasks.reminders.expire_stale_bookings_task")
def expire_stale_bookings_task():
    """Periodic task to sweep and cancel stale pending_payment bookings.

    Each synchronous Celery task invocation owns its event loop and connection pool.
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

---

## 5. Verification Method

### 5.1 Unit Tests for `get_client_ip` (`backend/tests/test_rate_limit.py`)
Implement the following comprehensive test cases:
1. **Single IP in X-Forwarded-For** with `TRUST_PROXY_HEADERS=True`:
   - Input: `headers={"x-forwarded-for": "203.0.113.195"}`
   - Expected Output: `"203.0.113.195"`
2. **Multiple IPs (Spoofed prefix) in X-Forwarded-For** with `TRUST_PROXY_HEADERS=True`:
   - Input: `headers={"x-forwarded-for": "198.51.100.1, 10.0.0.1, 203.0.113.195"}`
   - Expected Output: `"203.0.113.195"` (rightmost hop selected)
3. **Multiple X-Forwarded-For header lines**:
   - Input: two header tuples `(b"x-forwarded-for", b"spoofed.ip")`, `(b"x-forwarded-for", b"real.ip")`
   - Expected Output: `"real.ip"`
4. **Whitespace and trailing commas**:
   - Input: `headers={"x-forwarded-for": " 1.2.3.4 , 203.0.113.195 ,   "}`
   - Expected Output: `"203.0.113.195"`
5. **Empty or blank X-Forwarded-For**:
   - Input: `headers={"x-forwarded-for": "   ,   "}` with `request.client.host = "10.0.0.1"`
   - Expected Output: `"10.0.0.1"` (fallback)
6. **Missing X-Forwarded-For header**:
   - Input: `headers={}` with `request.client.host = "10.0.0.1"`
   - Expected Output: `"10.0.0.1"` (fallback)
7. **None request.client**:
   - Input: `headers={}`, `request.client = None`
   - Expected Output: `"127.0.0.1"`
8. **TRUST_PROXY_HEADERS=False (local/test mode)**:
   - Input: `headers={"x-forwarded-for": "203.0.113.195"}`, `request.client.host = "192.168.1.5"`
   - Expected Output: `"192.168.1.5"` (proxy header ignored)

### 5.2 Integration Tests with SlowAPI & HTTP Client (`backend/tests/test_rate_limit.py`)
1. Enable `limiter.enabled = True` and set `settings.TRUST_PROXY_HEADERS = True`.
2. Make 5 requests to `/auth/signup` with header `X-Forwarded-For: 203.0.113.10`. Verify all 5 are processed.
3. Make 6th request with header `X-Forwarded-For: 203.0.113.10`. Verify HTTP 429 RateLimitExceeded.
4. Make 1 request with header `X-Forwarded-For: 203.0.113.20`. Verify it succeeds (distinct IP bucket).
5. Make 1 request with header `X-Forwarded-For: 203.0.113.20, 203.0.113.10` (spoofed prefix attempting to masquerade as .20). Verify HTTP 429 (correctly attributed to bucket .10).

### 5.3 Celery Task Sweeper Multi-Run Test (`backend/tests/test_celery_lifecycle.py`)
1. Invoke `expire_stale_bookings_task()` synchronously 3 consecutive times.
2. Assert that all 3 runs return `"Swept 0 bookings"` (or count of expired bookings) and raise no exceptions.
3. Verify absence of `RuntimeError: Task <...> got Future <...> attached to a different loop`.

### 5.4 Test Execution Commands
Run from `/home/scarecrow/dev/booking_system/backend`:
```bash
# Run rate limit unit and integration tests
PYTHONPATH=. .venv/bin/pytest tests/test_rate_limit.py -v

# Run Celery task lifecycle multi-run test
PYTHONPATH=. .venv/bin/pytest tests/test_celery_lifecycle.py -v

# Run full test suite
PYTHONPATH=. .venv/bin/pytest tests/
```
**Invalidation Condition**:
If any test allows a client to bypass rate limiting by changing the first element in `X-Forwarded-For`, or if `expire_stale_bookings_task` fails on the 2nd run with an event loop error, the verification fails.
