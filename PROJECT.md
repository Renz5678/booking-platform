# Project: Alaga Therapy Deployment Readiness Remediation

## Architecture
- **Backend**: FastAPI (`backend/app/`) with SQLAlchemy 2.0 (asyncio + PostgreSQL), Celery background tasks (`backend/app/tasks/`), and transactional Outbox service (`backend/app/services/outbox.py`).
- **Frontend**: Next.js 14+ (`frontend-landing/`) with React, TypeScript, and Tailwind CSS.
- **Data Flow**:
  - Reverse proxy (Render) -> Uvicorn -> FastAPI Middleware (`rate_limit.py`) -> Routers (`auth`, `admin`, `bookings`, `payment_review`, `counselors`, `calendar`).
  - Asynchronous & Scheduled: Celery Beat/Worker (`reminders.py`, `operations.py`) and Outbox worker processing background jobs durably.
  - Database: PostgreSQL (production/staging) and SQLite/PostgreSQL (testing via `ALAGA_POSTGRES_TEST_URL`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Proxy-Safe Client IP Rate Limiting | Add `get_client_ip` parsing rightmost `X-Forwarded-For` when `TRUST_PROXY_HEADERS=True`, fallback to `request.client.host` locally | M1 | Survey 1 (R1) |
| 2 | Celery Event-Loop Resilient Sweeper | Create per-invocation `AsyncEngine` with `dispose()` in `finally:` for `expire_stale_bookings_task` | M1 | Survey 1 (R1) |
| 3 | Payment Rejection Claims Sync | Sync `PaymentClaim` status to `rejected`, set reviewer info and reason, emit `payment.reject` / `payment.approve` AuditEvents | M2 | Survey 2 (R2) |
| 4 | Payment Rejection Hold Expiration | Expire booking hold only if hold deadline has already passed; allow correction if hold active | M2 | Survey 2 (R2) |
| 5 | Review vs Claims Queue Separation | Exclude on-time active review bookings from `/payments/manual/claims/queue` via SQL subquery | M2 | Survey 2 (R2) |
| 6 | Cancellation Under Review Handling | Transition unreviewed payment to `failed`, keep claim `open` in reconciliation, avoid 409 conflict | M2 | Survey 2 (R2) |
| 7 | Accurate Refund Notice in Emails | Compute `refund_pending` from `PaymentStatus.refund_pending`, send GCash notice, omit <24h policy on unpaid bookings | M2 | Survey 2 (R2) |
| 8 | Counselor Email HTML Escaping | HTML-escape `counselor_name`, `reason`, `client_name`, `counselor_email` across all email templates | M3 | Survey 1 (R3) |
| 9 | Durable Outbox for Counselor Emails | Replace `asyncio.create_task` with `outbox_jobs` for counselor invite and rejection emails | M3 | Survey 1 (R3) |
| 10 | Invite Token SHA-256 Hashing | Hash `invite_token` with SHA-256 at rest, lowercase invited emails, keep backward compatibility for raw tokens | M3 | Survey 1 (R3) |
| 11 | Counselor Deactivation Session Revocation | Call `revoke_all` on deactivation and emit `counselor.deactivate` AuditEvent | M3 | Survey 1 (R3) |
| 12 | Counselor RBAC & Onboarding Isolation | Block deactivated verified counselors on `/counselors/me` and `/calendar/`, permit unverified onboarding counselors | M3 | Survey 1 (R3) |
| 13 | Read-Only Lock Hygiene | Remove `.with_for_update()` on `GET /bookings/{id}`, `/ics`, `/receipt` | M4 | Survey 3 (R4) |
| 14 | Admin Bookings Pagination & Bounds | Remove `selectinload(Booking.intake_form)`, add `limit`/`offset` (return `list[AdminBookingResponse]`), Manila timezone filter | M4 | Survey 3 (R4) |
| 15 | Availability freeBusy Cache | In-memory 60s TTL cache in `availability_service.py` with test bypass, live check in `create_booking`, cache invalidation | M4 | Survey 3 (R4) |
| 16 | Admin Analytics Revenue Accuracy | Sum only `PaymentStatus.paid` in `get_analytics` for `total_revenue` and `revenue_by_counselor` | M4 | Survey 3 (R4) |
| 17 | Dead Code & Dependency Removal | Remove `send_session_reminder_task` (and conftest patch), unused tokens in `auth_service.py` (preserving `decode_refresh_token`), remove `secure` & `google-auth-oauthlib` | M4 | Survey 3 (R4) |
| 18 | Frontend Cancellation Copy | Update cancellation modal in `dashboard/bookings/[id]/page.tsx` for GCash 5-10 business days notice | M4 | Survey 3 (R4) |
| 19 | Full Test Suite & PostgreSQL Verification | Ensure 100% tests pass (51 passed, 0 skipped, 0 failed) with live PostgreSQL, frontend tsc/lint/build clean, clean up cluster | M5 | Survey 1-3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | R1 Proxy Rate Limiting & Celery Sweeper | Features 1, 2 | none | DONE |
| M2 | R2 Payment, Claim & Cancellation State | Features 3, 4, 5, 6, 7 | M1 | IN_PROGRESS |
| M3 | R3 Counselor Security & Onboarding | Features 8, 9, 10, 11, 12 | M2 | PLANNED |
| M4 | R4 Locks, Query Bounds, Analytics, Dead Code & Copy | Features 13, 14, 15, 16, 17, 18 | M3 | PLANNED |
| M5 | Final Verification & PostgreSQL Cleanup | Feature 19 | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### Client IP Resolution (`rate_limit.py`)
- `get_client_ip(request: Request) -> str`
- If `settings.TRUST_PROXY_HEADERS` is True and `X-Forwarded-For` header is present: takes rightmost IP (`parts[-1].strip()`).
- Else: returns `request.client.host` (or `"127.0.0.1"` if client is None).

### Celery Task Engine Isolation (`reminders.py`)
- `_sweep()` creates dedicated engine with `NullPool` or explicit disposal in `finally: await engine.dispose()`.

### Payment Review & Claims Sync (`payment_review.py`)
- When `decision == "reject"`:
  - Updates associated open/allocated `PaymentClaim` records to `status="rejected"`, `decision_reason=data.reason`, `reviewed_by=user.id`, `reviewed_at=now`.
  - Records `AuditEvent(action="payment.reject", entity_type="payment", ...)`.
  - If `now >= submission_deadline(booking)`: transitions `booking.status = BookingStatus.cancelled`.
- When `decision == "approve"`:
  - Records `AuditEvent(action="payment.approve", entity_type="payment", ...)`.
- `GET /payments/manual/claims/queue`: excludes claims where `Booking.status == pending_payment` and `Payment.status == review`.
- `GET /payments/manual/{booking_id}/claims`: returns `submission_state` and `rejection_reason`.

### Cancellation State Transitions (`bookings.py`)
- If client cancels `pending_payment` with unreviewed payment (`payment.status == review`):
  - `payment.status = PaymentStatus.failed`
  - Any associated `PaymentClaim` remains in `status="open"`, moving to reconciliation queue.
- `cancellation_email` outbox payload:
  - `"refund_pending"`: boolean, True if manual GCash refund queued (`PaymentStatus.refund_pending`).
  - `"was_paid"`: boolean, True if booking was in confirmed/paid state prior to cancellation.

### Counselor Invitation & Authentication (`admin.py`, `auth.py`)
- `invite_counselor`: email normalized to `lower()`.
- `invite_token`: stored as `hashlib.sha256(raw_token.encode()).hexdigest()`.
- `accept_invite`: verifies against SHA-256 hash or fallback raw token for backward compatibility.
- Email delivery: dispatched via `enqueue(db, ..., "counselor_invite_email", ...)` and `"counselor_rejection_email"`.
- `deactivate_counselor`: calls `await revoke_all(db, counselor.user_id)` and records `AuditEvent(action="counselor.deactivate")`.
- `security.py`: blocks deactivated verified counselors (`profile.is_verified and not profile.is_active`) on all endpoints except `/auth/me` and `/auth/logout`.

### Admin Bookings Contract (`admin.py`)
- Returns `list[AdminBookingResponse]`.
- Parameters: `limit: int = Query(200, ge=1, le=500)`, `offset: int = Query(0, ge=0)`.
- Does NOT execute `selectinload(Booking.intake_form)`.
- Date filters: `date_from` and `date_to` normalized to `Asia/Manila` midnight bounds.

## Code Layout
- `render.yaml`: Render deployment configuration
- `backend/app/core/rate_limit.py`: SlowAPI rate limiting & client IP extraction
- `backend/app/core/config.py`: Application settings (`TRUST_PROXY_HEADERS`)
- `backend/app/core/security.py`: Auth dependencies and counselor RBAC
- `backend/app/tasks/reminders.py`: Celery sweep tasks
- `backend/app/routers/payment_review.py`: Payment review & claim management endpoints
- `backend/app/routers/bookings.py`: Booking queries, creation, and cancellation
- `backend/app/routers/admin.py`: Admin booking management, invitations, counselor lifecycle, analytics
- `backend/app/routers/auth.py`: Authentication, invite acceptance, token refresh
- `backend/app/services/availability_service.py`: Slot availability & Google Calendar cache
- `backend/app/services/email_service.py`: Email formatting & HTML escaping
- `backend/app/services/outbox.py`: Transactional outbox handlers
- `backend/app/services/session_service.py`: Session revocation
- `backend/app/services/auth_service.py`: Authentication utilities
- `backend/requirements.txt`: Python package dependencies
- `backend/tests/`: Pytest test suite
- `frontend-landing/src/app/dashboard/bookings/[id]/page.tsx`: Client booking details & cancellation modal
