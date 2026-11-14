# Original User Request

## 2026-10-31T10:15:20Z

Remediate all 13 deployment-readiness audit findings across the Alaga Therapy mental health booking platform (`backend/` FastAPI + PostgreSQL/Celery and `frontend-landing/` Next.js) so that proxy rate limiting, background task event loops, manual GCash payment/claim/cancellation state transitions, counselor security controls, query locking/performance, and UI copy are production-ready without breaking existing API contracts or test suites.

Working directory: /home/scarecrow/dev/booking_system
Integrity mode: development

Reference material:
- Detailed implementation & side-effect mitigation plan: `/home/scarecrow/.gemini/antigravity/brain/ff5305fd-6c5f-4101-8296-a0eaa6b1ae5a/implementation_plan.md`
- Existing backend test suite: `/home/scarecrow/dev/booking_system/backend/tests/`

## Requirements

### R1. Proxy-Safe Client IP Rate Limiting & Resilient Celery Background Tasks
- Rate limiting must isolate individual client IPs behind a reverse proxy (`X-Forwarded-For` rightmost hop when proxy headers are trusted in production/staging) while falling back safely to `request.client.host` in local/test environments without allowing client-spoofed header prefixes to bypass limits.
- `expire_stale_bookings_task` must run repeatedly across multiple `asyncio.run()` invocations without raising event-loop mismatch errors or leaking database connections.

### R2. Manual Payment, Claim, and Booking Cancellation State Consistency
- Rejecting a manual payment must synchronously transition any associated open/allocated `PaymentClaim` to `rejected` (with `decision_reason`, reviewer metadata, and an `AuditEvent`), expire the booking if its hold deadline has already passed, and ensure `GET /payments/manual/{booking_id}/claims` reports `submission_state = "rejected"` with the rejection reason. Also record an `AuditEvent` (`payment.approve`) when approving an on-time manual payment.
- Active on-time payment submissions (`booking.status == pending_payment` and `payment.status == review`) must appear in `/payments/manual/queue` and not be duplicated in `/payments/manual/claims/queue`.
- Cancelling a `pending_payment` booking that has an unreviewed payment (`payment.status == review`) or open claim must transition the payment out of the active approval queue (`payment.status = failed`) while preserving the `PaymentClaim` as `open` in the reconciliation queue (`/payments/manual/claims/queue`) so admins can verify and refund real transfers.
- Booking cancellation emails must accurately set `refund_pending = True` when a manual GCash booking enters `PaymentStatus.refund_pending`, and must only include the "<24h non-refundable" policy notice when a previously confirmed/paid booking is cancelled without refund eligibility.

### R3. Counselor Security & Onboarding Isolation
- Counselor invitation and rejection emails must HTML-escape all user/admin-supplied strings, normalize invited counselor emails to lowercase, hash `invite_token` with SHA-256 at rest (while keeping backward compatibility for in-flight tokens), and dispatch invite/rejection emails through the durable outbox (`outbox_jobs`) rather than fire-and-forget `asyncio.create_task`.
- Deactivating a verified counselor must immediately revoke all active refresh sessions (`revoke_all`), log an `AuditEvent`, and block deactivated verified counselors (`is_verified == True and is_active == False`) from mutating `/counselors/me` or `/calendar/` while still permitting unverified onboarding counselors (`is_verified == False and is_active == False`) to complete onboarding.

### R4. Database Lock Hygiene, Query Bounds, Analytics Accuracy, Cleanup, & UI Copy
- Read-only booking endpoints (`GET /bookings/{id}`, `/ics`, `/receipt`) must not acquire exclusive `FOR UPDATE` row locks on non-expired bookings.
- `GET /admin/bookings` must not load or decrypt `Booking.intake_form`, must enforce bounded pagination (`limit`/`offset` while preserving the `List[AdminBookingResponse]` return contract), and must filter `date_from`/`date_to` consistently in `Asia/Manila`.
- Public slot availability checks (`get_available_slots`) must cache Google Calendar `freeBusy` results briefly (with test-environment bypass and invalidation on booking/calendar changes) while keeping live uncached checks during `create_booking`.
- Admin revenue analytics (`GET /admin/analytics`) must count only `PaymentStatus.paid` toward earned revenue (`total_revenue` and `revenue_by_counselor`).
- Remove unused dead code (`send_session_reminder_task` in `reminders.py`, unused token helpers in `auth_service.py`) and unused packages (`secure`, `google-auth-oauthlib`) from `backend/requirements.txt` while keeping the dormant PayMongo files unmounted for future use. Update the client cancellation modal in `frontend-landing/src/app/dashboard/bookings/[id]/page.tsx` to state that eligible refunds are processed manually via GCash within 5–10 business days.

## Acceptance Criteria

### Programmatic Verification
- [ ] Full backend `pytest` suite passes against a live PostgreSQL instance (`0 failed, 0 skipped`), including new regression tests covering R1–R4:
  - Proxy IP rate-limit key isolation (`X-Forwarded-For` rightmost hop vs spoofed prefix vs local fallback).
  - Consecutive `expire_stale_bookings_task` runs across multiple `asyncio.run()` calls without loop errors.
  - On-time payment rejection updating `PaymentClaim.status == "rejected"`, expiring past-deadline bookings, and excluding active on-time reviews from `/payments/manual/claims/queue`.
  - Client cancellation while `payment.status == review` moving the submission out of `/payments/manual/queue` into `/payments/manual/claims/queue`.
  - Cancellation email `refund_pending` accuracy for manual GCash bookings and unpaid cancellations.
  - Counselor invite token SHA-256 hashing, email lowercasing, HTML escaping in rejection email, durable outbox queueing, and deactivated verified counselor access/session revocation without breaking unverified counselor onboarding.
- [ ] Frontend `npx tsc --noEmit` exits with `0` errors.
- [ ] Frontend `npm run lint` exits with `0` errors.
- [ ] Frontend `npm run build` succeeds cleanly across all routes.
- [ ] Any temporary PostgreSQL test clusters created during verification are stopped and cleaned up before completion.
