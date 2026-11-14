## 2026-10-31T11:37:18Z
You are the Worker for Milestone 2 (R2: Manual Payment, Claim, and Booking Cancellation State Consistency).
Working directory: /home/scarecrow/dev/booking_system/.agents/teamwork/worker_m2_1
Project root: /home/scarecrow/dev/booking_system

MANDATORY: First read /home/scarecrow/dev/booking_system/.agents/teamwork/ORIGINAL_REQUEST.md before starting work.
Also read /home/scarecrow/dev/booking_system/PROJECT.md and the explorer handoff reports:
- /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m2_1/handoff.md
- /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m2_2/handoff.md
- /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m2_3/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File ownership:
You exclusively own and may edit:
- backend/app/models/operations.py
- backend/app/routers/payment_review.py
- backend/app/routers/bookings.py
- backend/app/services/email_service.py
- backend/app/services/outbox.py
- backend/tests/test_ledger_and_reconciliation.py
- backend/tests/test_bookings.py

Implementation Tasks:
1. Models compatibility (`backend/app/models/operations.py`):
   - Add property alias / getter & setter on `PaymentClaim`: allow accessing and setting `decision_reason` (aliased to `rejection_reason`) and `reason` (aliased to `rejection_reason`).
   - On `AuditEvent`: ensure `__init__` or properties accept both `actor_id` (stored in `actor_id` or `user_id`) and `target_id` / `entity_id` so callers with either convention work cleanly without schema errors.
2. Payment Rejection & Queue Synchronization (`backend/app/routers/payment_review.py`):
   - In `review_manual_payment` (`review()`):
     - When `data.decision == "reject"`:
       - Update all `PaymentClaim` records for this booking where `status.in_(["open", "allocated"])` to `status = "rejected"`, `rejection_reason = data.reason.strip()`, `reviewed_by = user.id`, `reviewed_at = datetime.now(timezone.utc)`.
       - Check hold deadline: `now = datetime.now(timezone.utc)`. Only if `now >= submission_deadline(booking)`, set `booking.status = BookingStatus.cancelled`. If hold is still valid, keep `booking.status = BookingStatus.pending_payment` to allow client correction.
       - Allow client resubmission in `submit()` (check if payment.status == failed, allow submitting new claim while hold is active).
       - Record `AuditEvent(action="payment.reject", outcome="failed", target_id=payment.id, actor_id=user.id, metadata={"booking_id": booking.id, "reason": data.reason.strip()})`.
     - When `data.decision == "approve"`:
       - Record `AuditEvent(action="payment.approve", ...)` (fix action string from `payment_approve` to `payment.approve`).
   - In `claim_queue()` (`GET /payments/manual/claims/queue`):
     - Exclude claims where booking is currently in active on-time review (`Booking.status == BookingStatus.pending_payment` and `Payment.status == PaymentStatus.review`) using SQL subquery so pagination is not broken.
   - In `own_claims()` (`GET /payments/manual/{booking_id}/claims`):
     - Return `"submission_state": state` in the response dict (matching `"state"`).
     - Return `"rejection_reason": rejection_reason` (from rejected claim's `rejection_reason` or payment's `review_reason`).
     - In the `"claims"` list, include `"reason": c.rejection_reason` in each claim dict.
3. Client Cancellation While Under Review (`backend/app/routers/bookings.py`):
   - In `cancel_booking()`:
     - When `booking.status == BookingStatus.pending_payment`:
       - If `payment and payment.status == PaymentStatus.review`:
         - Set `payment.status = PaymentStatus.failed` and `payment.reviewed_at = datetime.now(timezone.utc)`.
         - Keep associated `PaymentClaim` records in `status = "open"` with `rejection_reason = "Client cancelled booking while reference was under review"`, moving them to `/payments/manual/claims/queue` for admin reconciliation.
     - Calculate refund status:
       - `was_paid = bool(booking.status == BookingStatus.confirmed or (booking.payment and booking.payment.status in (PaymentStatus.paid, PaymentStatus.refund_pending, PaymentStatus.refunded)))`
       - `refund_pending = bool(refund_issued or (booking.payment and booking.payment.status in (PaymentStatus.refund_pending, PaymentStatus.refunded)))`
       - Forward `"refund_pending": refund_pending` and `"was_paid": was_paid` in `cancellation_email` outbox payload.
       - Preserve `BookingCancelResponse(refund_issued=refund_issued)` (so `test_payments.py:85` continues to pass).
4. Cancellation Email Copy & Outbox Delivery (`backend/app/services/email_service.py` & `backend/app/services/outbox.py`):
   - In `backend/app/services/outbox.py`: forward `was_paid` and `refund_pending` from `job.payload` to `send_cancellation_email`.
   - In `backend/app/services/email_service.py` (`send_cancellation_email`):
     - Accept `refund_pending: bool = False, was_paid: bool = False, **kwargs`.
     - If `refund_pending`: render `<p>A full refund is being processed and will appear in your GCash account within 5–10 business days.</p>`.
     - Else if `was_paid and not refund_pending`: render `<p>As per our cancellation policy, no refund will be issued for cancellations made less than 24 hours before the session.</p>`.
     - Else (`not was_paid`): render `""` (no refund text, no penalty clause).
5. Comprehensive Regression Tests:
   - Add the 5 regression tests formulated in `explorer_m2_3/handoff.md` to `backend/tests/test_ledger_and_reconciliation.py` and `backend/tests/test_bookings.py`.
   - Run tests: `PYTHONPATH=. .venv/bin/pytest tests/test_ledger_and_reconciliation.py tests/test_bookings.py tests/test_payments.py`
   - Run full backend test suite: `PYTHONPATH=. .venv/bin/pytest tests/`
   - Ensure all tests pass with 0 failures and 0 regressions.

Write your completion report to `/home/scarecrow/dev/booking_system/.agents/teamwork/worker_m2_1/handoff.md`.
When finished, send a message to caller with summary and path to your handoff.
