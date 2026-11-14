## 2026-10-31T11:26:27Z
You are Explorer 1 for Milestone 2 (R2: Payment, Claim & Cancellation State Consistency).
Working directory: /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m2_1
Project root: /home/scarecrow/dev/booking_system

MANDATORY: First read /home/scarecrow/dev/booking_system/.agents/teamwork/ORIGINAL_REQUEST.md before starting work.
Also read /home/scarecrow/dev/booking_system/PROJECT.md and survey findings in /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_survey_2/report.md.

Your task:
Analyze and formulate the exact implementation strategy for `backend/app/routers/payment_review.py`:
1. Payment Rejection:
   - In `review_manual_payment` (`review()`):
     When `data.decision == "reject"`:
     - Query and update all `PaymentClaim` records for this booking with `status in ("open", "allocated")` to `status = "rejected"`, set `decision_reason = data.reason.strip()`, `reviewed_by = user.id`, `reviewed_at = datetime.now(timezone.utc)`.
     - Record `AuditEvent(action="payment.reject", entity_type="payment", entity_id=payment.id, user_id=user.id, metadata={"booking_id": booking.id, "reason": data.reason.strip()})`.
     - Hold deadline check: check `now >= submission_deadline(booking)` (or `booking.payment_expires_at`). ONLY if deadline has already passed, set `booking.status = BookingStatus.cancelled`. If hold is still active, leave `booking.status = BookingStatus.pending_payment` so the client can submit a corrected reference.
     - When `data.decision == "approve"`: record `AuditEvent(action="payment.approve", ...)` (fix existing `payment_approve` string to `payment.approve`).
2. Queue Separation:
   - In `claim_queue()` (`GET /payments/manual/claims/queue`):
     Exclude claims where booking is currently in active on-time review (`Booking.status == BookingStatus.pending_payment` and `Payment.status == PaymentStatus.review`). Use SQL subquery filtering to preserve pagination accuracy.
3. Claims Detail API:
   - In `own_claims()` (`GET /payments/manual/{booking_id}/claims`):
     Ensure the response dictionary includes `submission_state` (matching `state`), `rejection_reason` (from rejected claim's `decision_reason`), and individual claims include `reason = c.decision_reason`.

Write your analysis and recommendation to /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m2_1/handoff.md.
When finished, send a message to caller with summary and path to your handoff.
