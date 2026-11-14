# Handoff Report: Requirement R4 & Test Execution Environment

## 1. Observation

1. **Lock Hygiene**:
   - `backend/app/routers/bookings.py:269`: `get_booking_detail` executes `.where(Booking.id == booking_id).with_for_update()`
   - `backend/app/routers/bookings.py:310`: `download_booking_ics` executes `.where(Booking.id == booking_id).with_for_update()`
   - `backend/app/routers/bookings.py:696`: `download_receipt` executes `.where(Booking.id == booking_id).with_for_update()`
   - `backend/app/services/booking_service.py:112`: `cancel_stale_pending_bookings` uses `.with_for_update(skip_locked=True)` internally when sweeping stale pending bookings.

2. **Admin Bookings Query Bounds & Decryption**:
   - `backend/app/routers/admin.py:266`: `get_all_bookings` executes `selectinload(Booking.intake_form)`
   - `backend/app/schemas/booking.py:106-113`: `AdminBookingResponse` defines `intake_form: None = None` and strips intake form data in `strip_intake`
   - `backend/app/routers/admin.py:242-250`: `get_all_bookings` takes no `limit` or `offset` parameters
   - `backend/app/routers/admin.py:276`: `query.where(Booking.scheduled_start >= date_from)` compares naive date
   - `backend/app/routers/admin.py:279`: `datetime.combine(date_to, time.max).replace(tzinfo=timezone.utc)` converts `date_to` to UTC midnight instead of Manila midnight (`Asia/Manila`, UTC+8)
   - `frontend-landing/src/app/admin/bookings/page.tsx:40`: `setBookings(data || [])` expects `data` to be an array of `Booking`

3. **Google Calendar Caching**:
   - `backend/app/services/availability_service.py:117`: calls `await get_google_calendar_busy_intervals(...)` on every request with no cache
   - `backend/app/routers/bookings.py:129`: `create_booking` calls `check_counselor_availability`, which calls `check_google_calendar_busy` live

4. **Admin Analytics Revenue Accuracy**:
   - `backend/app/routers/admin.py:306`: `where(Payment.status.in_([PaymentStatus.paid, PaymentStatus.refund_pending]))`
   - `backend/app/routers/admin.py:323`: `case((Payment.status.in_([PaymentStatus.paid, PaymentStatus.refund_pending]), Payment.amount), else_=0.0)`

5. **Dead Code & Dependency Cleanup**:
   - `backend/app/tasks/reminders.py:36`: `send_session_reminder_task` is defined; reminders are handled by `outbox.py:136`
   - `backend/tests/conftest.py:51`: `patch("app.tasks.reminders.send_session_reminder_task.apply_async")` patches this task
   - `backend/app/services/auth_service.py:63,71`: `create_verification_token` and `verify_email_token` are defined; grep returned 0 callers outside `auth_service.py`
   - `backend/app/services/auth_service.py:53`: `decode_refresh_token` is defined; `backend/app/routers/auth.py:270` calls `user_id_str = decode_refresh_token(refresh_token)` and `backend/tests/test_hardening.py:15-16` tests it
   - `backend/requirements.txt:11,23`: lists `secure==0.3.0` and `google-auth-oauthlib>=1.2.0`; grep across `backend/app/` returned 0 imports of `secure` or `google_auth_oauthlib`
   - `backend/app/main.py:66-67`: `payments.router` is unmounted in production/staging (`if settings.ENVIRONMENT in {"development", "test"}:`)

6. **Frontend Cancellation UI Copy**:
   - `frontend-landing/src/app/dashboard/bookings/[id]/page.tsx:357-360`: cancellation modal currently states *"If you have completed payment, our team will process your refund according to our cancellation policy."*

7. **Test Execution Environment**:
   - `backend/.venv/bin/pytest`: full suite passed **50 passed, 1 skipped, 40 warnings** against SQLite
   - Skip reason in `backend/tests/test_postgres_constraints.py:10`: `skipif(not os.environ.get("ALAGA_POSTGRES_TEST_URL"))`
   - Verified PostgreSQL test cluster: initialized with `initdb` and connected via Unix domain socket `postgresql+asyncpg://scarecrow@/alaga_test?host=...&port=54321`; migrations applied with `alembic upgrade head`; test suite passed with **51 passed, 0 skipped, 0 failed** in 8.16s
   - Frontend checks: `npx tsc --noEmit` passed (0 errors); `npm run lint` passed (0 errors, 18 warnings); `npm run build` passed (0 errors, 34 static/dynamic routes compiled).

## 2. Logic Chain

1. **Lock Contention**: From Observation 1, read-only queries (`GET /bookings/{id}`, `/ics`, `/receipt`) acquire row-level locks on `Booking`. Eliminating `.with_for_update()` in these queries removes blocking locks on high-frequency reads. Only expired `pending_payment` bookings require state transitions via `cancel_stale_pending_bookings`, which already handles locking with `skip_locked=True`.
2. **Data Exposure & Query Bounds**: From Observation 2, `selectinload(Booking.intake_form)` is loaded by `get_all_bookings` but immediately stripped by `AdminBookingResponse.strip_intake`. Omitting `selectinload` avoids decrypting medical notes and saves database overhead. Adding `limit=200, offset=0` caps memory consumption without modifying the array return type `list[AdminBookingResponse]`, maintaining compatibility with `AdminBookingsPage`.
3. **Timezone Alignment**: From Observation 2, comparing naive dates and UTC end-of-day misaligns date boundaries in UTC+8 (`Asia/Manila`). Explicitly binding `date_from` and `date_to` to `Asia/Manila` midnight boundaries ensures accurate filtering of Philippine sessions.
4. **Calendar Caching vs Live Booking**: From Observation 3, caching Google Calendar `freeBusy` intervals in `get_available_slots` for 60 seconds mitigates quota limits and latency during browsing. Keeping `check_counselor_availability` uncached during `create_booking` maintains concurrency safety against race conditions.
5. **Revenue Accounting**: From Observation 4, including `refund_pending` sums non-earned, queued-for-refund funds into revenue. Filtering strictly on `PaymentStatus.paid` ensures accounting accuracy.
6. **Dead Code Safety**: From Observation 5, deleting `send_session_reminder_task` requires deleting line 51 in `backend/tests/conftest.py` to prevent `AttributeError`. Deleting `create_verification_token` and `verify_email_token` is safe, but `decode_refresh_token` must be kept because `auth.py:270` relies on it for token refresh.
7. **PostgreSQL Environment**: From Observation 7, container network restrictions isolate TCP `127.0.0.1`, but Unix domain sockets succeed. Running temporary PostgreSQL via Unix socket enables running `test_postgres_constraints.py` and meeting the 0-skipped acceptance criterion.

## 3. Caveats

- In `backend/app/routers/bookings.py:560,672`, mutation endpoints re-fetch the booking post-commit with `.with_for_update()`. While technically mutations, these re-fetches post-commit do not need locks either; however, R4 specifically targets read-only endpoints (`GET /bookings/{id}`, `/ics`, `/receipt`).
- Rate limiting (`slowapi`) is disabled during pytest runs by `backend/tests/conftest.py:15` (`limiter.enabled = False`). New unit tests for proxy rate-limiting must enable the limiter locally or test `get_client_ip` directly.

## 4. Conclusion

Requirement R4 is fully surveyed and ready for surgical implementation:
- Read-only endpoints can drop `.with_for_update()` safely.
- Admin bookings endpoint can add `limit`/`offset`, remove `selectinload(Booking.intake_form)`, and apply `Asia/Manila` timezone bounds while keeping `list[AdminBookingResponse]`.
- Availability caching can be added in `availability_service.py` with 60s TTL and test bypass.
- Admin analytics can filter strictly on `PaymentStatus.paid`.
- Unused functions in `auth_service.py` (`create_verification_token`, `verify_email_token`), dead task `send_session_reminder_task` (and conftest patch), and packages `secure` / `google-auth-oauthlib` can be removed. `decode_refresh_token` MUST be preserved.
- Frontend cancellation copy in `dashboard/bookings/[id]/page.tsx` can be updated directly.
- The PostgreSQL test environment is validated and passes 51/51 tests when run with `ALAGA_POSTGRES_TEST_URL`.

## 5. Verification Method

To independently verify:
```bash
# Backend pytest suite (SQLite)
PYTHONPATH=backend backend/.venv/bin/pytest -q

# Backend pytest suite against PostgreSQL (0 failed, 0 skipped):
# 1. Start temporary PostgreSQL via Unix domain socket in backend/.pg_test_data
# 2. Run alembic upgrade head
# 3. Execute:
ALAGA_POSTGRES_TEST_URL="postgresql+asyncpg://scarecrow@/alaga_test?host=$(pwd)/backend/.pg_test_data&port=54321" \
PYTHONPATH=backend backend/.venv/bin/pytest -v

# Frontend validation:
cd frontend-landing
npx tsc --noEmit
npm run lint
npm run build
```
