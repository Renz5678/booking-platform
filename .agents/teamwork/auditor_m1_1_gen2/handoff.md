# Forensic Audit Report — Milestone 1 (R1: Proxy Rate Limiting & Celery Task Sweeper)

**Auditor**: Forensic Auditor (`auditor_m1_1_gen2`)  
**Target**: Milestone 1 (Proxy Rate Limiting & Celery Task Sweeper)  
**Project Root**: `/home/scarecrow/dev/booking_system`  
**Integrity Mode**: Development (from `ORIGINAL_REQUEST.md`)  
**Verdict**: **CLEAN**  

---

## 1. Observation

### 1.1 Scope of Audited Artifacts
The following files were inspected, traced, and empirically tested:
1. `backend/app/config.py` (lines 31, 43-55): Addition of `TRUST_PROXY_HEADERS: bool | None = None`, Pydantic model validator resolving default to `self.ENVIRONMENT in ("production", "staging")`, and `@property trust_proxy_headers`.
2. `backend/app/core/config.py`: Module cleanly re-exporting `Settings` and `settings` from `app.config`.
3. `backend/app/core/rate_limit.py` (lines 6-49): Implementation of `get_client_ip(request: Request) -> str` and SlowAPI `limiter` binding with `key_func=get_client_ip`.
4. `render.yaml` (lines 9-12): Documentation and retention of `--no-proxy-headers` for Uvicorn web service.
5. `backend/app/tasks/reminders.py` (lines 10-12, 51-73): Refactoring of `_run_async` to direct `asyncio.run(coro)` and `expire_stale_bookings_task` `_sweep()` creating dedicated `create_async_engine(settings.DATABASE_URL)` with `finally: await engine.dispose()`.
6. `backend/tests/test_rate_limit.py` (lines 1-293): 11 unit and integration tests covering IP extraction, prefix spoofing prevention, whitespace/format resilience, environment defaults, and router-level SlowAPI rate-limiting isolation.
7. `backend/tests/test_celery_lifecycle.py` (lines 1-247): 2 tests executing 4 consecutive runs in the same process with persistent database state transitions and explicit engine disposal verification under normal and error conditions.

### 1.2 Prohibited Patterns Check
| Prohibited Pattern | Status | Finding / Evidence |
|---|---|---|
| **Hardcoded test results** | **PASS** | No hardcoded IPs, strings, or fake returns in `rate_limit.py`, `reminders.py`, or `config.py`. Output is computed dynamically. |
| **Facade implementations** | **PASS** | `get_client_ip` and `expire_stale_bookings_task` execute full algorithmic and database logic. |
| **Fabricated verification outputs** | **PASS** | `find . -name '*.log' -o -name '*result*'` returned zero pre-populated verification or log artifacts. |
| **Self-certifying tests** | **PASS** | Tests in `test_rate_limit.py` and `test_celery_lifecycle.py` use end-to-end assertions against real HTTP requests and real database sessions. |
| **Execution delegation** | **PASS** | Uses standard library `asyncio` and existing framework dependencies (`starlette`, `sqlalchemy`, `slowapi`) without prohibited external delegation. |

### 1.3 Behavioral & Empirical Verification Results
1. **Pytest Milestone 1 Suite**:
   Command: `PYTHONPATH=. .venv/bin/pytest tests/test_rate_limit.py tests/test_celery_lifecycle.py -v`
   Result: **13 passed, 4 warnings in 0.67s**.
2. **Live PostgreSQL Verification**:
   Command: Executed with live PostgreSQL cluster on port 5439, ran `alembic upgrade head`, executed `tests/test_rate_limit.py`, `tests/test_celery_lifecycle.py`, and `tests/test_postgres_constraints.py`.
   Result: **14 passed, 4 warnings in 0.62s**. Temporary cluster stopped and cleaned up with zero leftover artifacts.
3. **Full Backend Test Suite**:
   Command: `PYTHONPATH=. .venv/bin/pytest tests/`
   Result: **63 passed, 1 skipped in 8.23s** (0 regressions).
4. **Adversarial Edge Case Probing**:
   - IPv6 parsing (`2001:db8::1`), IPv6 with brackets and port (`[2001:db8::1]:8080`), multiple comma-separated spaces, empty segments: All parsed safely to the exact rightmost hop.
   - Untrusted proxy mode (`TRUST_PROXY_HEADERS=False`): Successfully ignored all attacker-controlled `X-Forwarded-For` inputs, returning `request.client.host` or `"127.0.0.1"`.
   - Celery Sweeper Resiliency: 10 consecutive task sweeps executed against live PostgreSQL `asyncpg` engine without a single event loop mismatch error or connection socket leak.

---

## 2. Logic Chain

1. **Proxy IP Rate Limiting Verification**:
   - Behind Render's ingress reverse proxy, any incoming HTTP request has Render's trusted proxy appending the true client IP to the end of the `X-Forwarded-For` chain.
   - `get_client_ip` splits `raw_xff` on commas, strips whitespace, and selects `parts[-1]` when `TRUST_PROXY_HEADERS` is True.
   - Any client-spoofed IPs appear earlier in the chain (`parts[0]`, `parts[1]`, etc.) and are completely ignored.
   - When running locally or in test environments (`TRUST_PROXY_HEADERS=False`), `get_client_ip` strictly returns `request.client.host` (or `"127.0.0.1"` if `request.client` is None), preventing spoofing in environments without a reverse proxy.
   - The SlowAPI rate limiter binds directly to `get_client_ip`, ensuring independent rate-limit quotas per remote IP behind the proxy while preserving shared host quotas in untrusted local runs.
2. **Celery Task Lifecycle & Engine Disposal**:
   - In synchronous Celery workers, background tasks run inside worker threads where each invocation of `_run_async` creates a new asyncio event loop via `asyncio.run(coro)` and tears it down upon exit.
   - `expire_stale_bookings_task` previously used the global module-level engine, which retained connections in its pool attached to closed event loops, triggering `asyncpg` RuntimeError on subsequent runs.
   - The remediation creates a dedicated `AsyncEngine` inside `_sweep()` and awaits `engine.dispose()` inside a `finally:` block.
   - Because `await engine.dispose()` runs within the same event loop before `asyncio.run()` exits, all underlying connection sockets and event loop handles are cleanly closed.
   - Empirical testing with 10 consecutive invocations on live PostgreSQL verified that each run acquires a clean connection, commits DB changes, disposes cleanly, and avoids loop-attachment errors.

---

## 3. Caveats

1. **Reverse Proxy Topology**:
   Extracting the rightmost hop (`parts[-1]`) assumes that Render's ingress proxy is the final proxy appending the client IP. In Render's architecture, Render's reverse proxy directly forwards to Uvicorn. If an internal proxy mesh or multiple internal hops are introduced in the future, trusted proxy hop depth would need to be parameterized. For the current deployment topology specified in `render.yaml` and `ORIGINAL_REQUEST.md`, rightmost hop extraction is optimal and secure.
2. **Storage Backend**:
   In testing and local development, rate limit storage defaults to `memory://`, requiring test teardown reset (`limiter.reset()`) as properly implemented in `test_rate_limit.py`. In staging and production, `settings.REDIS_URL` is configured for distributed rate limiting.

---

## 4. Conclusion

The Milestone 1 work product satisfies all requirements set forth in `ORIGINAL_REQUEST.md` (R1) and `PROJECT.md` (Features 1 & 2):
- ZERO hardcoded test values, mocking illusions, dummy facades, or shortcuts.
- Rate limiting securely extracts client IPs behind proxies while resisting prefix spoofing.
- Celery `expire_stale_bookings_task` runs reliably across repeated invocations without connection leaks or event loop conflicts.
- All verification commands produce genuine passing outputs against both SQLite and live PostgreSQL.

**Verdict: CLEAN**

---

## 5. Verification Method

To independently reproduce the forensic audit results:

```bash
cd /home/scarecrow/dev/booking_system/backend

# 1. Verify Milestone 1 tests
PYTHONPATH=. .venv/bin/pytest tests/test_rate_limit.py tests/test_celery_lifecycle.py -v

# 2. Verify against live PostgreSQL cluster
bash -c '
set -e
PGDIR="/tmp/pg_audit_verify"
rm -rf "$PGDIR"
mkdir -p "$PGDIR"
initdb -D "$PGDIR" -U alaga --auth=trust > /dev/null
pg_ctl -D "$PGDIR" -o "-p 5441 -k /tmp -h 127.0.0.1" start > /dev/null
createdb -h 127.0.0.1 -p 5441 -U alaga alaga_test
export ALAGA_POSTGRES_TEST_URL="postgresql+asyncpg://alaga@127.0.0.1:5441/alaga_test"
export DATABASE_URL="postgresql+asyncpg://alaga@127.0.0.1:5441/alaga_test"
.venv/bin/alembic upgrade head > /dev/null
PYTHONPATH=. .venv/bin/pytest tests/test_rate_limit.py tests/test_celery_lifecycle.py tests/test_postgres_constraints.py -v
pg_ctl -D "$PGDIR" stop > /dev/null
rm -rf "$PGDIR"
'

# 3. Verify full backend test suite
PYTHONPATH=. .venv/bin/pytest tests/
```

### Invalidation Conditions
- If any test in `test_rate_limit.py` or `test_celery_lifecycle.py` fails.
- If an attacker can spoof the leftmost hop in `X-Forwarded-For` to bypass rate limiting when `TRUST_PROXY_HEADERS=True`.
- If consecutive executions of `expire_stale_bookings_task` trigger `RuntimeError` or leak database connection sockets.
