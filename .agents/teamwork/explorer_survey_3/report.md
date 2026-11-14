# Comprehensive Codebase Survey Report: Requirement R4 & Test Execution Environment

**Author**: Survey Explorer 3  
**Date**: 2026-10-31  
**Project Root**: `/home/scarecrow/dev/booking_system`  
**Focus**: Requirement R4 (Lock hygiene, admin query bounds/pagination/timezone, Google Calendar freeBusy caching, analytics revenue accuracy, dead code & dependency cleanup, frontend cancellation modal copy) and Test Execution Environment (PostgreSQL lifecycle, backend pytest, frontend typechecking/lint/build).

---

## 1. Executive Summary

This survey inspected all code, database query logic, schemas, background tasks, third-party dependencies, frontend UI contracts, and the complete test execution environment for **Requirement R4** of the Alaga Counseling deployment readiness remediation.

Key discoveries during investigation:
1. **Critical Pitfall Avoided (Unused Functions)**: The reference implementation plan proposed removing `decode_refresh_token` from `backend/app/services/auth_service.py`. **Investigation revealed that `decode_refresh_token` is actively used by `backend/app/routers/auth.py:270` (`POST /auth/refresh`) and tested by `backend/tests/test_hardening.py`**. Deleting it would break authentication session refresh platform-wide. `create_verification_token` and `verify_email_token` are genuinely unused and safe to remove.
2. **Critical Test Suite Coupler (Task Removal)**: Removing `send_session_reminder_task` from `backend/app/tasks/reminders.py` will cause an `AttributeError` across the entire pytest suite unless the corresponding mock patch in `backend/tests/conftest.py:51` (`patch("app.tasks.reminders.send_session_reminder_task.apply_async")`) is also removed.
3. **Admin Bookings Compatibility Confirmed**: `frontend-landing/src/app/admin/bookings/page.tsx:40` expects an array (`data || []`). Introducing `limit` and `offset` query parameters while preserving the return type `list[AdminBookingResponse]` ensures 100% backward compatibility with no frontend regressions.
4. **PostgreSQL Environment Lifecycle Solved**: In the container environment, TCP loopback connections between separated subshell processes are isolated, but Unix domain sockets in the workspace succeed immediately. Using `initdb` with Unix domain socket configuration and running PostgreSQL via a persistent background daemon permits full execution of `test_postgres_constraints.py` (which requires `ALAGA_POSTGRES_TEST_URL`), achieving **51 passed, 0 skipped, 0 failed** across the test suite.

---

## 2. Requirement R4 Detailed Findings & Current State

### 2.1 Database Lock Hygiene on Read-Only Endpoints

#### Current Implementation & File Locations
- **`backend/app/routers/bookings.py:251-292` (`get_booking_detail`)**:
  ```python
  261:     result = await db.execute(
  262:         select(Booking)
  263:         .options(
  264:             selectinload(Booking.counselor).selectinload(CounselorProfile.user),
  265:             selectinload(Booking.client),
  266:             selectinload(Booking.intake_form),
  267:             selectinload(Booking.payment),
  268:         )
  269:         .where(Booking.id == booking_id).with_for_update()
  270:     )
  ```
- **`backend/app/routers/bookings.py:294-342` (`download_booking_ics`)**:
  ```python
  304:     result = await db.execute(
  305:         select(Booking)
  306:         .options(
  307:             selectinload(Booking.counselor).selectinload(CounselorProfile.user),
  308:             selectinload(Booking.client),
  309:         )
  310:         .where(Booking.id == booking_id).with_for_update()
  311:     )
  ```
- **`backend/app/routers/bookings.py:679-708` (`download_receipt`)**:
  ```python
  689:     result = await db.execute(
  690:         select(Booking)
  691:         .options(
  692:             selectinload(Booking.client),
  693:             selectinload(Booking.counselor).selectinload(CounselorProfile.user),
  694:             selectinload(Booking.payment),
  695:         )
  696:         .where(Booking.id == booking_id).with_for_update()
  697:     )
  ```

#### Problem Analysis
Every read request to `GET /bookings/{id}` (polled every 5 seconds on client payment wait pages), `GET /bookings/{id}/ics`, and `GET /bookings/{id}/receipt` acquires an exclusive row lock (`SELECT ... FOR UPDATE`).
- This blocks concurrent client polling, admin queue lookups, background Celery sweeps, and payment status updates.
- In `download_booking_ics` and `download_booking_receipt`, locking is completely gratuitous as these endpoints only format static calendar files or in-memory PDF receipts.

#### Recommended Implementation
1. Remove `.with_for_update()` on lines 269, 310, and 696 of `backend/app/routers/bookings.py`.
2. In `get_booking_detail`: check if `booking.status == BookingStatus.pending_payment` and its hold deadline has passed (`booking.created_at + timedelta(minutes=15) < datetime.now(timezone.utc)`). Only in that specific expired case, invoke `cancel_stale_pending_bookings(db)` (which safely uses `.with_for_update(skip_locked=True)` internally) or transition to cancelled and commit.
3. For non-expired bookings, active bookings, confirmed sessions, and cancelled sessions, no row lock is ever requested.

---

### 2.2 Admin Bookings Query Bounds, Intake Form Decryption, and Timezone Filtering

#### Current Implementation & File Locations
- **`backend/app/routers/admin.py:242-284` (`get_all_bookings`)**:
  ```python
  260:     query = (
  261:         select(Booking)
  262:         .options(
  263:             selectinload(Booking.client),
  264:             selectinload(Booking.counselor).selectinload(CounselorProfile.user),
  265:             selectinload(Booking.payment),
  266:             selectinload(Booking.intake_form),
  267:         )
  268:         .order_by(Booking.scheduled_start.desc())
  269:     )
  270: 
  271:     if booking_status is not None:
  272:         query = query.where(Booking.status == booking_status)
  273:     if counselor_id is not None:
  274:         query = query.where(Booking.counselor_id == counselor_id)
  275:     if date_from is not None:
  276:         query = query.where(Booking.scheduled_start >= date_from)
  277:     if date_to is not None:
  278:         from datetime import datetime, time, timezone
  279:         end_of_day = datetime.combine(date_to, time.max).replace(tzinfo=timezone.utc)
  280:         query = query.where(Booking.scheduled_start <= end_of_day)
  281: 
  282:     result = await db.execute(query)
  283:     return result.scalars().all()
  ```
- **`backend/app/schemas/booking.py:106-114` (`AdminBookingResponse`)**:
  ```python
  106: class AdminBookingResponse(BookingResponse):
  107:     intake_form: None = None
  108: 
  109:     @model_validator(mode="before")
  110:     @classmethod
  111:     def strip_intake(cls, data: Any) -> Any:
  112:         values = BookingResponse.safe_orm_extract(data)
  113:         return {**values, "intake_form": None}
  ```
- **`frontend-landing/src/app/admin/bookings/page.tsx:38-41`**:
  ```tsx
  38:       const url = `/admin/bookings${statusFilter ? `?status=${statusFilter}` : ""}`;
  39:       const data = await api.get(url);
  40:       setBookings(data || []);
  ```

#### Problem Analysis
1. **Intake Form Overhead & Privacy Risk**: Line 266 executes `selectinload(Booking.intake_form)` for every booking on the platform. Clinical intake forms contain encrypted client psychotherapy notes (`IntakeForm._notes`). The schema `AdminBookingResponse` explicitly strips intake forms (`intake_form: None = None`). Loading these models incurs unneeded database join queries, memory allocation, and decryption overhead.
2. **Unbounded Queries**: `get_all_bookings` has no `limit` or `offset`. In production with thousands of bookings, this query will exhaust database connection pool memory and cause request timeouts.
3. **Timezone Inconsistency**:
   - `date_from` (line 276) is compared directly as a naive `datetime.date` against a timezone-aware `DateTime(timezone=True)` column `Booking.scheduled_start`.
   - `date_to` (line 279) is converted to UTC end-of-day: `datetime.combine(date_to, time.max).replace(tzinfo=timezone.utc)`. Since the platform operates in Philippine Standard Time (`Asia/Manila`, UTC+8), 23:59:59 UTC represents 07:59:59 the *following day* in Manila. Conversely, `date_from` at 00:00:00 UTC starts at 08:00:00 Manila time, omitting sessions between 00:00 and 08:00 local time.

#### Recommended Implementation
1. Remove `selectinload(Booking.intake_form)` from line 266.
2. Add pagination parameters with sensible defaults and bounds:
   ```python
   limit: int = Query(default=200, ge=1, le=500),
   offset: int = Query(default=0, ge=0),
   ```
   Add `.limit(limit).offset(offset)` to the query.
3. Keep the return type `list[AdminBookingResponse]`. This guarantees frontend compatibility with `frontend-landing/src/app/admin/bookings/page.tsx`.
4. Fix timezone filtering using `ZoneInfo("Asia/Manila")`:
   ```python
   from zoneinfo import ZoneInfo
   PHT = ZoneInfo("Asia/Manila")
   if date_from is not None:
       start_bound = datetime.combine(date_from, time.min, tzinfo=PHT)
       query = query.where(Booking.scheduled_start >= start_bound)
   if date_to is not None:
       end_bound = datetime.combine(date_to, time.max, tzinfo=PHT)
       query = query.where(Booking.scheduled_start <= end_bound)
   ```

---

### 2.3 Google Calendar `freeBusy` Short-TTL Caching

#### Current Implementation & File Locations
- **`backend/app/services/availability_service.py:108-124` (`get_available_slots`)**:
  ```python
  112:     if counselor and counselor.google_calendar_connected and counselor.google_refresh_token:
  113:         from app.core.encryption import decrypt_token
  114:         from app.services.calendar_service import get_google_calendar_busy_intervals
  115:         try:
  116:             refresh_token = decrypt_token(counselor.google_refresh_token)
  117:             gcal_busy = await get_google_calendar_busy_intervals(refresh_token, start_of_range, end_of_range)
  118:             for g_s, g_e in gcal_busy:
  119:                 g_s_utc = g_s.replace(tzinfo=timezone.utc) if g_s.tzinfo is None else g_s.astimezone(timezone.utc)
  120:                 g_e_utc = g_e.replace(tzinfo=timezone.utc) if g_e.tzinfo is None else g_e.astimezone(timezone.utc)
  121:                 booked_intervals.append((g_s_utc, g_e_utc))
  122:         except Exception as e:
  123:             logger.warning("Could not sync Google Calendar busy intervals: %s", e)
  ```
- **`backend/app/routers/bookings.py:128-140` (`create_booking`)**:
  ```python
  129:     is_available = await check_counselor_availability(
  130:         db,
  131:         booking_data.counselor_id,
  132:         start_time,
  133:         end_time,
  134:     )
  ```
  `check_counselor_availability` in `backend/app/services/booking_service.py:85` calls `check_google_calendar_busy(refresh_token, start_time, end_time)`.

#### Problem Analysis
Every public visit to `/availability/{counselor_id}/slots` unconditionally hits Google Calendar's `freeBusy` API. Multiple clients browsing counselor availability hammer Google APIs, subject the service to Google quota throttling (HTTP 429), and add 300–800ms of latency per slot view.
Crucially, however, slot booking (`create_booking`) must NOT use a stale cache; it requires a live check to prevent conflicts.

#### Recommended Implementation
1. Add an in-memory cache in `backend/app/services/availability_service.py`:
   ```python
   import time
   _BUSY_CACHE: dict[tuple[str, str, str], tuple[float, list[tuple[datetime, datetime]]]] = {}
   BUSY_CACHE_TTL = 60  # seconds

   def invalidate_busy_cache(counselor_id: str | None = None) -> None:
       if counselor_id is None:
           _BUSY_CACHE.clear()
       else:
           keys_to_del = [k for k in _BUSY_CACHE if k[0] == counselor_id]
           for k in keys_to_del:
               _BUSY_CACHE.pop(k, None)
   ```
2. In `get_available_slots`:
   - If `settings.ENVIRONMENT == "test"`, bypass cache (or check test environment flag) so unit test mock fixtures observe fresh responses.
   - Cache key: `cache_key = (counselor_id, s_dt.isoformat(), e_dt.isoformat())`.
   - If `cache_key in _BUSY_CACHE` and `now - cached_time < BUSY_CACHE_TTL`, reuse cached busy intervals.
   - Otherwise, fetch live from `get_google_calendar_busy_intervals`, populate `_BUSY_CACHE[cache_key] = (now, gcal_busy)`, and return.
3. Keep `create_booking` and `check_counselor_availability` strictly live and uncached.
4. Hook `invalidate_busy_cache(counselor_id)` into:
   - `create_booking`, `cancel_booking`, `reschedule_booking` in `backend/app/routers/bookings.py`.
   - Google Calendar connection callback in `backend/app/routers/calendar.py:90`.

---

### 2.4 Admin Analytics Revenue Accuracy

#### Current Implementation & File Locations
- **`backend/app/routers/admin.py:291-358` (`get_analytics`)**:
  ```python
  305:     revenue_res = await db.execute(
  306:         select(func.sum(Payment.amount)).where(Payment.status.in_([PaymentStatus.paid, PaymentStatus.refund_pending]))
  307:     )
  308:     total_revenue = float(revenue_res.scalar_one_or_none() or 0.0)
  ...
  322:             func.coalesce(
  323:                 func.sum(case((Payment.status.in_([PaymentStatus.paid, PaymentStatus.refund_pending]), Payment.amount), else_=0.0)),
  324:                 0.0,
  325:             ).label("total_revenue"),
  ```

#### Problem Analysis
Both `total_revenue` and per-counselor `total_revenue` sum payments where `Payment.status in (PaymentStatus.paid, PaymentStatus.refund_pending)`.
When a client cancels a booking and enters the refund queue, the transaction is marked `refund_pending`. Counting `refund_pending` as earned revenue causes financial inflation, incorrect income reporting, and distorted counselor payouts.

#### Recommended Implementation
Update lines 306 and 323 to strictly require `Payment.status == PaymentStatus.paid`:
```python
# Overall totals:
revenue_res = await db.execute(
    select(func.sum(Payment.amount)).where(Payment.status == PaymentStatus.paid)
)

# Per counselor breakdown:
func.coalesce(
    func.sum(case((Payment.status == PaymentStatus.paid, Payment.amount), else_=0.0)),
    0.0,
).label("total_revenue"),
```
Frontend compatibility: The returned dictionary structure and field names (`total_revenue`, `per_counselor_stats`) remain identical.

---

### 2.5 Dead Code and Dependency Cleanup

#### Findings by Component

1. **`backend/app/tasks/reminders.py:35-48` (`send_session_reminder_task`)**:
   - `send_session_reminder_task` and `_send_reminder_if_confirmed` are unused legacy Celery tasks.
   - All session reminders in production are dispatched via durable outbox jobs in `backend/app/services/outbox.py:136-150` (`sweep_reminders`).
   - **Crucial Dependency**: `backend/tests/conftest.py:51` currently contains:
     ```python
     patch("app.tasks.reminders.send_session_reminder_task.apply_async"):
     ```
     When `send_session_reminder_task` is removed from `reminders.py`, line 51 in `conftest.py` **must be removed concurrently**, otherwise `pytest` raises an `AttributeError` on test suite startup.

2. **`backend/app/services/auth_service.py:53-80`**:
   - `create_verification_token` (lines 63-69), `verify_email_token` (lines 71-80), and constant `VERIFICATION_TOKEN_EXPIRE_HOURS = 24` (line 18) are completely unused. Verified by global search: 0 imports across `backend/app/` and `backend/tests/`. Safe to delete.
   - **CRITICAL WARNING ON `decode_refresh_token`**: The reference plan noted removing `decode_refresh_token`. Global grep revealed:
     - `backend/app/routers/auth.py:270` uses `decode_refresh_token(refresh_token)` to validate refresh tokens in the `POST /auth/refresh` endpoint.
     - `backend/tests/test_hardening.py:6,15,16` directly tests `decode_refresh_token`.
     - **Verdict**: Do NOT delete `decode_refresh_token`. Keep it intact.

3. **`backend/requirements.txt`**:
   - `secure==0.3.0` (line 11): Unused. No module in `backend/app` imports `secure`. (All security headers and CSRF cookies are set manually in FastAPI middleware). Safe to remove.
   - `google-auth-oauthlib>=1.2.0` (line 23): Unused by the FastAPI application and background workers. Only used in manual standalone developer script `backend/scripts/get_gmail_token.py`. Safe to remove from production `requirements.txt`.
   - **PayMongo Files**: Confirm whether PayMongo code is unmounted.
     - `backend/app/routers/payments.py` is only mounted in `backend/app/main.py:66-67` when `settings.ENVIRONMENT in {"development", "test"}`. It is already unmounted in `production` and `staging`.
     - Both `backend/app/routers/payments.py` and `backend/app/services/payment_service.py` should be retained for future automated checkout re-enablement, as instructed in `ORIGINAL_REQUEST.md`.

---

### 2.6 Frontend Cancellation Modal UI Copy

#### Current Implementation & File Locations
- **`frontend-landing/src/app/dashboard/bookings/[id]/page.tsx:357-360`**:
  ```tsx
  357:               <p className="text-sm text-on-surface-variant">
  358:                 Are you sure you want to cancel this booking session with {booking.counselor_name || "your counselor"}?
  359:                 If you have completed payment, our team will process your refund according to our cancellation policy.
  360:               </p>
  ```

#### Recommended Implementation
Update the copy to provide clear, actionable guidance regarding the 24-hour notice policy and GCash refund processing timeline:
```tsx
              <p className="text-sm text-on-surface-variant">
                Are you sure you want to cancel this booking session with {booking.counselor_name || "your counselor"}?
                If you cancel more than 24 hours before your session, your booking is eligible for a full refund, which our team will process via GCash within 5–10 business days.
              </p>
```

---

## 3. Test Coverage & Gap Analysis for R4

| Area | Current Test Coverage | Identified Gaps | Recommended New Tests |
|---|---|---|---|
| **Lock Hygiene** | `backend/tests/test_payments.py:67,72` calls `GET /bookings/{id}` and `/receipt` | No test checks `GET /bookings/{id}/ics`; no test asserts that non-expired bookings do not take row locks | Add test verifying `GET /bookings/{id}`, `/ics`, and `/receipt` return 200 without acquiring `FOR UPDATE` lock. |
| **Admin Bookings Decryption** | `backend/tests/test_mfa.py:35` tests admin auth on `/admin/bookings` | No test verifies `intake_form` is not queried; no test checks pagination bounds (`limit`/`offset`) | Add test querying `/admin/bookings?limit=10&offset=0`, asserting response list size and verifying `intake_form is None`. |
| **Admin Bookings Timezone** | No tests for `/admin/bookings?date_from=...&date_to=...` | No test verifies filtering in `Asia/Manila` vs UTC | Add test creating bookings in Manila morning and evening, asserting filtering by PHT dates includes correct bookings. |
| **Google Calendar Caching** | `backend/tests/conftest.py:50` mocks `get_google_calendar_busy_intervals` to `[]` | No test verifies caching of `freeBusy` results or invalidation on booking changes | Add unit test verifying repeated `get_available_slots` calls only call external calendar mock once within TTL, and that `invalidate_busy_cache` clears it. |
| **Admin Analytics Accuracy** | **Zero tests exist** for `GET /admin/analytics` in `backend/tests/` | Complete lack of coverage for analytics endpoint | Add comprehensive test asserting `paid` payments are summed into `total_revenue`, while `refund_pending`, `refunded`, and `failed` payments are excluded. |
| **Dead Code / Conftest** | `test_auth.py`, `test_hardening.py` | Verify removal of `send_session_reminder_task` does not break `conftest.py` | Run full pytest suite after removing task and patch. |

---

## 4. Test Execution Environment Analysis

### 4.1 Backend Environment Details

1. **Python Virtual Environment**:
   - The authoritative project virtual environment is located at `backend/.venv` (Python 3.12.16, pytest 9.2.0, PyJWT 2.15.1).
   - *Note*: There is another directory `backend/venv`, but it lacks `PyJWT` and should not be used.
2. **Environment Variables**:
   - `PYTHONPATH=backend` (or run from `backend/` directory) so `app.*` imports resolve.
   - `ENVIRONMENT=test`
   - `JWT_SECRET=ci-only-signing-secret-at-least-32-characters`
   - `ENCRYPTION_KEY=ci-only-encryption-key-at-least-32-characters`
   - `ALAGA_POSTGRES_TEST_URL`: Required for `test_postgres_constraints.py` to run without skipping.
3. **Database Architecture**:
   - Most tests run against in-memory SQLite (`sqlite+aiosqlite:///:memory:`) via `backend/tests/conftest.py`.
   - `test_postgres_constraints.py` tests PostgreSQL concurrency constraints, overlapping interval exclusions, and slot holding against real PostgreSQL.
4. **PostgreSQL Lifecycle in Container Environment**:
   - System binaries available: `/usr/bin/initdb`, `/usr/bin/postgres`, `/usr/bin/pg_ctl`, `/usr/bin/psql`, `/usr/bin/createdb`.
   - TCP localhost (`127.0.0.1:5432`) is isolated between subshell processes in the sandbox.
   - **Solution**: Unix domain sockets in the workspace.
   - Working setup commands:
     ```bash
     # 1. Initialize temporary data directory
     mkdir -p backend/.pg_test_data
     initdb -D backend/.pg_test_data -A trust -E UTF8

     # 2. Launch postgres daemon
     # Launch via run_command with IsDaemon: true:
     postgres -D $(pwd)/backend/.pg_test_data -p 54321 -k $(pwd)/backend/.pg_test_data -h 127.0.0.1

     # 3. Create test database
     createdb -h $(pwd)/backend/.pg_test_data -p 54321 -U scarecrow alaga_test

     # 4. Run Alembic migrations
     DATABASE_URL="postgresql+asyncpg://scarecrow@/alaga_test?host=$(pwd)/backend/.pg_test_data&port=54321" \
     backend/.venv/bin/alembic -c backend/alembic.ini upgrade head

     # 5. Run pytest
     ALAGA_POSTGRES_TEST_URL="postgresql+asyncpg://scarecrow@/alaga_test?host=$(pwd)/backend/.pg_test_data&port=54321" \
     PYTHONPATH=backend backend/.venv/bin/pytest -v
     ```
   - Verified result: **51 passed, 0 skipped, 0 failed** in 8.16s!
   - Cleanup: Kill daemon task via `manage_task(Action="kill", TaskId=...)` and remove `rm -rf backend/.pg_test_data`.

---

### 4.2 Frontend Tooling Details

1. **Configuration**:
   - Located in `frontend-landing/package.json`.
   - Next.js: `16.4.3`
   - React: `19.2.4`
   - TypeScript: `5.x`
2. **Commands & Verified Baseline**:
   - **Typecheck**: `npx tsc --noEmit` (run inside `frontend-landing/`): Exits with code 0 (0 errors).
   - **Lint**: `npm run lint` (run inside `frontend-landing/`): Exits with code 0 (0 errors, 18 ESLint hook/img warnings).
   - **Build**: `npm run build` (run inside `frontend-landing/`): Executes `next build --webpack`, compiles in ~4.6s, static page collection ~2.6s, page optimization ~9.5s. Exits with code 0 across all 34 routes.

---

## 5. Potential Pitfalls, Side Effects, & Mitigations

| Area | Risk / Side Effect | Mitigation Strategy |
|---|---|---|
| **Auth Service Cleanup** | Accidental deletion of `decode_refresh_token` from `auth_service.py` based on an incorrect plan note | Retain `decode_refresh_token` in `auth_service.py`. It is actively required by `POST /auth/refresh` and `test_hardening.py`. Only delete `create_verification_token` and `verify_email_token`. |
| **Reminder Task Cleanup** | Deleting `send_session_reminder_task` causes `AttributeError` when `conftest.py` tries to patch it | Concurrently remove `patch("app.tasks.reminders.send_session_reminder_task.apply_async")` from `backend/tests/conftest.py:51`. |
| **Admin Bookings Pagination** | Changing return type from array to `{ items, total }` breaks `AdminBookingsPage` (`setBookings(data || [])`) | Retain `response_model=list[AdminBookingResponse]`. Only add optional `limit` and `offset` query parameters. |
| **Availability Caching** | Unit tests observing stale mock Google Calendar results across test cases | Bypass cache when `settings.ENVIRONMENT == "test"` or expose `invalidate_busy_cache()` helper and clear in test teardown. |
| **Availability vs Booking** | Slot hold collisions if `create_booking` reads cached calendar data | Ensure `create_booking` keeps its existing live uncached call to `check_counselor_availability`. |
| **Read-Only Lock Removal** | A genuinely expired `pending_payment` booking remains visible as pending on read | In `get_booking_detail`, check if `booking.status == pending_payment` and `now > deadline`. Only in that specific case, call the sweeper or expire the booking. Non-expired bookings do not take row locks. |
| **PostgreSQL Test Cleanup** | Orphaned PostgreSQL cluster processes or leftover data directories | Manage temporary postgres with daemon lifecycle and execute `rm -rf backend/.pg_test_data` immediately upon test completion. |

---

## 6. Required Verification Commands

For the implementer to verify the changes:

```bash
# 1. Run backend unit tests against SQLite
PYTHONPATH=backend backend/.venv/bin/pytest -q

# 2. Run backend test suite against live PostgreSQL (0 failed, 0 skipped)
# Ensure temporary PostgreSQL is running via Unix domain socket with ALAGA_POSTGRES_TEST_URL:
ALAGA_POSTGRES_TEST_URL="postgresql+asyncpg://scarecrow@/alaga_test?host=$(pwd)/backend/.pg_test_data&port=54321" \
PYTHONPATH=backend backend/.venv/bin/pytest -v

# 3. Frontend Typechecking (0 errors)
cd frontend-landing && npx tsc --noEmit

# 4. Frontend Linting (0 errors)
cd frontend-landing && npm run lint

# 5. Frontend Production Build (0 errors across 34 routes)
cd frontend-landing && npm run build
```
