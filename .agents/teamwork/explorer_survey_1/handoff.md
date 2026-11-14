# Handoff Report — Survey Explorer 1

**Task**: Comprehensive read-only survey of R1 (Rate limiting behind Render proxy & Celery stale-booking event-loop lifecycle) and R3 (Counselor email HTML escaping/outbox, invite token SHA-256 hashing & lowercasing, deactivation session revocation & access enforcement).  
**Author**: Survey Explorer 1  
**Timestamp**: 2026-10-31T10:29:00Z  
**Reference Report**: `/home/scarecrow/dev/booking_system/.agents/teamwork/explorer_survey_1/report.md`

---

## 1. Observation

Direct observations with file paths, line numbers, and verbatim code:

1. **Render proxy rate limiting**:
   - `render.yaml:9`: `startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-proxy-headers`
   - `backend/app/core/rate_limit.py:6`: `limiter = Limiter(key_func=get_remote_address, ...)`
   - `slowapi.util.get_remote_address(request)` returns `request.client.host`.
   - `backend/app/config.py:4-47`: `Settings` has no `TRUST_PROXY_HEADERS` configuration attribute.
2. **Celery stale-booking task event-loop lifecycle**:
   - `backend/app/tasks/reminders.py:55-63`:
     ```python
     from app.db.session import AsyncSessionLocal
     from app.services.booking_service import cancel_stale_pending_bookings
     async def _sweep():
         async with AsyncSessionLocal() as db:
             return await cancel_stale_pending_bookings(db, max_age_minutes=15)
     try:
         count = _run_async(_sweep())
     ```
   - `backend/app/db/session.py:5-16`: Module-level `engine = create_async_engine(settings.DATABASE_URL)` bound to `AsyncSessionLocal`.
   - `backend/app/tasks/reminders.py:10-12`: `_run_async(coro)` calls `asyncio.run(coro)`.
   - `backend/app/tasks/operations.py:12-22`: Implements safe per-task engine lifecycle:
     ```python
     engine = create_async_engine(settings.DATABASE_URL)
     try:
         await dispatch(async_sessionmaker(engine, expire_on_commit=False))
     finally:
         await engine.dispose()
     ```
3. **Counselor email HTML escaping & durable delivery**:
   - `backend/app/services/email_service.py:356-360`:
     ```python
     reason_section = (
         f"<p><strong>Reason:</strong> {reason}</p>"
         if reason
         else ""
     )
     ```
     `reason` is completely unescaped.
   - `backend/app/routers/admin.py:118`: `asyncio.create_task(send_counselor_invite_email(data.email, invite_token))`
   - `backend/app/routers/admin.py:173`: `asyncio.create_task(send_counselor_rejection_email(counselor.user.email, reason or ""))`
   - `backend/app/services/outbox.py:29-131`: `execute()` handles `reset_email`, `otp_email`, `payment_instructions_email`, `calendar`, `confirmation_email`, `cancellation_email`, and `reminder`. Handlers for `counselor_invite_email` and `counselor_rejection_email` are absent.
4. **Counselor invite token hashing and email normalization**:
   - `backend/app/models/user.py:44`: `invite_token = Column(String, nullable=True)`
   - `backend/app/routers/admin.py:93-102`: Plaintext `invite_token = secrets.token_urlsafe(32)` is assigned to `new_user.invite_token`. `data.email` is not lowercased.
   - `backend/app/routers/auth.py:139`: `if not user or user.invite_token != data.token:` compares incoming token against plaintext stored token.
5. **Counselor deactivation & RBAC enforcement**:
   - `backend/app/routers/admin.py:186-210`: `deactivate_counselor` sets `counselor.is_active = False` but does not invoke `revoke_all(db, counselor.user_id)` and does not record an `AuditEvent`.
   - `backend/app/services/sessions.py:29-30`: `revoke_all(db, user_id)` marks all `AuthSession` records as `revoked=True`.
   - `backend/app/core/security.py:82-87`:
     ```python
     if user.role.value == "counselor" and not request.url.path.startswith(("/counselors/me", "/calendar/", "/auth/")):
         from app.models.counselor_profile import CounselorProfile
         profile = (await db.execute(select(CounselorProfile).where(CounselorProfile.user_id == user.id))).scalar_one_or_none()
         if not profile or not profile.is_active or not profile.is_verified:
             raise HTTPException(status_code=403, detail="Counselor is not active")
     ```
     Deactivated verified counselors (`profile.is_verified == True and profile.is_active == False`) are exempt from active checks on `/counselors/me/*` and `/calendar/*`.
6. **Test execution**:
   - `PYTHONPATH=. .venv/bin/pytest`: 50 passed, 1 skipped (`test_postgres_constraints.py` skipped because `ALAGA_POSTGRES_TEST_URL` was unset).
   - Ephemeral postgres started on port 5433 with migrations applied: `test_postgres_constraints.py` passed 100%. Total 51 passed, 0 skipped.
   - Frontend `npx tsc --noEmit`: 0 errors. `npm run lint`: 0 errors. `npm run build`: built all routes cleanly.

---

## 2. Logic Chain

1. **R1 Proxy Rate Limiting**:
   - Because Uvicorn runs with `--no-proxy-headers` (`render.yaml:9`), `request.client.host` is Render's internal proxy IP.
   - Because `limiter` uses `get_remote_address` (`rate_limit.py:6`), every client request resolves to the same proxy IP.
   - Therefore, a single rate-limit bucket is shared globally across all clients, allowing one client to lock out the entire user base.
   - Conversely, naively trusting the leftmost IP of `X-Forwarded-For` allows attackers to spoof prefixes.
   - Therefore, Render requires extracting the **rightmost** element of `X-Forwarded-For` only when `TRUST_PROXY_HEADERS` is enabled, falling back to `request.client.host` in local/test environments.

2. **R1 Celery Event-Loop Lifecycle**:
   - `expire_stale_bookings_task` calls `asyncio.run()`, which creates and closes an event loop per execution.
   - Because it imports `AsyncSessionLocal` (`reminders.py:55`), connections attached to the first event loop are reused on subsequent runs.
   - This causes `RuntimeError: Task <...> got Future <...> attached to a different loop` on the second run.
   - Following `operations.py:12-22`, creating a dedicated engine inside `_sweep` and calling `await engine.dispose()` in `finally:` isolates the event-loop lifecycle and prevents PostgreSQL connection leaks.

3. **R3 HTML Escaping & Outbox Delivery**:
   - `send_counselor_rejection_email` directly interpolates admin `reason` into HTML (`email_service.py:357`), enabling stored HTML injection/XSS.
   - `admin.py` lines 118 and 173 use `asyncio.create_task` fire-and-forget, risking email loss on process restart.
   - Adding `counselor_invite_email` and `counselor_rejection_email` to `outbox.py` and enqueueing them transactionally in `admin.py` guarantees at-least-once delivery with exponential retry.

4. **R3 Invite Token Hashing & Email Normalization**:
   - Storing plaintext tokens in `User.invite_token` creates exposure in database dumps/leaks.
   - Admin invitations currently do not lowercase email, causing potential case-mismatch during login/invite acceptance.
   - Hashing `secrets.token_urlsafe(32)` with SHA-256 at rest while supporting both SHA-256 and legacy plaintext in `accept_invite` ensures security without invalidating in-flight invitations.

5. **R3 Counselor Deactivation & Access Enforcement**:
   - Deactivating a counselor in `admin.py:204` only changes `counselor.is_active = False` without revoking active sessions or logging `AuditEvent`.
   - In `security.py:82`, the path check exempts `/counselors/me` and `/calendar/`.
   - Consequently, deactivated verified counselors can still modify profiles, upload files, and connect Google Calendar.
   - Updating `admin.py` to call `revoke_all` and log `AuditEvent`, and refining `security.py` to block `profile.is_verified and not profile.is_active` counselors on all routes except `/auth/me` and `/auth/logout`, closes the access hole while preserving onboarding for `not profile.is_verified` counselors.

---

## 3. Caveats

- **No Caveats on Investigation Scope**: All specified files for R1 and R3 were inspected directly in source code.
- **Assumptions**: Render reverse proxy appends the client IP to the end of `X-Forwarded-For`. This conforms with standard Render load balancer documentation.
- **In-flight Data**: In existing production/staging databases, any in-flight unhashed invite tokens must continue to work; the logic chain explicitly provides a dual-check fallback (`compare_digest` with hash OR raw token).

---

## 4. Conclusion

The current codebase contains confirmed vulnerabilities and reliability gaps in R1 and R3:
1. Global rate-limiting collapse behind Render proxy.
2. Celery `expire_stale_bookings_task` crash on repeated execution due to shared async engine.
3. Stored HTML injection in counselor rejection email and non-durable fire-and-forget email dispatch.
4. Plaintext counselor invite tokens and lack of email lowercasing.
5. Incomplete counselor deactivation (missing `revoke_all`, missing `AuditEvent`, and route access bypass in `security.py`).

These findings and recommended remedies are fully documented in `report.md`.

---

## 5. Verification Method

To independently verify all findings and test fixes:

1. **Verify Backend Tests with Live PostgreSQL**:
   ```bash
   # Launch temporary PostgreSQL cluster
   mkdir -p /tmp/pg_test && initdb -D /tmp/pg_test -U alaga --auth=trust
   pg_ctl -D /tmp/pg_test -o "-p 5433 -k /tmp -h 127.0.0.1" start
   createdb -h 127.0.0.1 -p 5433 -U alaga alaga_test

   # Apply migrations
   cd /home/scarecrow/dev/booking_system/backend
   DATABASE_URL="postgresql+asyncpg://alaga@127.0.0.1:5433/alaga_test" .venv/bin/alembic upgrade head

   # Run test suite
   ALAGA_POSTGRES_TEST_URL="postgresql+asyncpg://alaga@127.0.0.1:5433/alaga_test" PYTHONPATH=. .venv/bin/pytest tests/

   # Clean up cluster
   pg_ctl -D /tmp/pg_test stop
   rm -rf /tmp/pg_test
   ```
2. **Verify Frontend**:
   ```bash
   cd /home/scarecrow/dev/booking_system/frontend-landing
   npx tsc --noEmit
   npm run lint
   npm run build
   ```
3. **Invalidation Conditions**:
   - Any rate-limit test that fails to isolate distinct client IPs when `X-Forwarded-For` contains multiple IPs.
   - Any failure of `expire_stale_bookings_task()` when called consecutively 3+ times in a single process.
   - Any accepted counselor invite where `User.invite_token` stores plaintext.
   - Any deactivated verified counselor who successfully executes `PUT /counselors/me/profile`.
