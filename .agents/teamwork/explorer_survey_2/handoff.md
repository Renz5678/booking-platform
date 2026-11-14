# Handoff Report: Explorer Survey 2 (Requirement R2)

**Author:** Survey Explorer 2  
**Date:** 2026-10-31  
**Working Directory:** `/home/scarecrow/dev/booking_system/.agents/teamwork/explorer_survey_2`  
**Handoff Type:** Hard  

---

## 1. Observation

1. **Payment Rejection in `backend/app/routers/payment_review.py:131-136`**:
   ```python
   payment.reviewed_by, payment.reviewed_at, payment.review_reason = user.id, datetime.now(timezone.utc), data.reason
   if data.decision == "reject":
       payment.status = PaymentStatus.failed
       if booking.status == BookingStatus.pending_payment:
           booking.status = BookingStatus.cancelled
       await db.commit()
       return payment
   ```
   No `PaymentClaim` records are queried or updated. No `AuditEvent` is recorded when `decision == "reject"`. When `decision == "approve"`, line 159 records `action="payment_approve"` rather than `payment.approve`.
   Furthermore, line 134 unconditionally sets `booking.status = BookingStatus.cancelled` even if `datetime.now(timezone.utc) < submission_deadline(booking)` (15-minute hold).

2. **Claims Summary Endpoint in `backend/app/routers/payment_review.py:414-423`**:
   ```python
   return {
       "state": state,
       "amount": str(payment.amount) if payment else "0.00",
       "submission_deadline": sub_deadline.isoformat(),
       "review_deadline": payment.review_deadline.isoformat() if payment and payment.review_deadline else None,
       "provisioning_status": booking.provisioning_status,
       "meeting_ready": bool(booking.meeting_link and booking.provisioning_status == "ready"),
       "claims": [{"id": c.id, "reference": c.reference, "status": c.status, "created_at": c.created_at.isoformat()} for c in claims],
       "refund": refund_data,
   }
   ```
   The dictionary returns `"state": state`, but does NOT return `"submission_state"` or `"rejection_reason"`. In `claims`, individual claims do not include `reason`.

3. **Claims Queue Selection in `backend/app/routers/payment_review.py:237`**:
   ```python
   rows = (await db.execute(select(PaymentClaim).where(PaymentClaim.status == "open").order_by(PaymentClaim.created_at).offset((page - 1) * 50).limit(51))).scalars().all()
   ```
   Every `PaymentClaim` created on on-time submission has `status="open"`. Because `claim_queue` does not exclude claims whose booking is in `pending_payment` with `Payment.status == review`, active submissions appear simultaneously in `/payments/manual/queue` and `/payments/manual/claims/queue`.

4. **Client Cancellation in `backend/app/routers/bookings.py:383-404`**:
   ```python
   hours_until_session = (scheduled_start - now).total_seconds() / 3600
   refund_issued = False

   if hours_until_session >= 24 and booking.status == BookingStatus.confirmed:
       refund_issued = await refund_payment(booking_id, db)
       if not refund_issued:
           logger.warning(
               "Cancellation for booking %s proceeding without refund due to refund failure.",
               booking_id,
           )

   booking.status = BookingStatus.cancelled
   booking.schedule_version += 1
   from app.services.outbox import booking_job, enqueue
   await booking_job(db, booking, "calendar")
   await enqueue(db, f"cancellation_email:{booking.id}:{booking.schedule_version}", "cancellation_email", {
       "booking_id": booking.id,
       "version": booking.schedule_version,
       "cancelled_by": "client",
       "refund_pending": refund_issued,
   })
   ```
   When `booking.status == BookingStatus.pending_payment`, `Payment` is not loaded or updated. If `payment.status == PaymentStatus.review`, it remains in `review`, leaving the cancelled booking in `/payments/manual/queue`.
   For manual GCash refunds, `refund_payment()` (`payment_service.py:109`) sets `payment.status = PaymentStatus.refund_pending` and creates `VerifiedTransfer`, but returns `False`. Thus `refund_issued` is `False`, passing `"refund_pending": False` to `cancellation_email`.

5. **Cancellation Email Template in `backend/app/services/email_service.py:187-191`**:
   ```python
   refund_note = (
       "<p>A full refund has been processed and will appear in your account within 3–7 business days.</p>"
       if refund_issued
       else "<p>As per our cancellation policy, no refund will be issued for cancellations made less than 24 hours before the session.</p>"
   )
   ```
   Because `refund_issued` is `False` for unpaid bookings and manual GCash cancellations, clients are erroneously told that no refund will be issued because the cancellation was made less than 24 hours before the session.

6. **Test Suite Baseline**:
   - `PYTHONPATH=. .venv/bin/pytest tests/test_ledger_and_reconciliation.py`: 4 passed in 0.68s.
   - `PYTHONPATH=. .venv/bin/pytest tests/`: 50 passed, 1 skipped (`test_postgres_constraints.py` skipped because `ALAGA_POSTGRES_TEST_URL` is unset) in 7.26s.
   - `test_payments.py:85` contains `assert cancelled.json()["refund_issued"] is False`.

---

## 2. Logic Chain

1. **Step 1 (Payment Rejection Desync)**:
   From Observation 1, `review()` changes `payment.status` to `failed` and sets `booking.status = cancelled`, but leaves all `PaymentClaim` rows in `"open"`.
   In `own_claims()` (`payment_review.py:395-398`), `elif any(c.status == "open" for c in claims)` is evaluated before `elif any(c.status == "rejected" for c in claims)`.
   Because the claim remains `"open"`, `own_claims()` returns `state = "reconciliation"` instead of `"rejected"`.
   Therefore, rejecting a manual payment fails to update the claim, leaves the claim in the open queue, and prevents the client from seeing the rejection notice or submitting a correction.

2. **Step 2 (Hold Window Expiration on Rejection)**:
   From Observation 1, line 134 immediately sets `booking.status = BookingStatus.cancelled` on rejection.
   If the admin rejects within the 15-minute window (`now < submission_deadline(booking)`), the hold is terminated prematurely. If the client tries to submit a corrected reference, `submit()` (`payment_review.py:93`) checks `booking.status == BookingStatus.pending_payment`, which fails, forcing the corrected reference into `failed`/reconciliation rather than an active on-time review.
   If the admin rejects after the hold has expired (`now >= submission_deadline(booking)`), the booking should transition to `cancelled` so the slot is released.

3. **Step 3 (Queue Separation)**:
   From Observation 3, `claim_queue()` queries all `PaymentClaim` rows where `status == "open"`.
   Every on-time reference submission creates a `PaymentClaim` in `"open"` status and sets `Payment.status = review`.
   `/payments/manual/queue` returns payments in `review`.
   Therefore, active on-time submissions are simultaneously returned by both `/payments/manual/queue` and `/payments/manual/claims/queue`.
   Filtering claims in SQL using `~PaymentClaim.booking_id.in_(active_review_subquery)` cleanly removes active on-time reviews from the claims queue without breaking pagination.

4. **Step 4 (Cancellation Under Review)**:
   From Observation 4, `cancel_booking()` does not inspect `payment.status` or `PaymentClaim`.
   If a client cancels while payment is in `review`, `payment.status` remains `review`, keeping it in `/payments/manual/queue`. When an admin tries to approve it, line 137 fails with `409 Conflict`.
   Setting `payment.status = failed` and setting `payment.reviewed_at` removes it from `/payments/manual/queue`, while preserving `PaymentClaim.status = "open"` allows it to surface in `/payments/manual/claims/queue` for admin reconciliation and refund verification.

5. **Step 5 (Accurate Refund Status in Cancellation Email)**:
   From Observations 4 and 5, `refund_payment()` returns `False` for manual GCash payments while setting `Payment.status = refund_pending`.
   Passing `refund_pending = bool(refund_issued or (payment and payment.status in (PaymentStatus.refund_pending, PaymentStatus.refunded)))` and `was_paid` in the outbox payload allows `send_cancellation_email()` to:
   - Provide the 5–10 business day GCash refund notice when `refund_pending=True`.
   - Provide the `<24h non-refundable` notice only when `was_paid=True and not refund_pending`.
   - Omit the `<24h` policy notice entirely for unpaid cancellations (`was_paid=False`).
   - Keep `BookingCancelResponse(refund_issued=refund_issued)` unchanged so that `test_payments.py:85` (`assert cancelled.json()["refund_issued"] is False`) continues to pass.

---

## 3. Caveats

1. `BookingStatus.expired` does NOT exist in `app/models/booking.py`. In PostgreSQL, `Booking.status` is stored as `BookingStatus.cancelled`. The string `"expired"` is a synthesized state returned by `own_claims()` (`GET /payments/manual/{booking_id}/claims`) for the frontend contract.
2. The database model for verified funds is named `VerifiedTransfer` in `app/models/operations.py`, not `ManualTransfer`.
3. `Booking` does not have a dedicated `payment_expires_at` column; the hold expiration deadline is determined dynamically by `submission_deadline(booking)` (`min(booking.created_at + 15m, booking.scheduled_start)`).

---

## 4. Conclusion

All requirements for R2 are verified with clear root causes and exact line-level locations:
1. `backend/app/routers/payment_review.py`:
   - In `review()`: Update associated open/allocated claims to `"rejected"` with reason; conditionally expire booking hold only if `now >= submission_deadline(booking)`; record `AuditEvent("payment.reject")` on reject and `AuditEvent("payment.approve")` on approve.
   - In `claim_queue()`: Exclude active on-time reviews via SQL subquery.
   - In `own_claims()`: Return both `submission_state` and `state`, as well as `rejection_reason` and claim-level `reason`.
2. `backend/app/routers/bookings.py`:
   - In `cancel_booking()`: Transition unreviewed payments (`payment.status == review`) to `failed` and annotate open claims with cancellation reason; calculate `refund_pending` from `payment.status` and pass `refund_pending` and `was_paid` to outbox payload.
3. `backend/app/services/outbox.py` & `backend/app/services/email_service.py`:
   - Pass `was_paid` to `send_cancellation_email()`; only emit `<24h non-refundable` notice when `was_paid=True and not refund_pending`; emit GCash 5–10 day refund copy when `refund_pending=True`.
4. Test suite:
   - Add regression tests covering all 5 identified gaps to `test_ledger_and_reconciliation.py` and `test_bookings.py`.

---

## 5. Verification Method

To independently verify the survey findings and eventual fixes:

1. **Test Execution**:
   ```bash
   cd /home/scarecrow/dev/booking_system/backend
   PYTHONPATH=. .venv/bin/pytest tests/test_payments.py tests/test_ledger_and_reconciliation.py tests/test_bookings.py
   PYTHONPATH=. .venv/bin/pytest tests/
   ```
2. **Frontend Type & Lint Check**:
   ```bash
   cd /home/scarecrow/dev/booking_system
   npx --prefix frontend-landing tsc --noEmit
   npm --prefix frontend-landing run lint
   ```
3. **Key File Verification**:
   - Inspect `backend/app/routers/payment_review.py` (lines 131–160, 235–256, 372–424).
   - Inspect `backend/app/routers/bookings.py` (lines 357–410).
   - Inspect `backend/app/services/email_service.py` (lines 175–205).
   - Inspect `backend/app/services/outbox.py` (lines 114–123).

4. **Invalidation Conditions**:
   - If `test_payments.py:85` fails, verify that `BookingCancelResponse.refund_issued` was not unintentionally changed to `True`.
   - If `claim_queue` pagination drops items, verify that the active review exclusion was placed in the SQL `where` clause rather than in Python post-processing.
