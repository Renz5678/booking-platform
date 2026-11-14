## 2026-10-31T11:26:27Z
You are Explorer 2 for Milestone 2 (R2: Payment, Claim & Cancellation State Consistency).
Working directory: /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m2_2
Project root: /home/scarecrow/dev/booking_system

MANDATORY: First read /home/scarecrow/dev/booking_system/.agents/teamwork/ORIGINAL_REQUEST.md before starting work.
Also read /home/scarecrow/dev/booking_system/PROJECT.md and survey findings in /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_survey_2/report.md.

Your task:
Analyze and formulate the exact implementation strategy for `backend/app/routers/bookings.py` (`cancel_booking`):
1. Cancellation while Payment is under review or Claim is open:
   - When a booking in `BookingStatus.pending_payment` is cancelled by the client:
     - Check if `payment.status == PaymentStatus.review` or if open/allocated claims exist.
     - If `payment.status == PaymentStatus.review`, transition `payment.status = PaymentStatus.failed` and set `payment.reviewed_at = now`, while keeping associated `PaymentClaim` records in `status = "open"` with `decision_reason = "Client cancelled booking while reference was under review"`.
     - This automatically removes the booking from `/payments/manual/queue` (so admin cannot approve it and get a 409) and moves the claim to `/payments/manual/claims/queue` for admin reconciliation.
2. Refund status calculation:
   - In `cancel_booking`:
     Compute `was_paid = bool(booking.status == BookingStatus.confirmed or (booking.payment and booking.payment.status in (PaymentStatus.paid, PaymentStatus.refund_pending, PaymentStatus.refunded)))`.
     Compute `refund_pending = bool(refund_issued or (booking.payment and booking.payment.status in (PaymentStatus.refund_pending, PaymentStatus.refunded)))`.
     Pass `"refund_pending": refund_pending` and `"was_paid": was_paid` in the `cancellation_email` outbox payload.
     Ensure `BookingCancelResponse(refund_issued=refund_issued)` is preserved so `test_payments.py:85` continues to pass without regression.

Write your analysis and recommendation to /home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m2_2/handoff.md.
When finished, send a message to caller with summary and path to your handoff.
