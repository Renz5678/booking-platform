## 2026-10-31T10:43:25Z
You are the Worker for Milestone 1 (R1: Proxy Rate Limiting & Celery Task Sweeper).
Working directory: /home/scarecrow/dev/booking_system/.agents/teamwork/worker_m1_1
Project root: /home/scarecrow/dev/booking_system

MANDATORY: First read /home/scarecrow/dev/booking_system/.agents/teamwork/ORIGINAL_REQUEST.md before starting work.
Also read /home/scarecrow/dev/booking_system/PROJECT.md and the explorer handoff reports:
- /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m1_1/handoff.md
- /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m1_2/handoff.md
- /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m1_3/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File ownership:
You exclusively own and may edit:
- backend/app/config.py
- backend/app/core/config.py
- backend/app/core/rate_limit.py
- render.yaml
- backend/app/tasks/reminders.py
- backend/tests/test_rate_limit.py (new test file)
- backend/tests/test_celery_lifecycle.py (new test file)

Tasks:
1. Rate Limiting Behind Render Reverse Proxy:
   - In `backend/app/config.py`:
     Add `TRUST_PROXY_HEADERS: bool | None = None`. Add model validator so when `TRUST_PROXY_HEADERS` is None, it defaults to True if `ENVIRONMENT in ("production", "staging")` else False.
   - In `backend/app/core/config.py`:
     Re-export `Settings` and `settings` from `app.config`.
   - In `backend/app/core/rate_limit.py`:
     Implement `get_client_ip(request: Request) -> str`:
     - If `settings.TRUST_PROXY_HEADERS` is True:
       Check `request.headers.getlist("x-forwarded-for")`. If present, split by comma, strip whitespace, and take the rightmost hop (`parts[-1].strip()`).
       If `x-forwarded-for` is empty or absent, fall back to `request.client.host` if present, else `"127.0.0.1"`.
     - If `settings.TRUST_PROXY_HEADERS` is False:
       Fall back to `request.client.host` if present, else `"127.0.0.1"`.
     Update `limiter = Limiter(key_func=get_client_ip, ...)`.
   - In `render.yaml`:
     Add clarifying comments explaining why `--no-proxy-headers` is retained on uvicorn (Uvicorn's ProxyHeadersMiddleware takes the spoofable leftmost IP, whereas FastAPI's `get_client_ip` extracts the secure rightmost hop).

2. Celery Stale-Booking Task Event Loop Resiliency:
   - In `backend/app/tasks/reminders.py`:
     In `expire_stale_bookings_task`, update `_sweep()` to:
     - Instantiate a dedicated `engine = create_async_engine(settings.DATABASE_URL)`
     - Create `sessionmaker = async_sessionmaker(engine, expire_on_commit=False)`
     - Run `async with sessionmaker() as db:` and call `await cancel_stale_pending_bookings(db, max_age_minutes=15)`
     - In `finally:`, execute `await engine.dispose()`
     - Ensure no module-level `AsyncSessionLocal` is used inside `_sweep()`.

3. Regression Tests:
   - Create `backend/tests/test_rate_limit.py`:
     - Test `get_client_ip` directly with various headers: rightmost hop selection with multiple IPs, spoofed prefix ignored, single IP, missing header, empty header, client is None, `TRUST_PROXY_HEADERS=True` vs `False`.
     - Test rate limiting on a router/endpoint verifying independent buckets for different rightmost IPs behind proxy, and shared buckets when proxy headers are untrusted.
   - Create `backend/tests/test_celery_lifecycle.py`:
     - Test invoking `expire_stale_bookings_task()` across multiple consecutive calls (at least 3-4 calls) in the same process to verify no event loop errors, no Future attached to different loop errors, and proper disposal.

4. Run Builds and Tests:
   - Run backend tests: `PYTHONPATH=. .venv/bin/pytest tests/test_rate_limit.py tests/test_celery_lifecycle.py`
   - Run full backend test suite: `PYTHONPATH=. .venv/bin/pytest tests/`
   - Verify all tests pass cleanly.

Write your completion report and handoff to `/home/scarecrow/dev/booking_system/.agents/teamwork/worker_m1_1/handoff.md`.
When finished, send a message to caller with summary and path to your handoff.
