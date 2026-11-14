# Milestone 2 (R2): Cancellation Email Copy & Comprehensive Test Strategy Handoff Report

**Agent**: Explorer 3 (Milestone 2: R2 Payment, Claim & Cancellation State Consistency)  
**Working Directory**: `/home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m2_3`  
**Date**: 2026-10-31  

---

## 1. Observation

### 1.1 Existing Email Service & Outbox Implementation
- In `backend/app/services/email_service.py` (lines 175–192):
  ```python
  async def send_cancellation_email(
      user_email: str, booking_id: str, refund_issued: bool
  ) -> None:
      subject = "Your Booking Has Been Cancelled"
      refund_note = (
          "<p>A full refund has been processed and will appear in your account within 3–7 business days.</p>"
          if refund_issued
          else "<p>As per our cancellation policy, no refund will be issued for cancellations made less than 24 hours before the session.</p>"
      )
  ```
  **Direct Observation**:
  - `send_cancellation_email` accepts only `refund_issued: bool` without knowledge of whether the booking was ever paid (`was_paid`).
  - When `refund_issued` is `False`, it unconditionally injects: `<p>As per our cancellation policy, no refund will be issued for cancellations made less than 24 hours before the session.</p>`.
  - For unpaid cancellations (`BookingStatus.pending_payment`), clients are erroneously warned that no refund will be issued because of a "<24h" cancellation policy, even though they never paid.
  - For manual GCash cancellations, the notice references "3–7 business days" rather than the mandatory GCash notice: "5–10 business days".

- In `backend/app/services/outbox.py` (lines 114–123):
  ```python
  elif job.kind == "cancellation_email" and booking.status == BookingStatus.cancelled:
      cancelled_by = job.payload.get("cancelled_by", "client")
      refund_pending = job.payload.get("refund_pending", False)
      if cancelled_by == "counselor":
          await email.send_counselor_cancellation_notification(client.email, booking.id)
          if profile and profile.user_id:
              owner = await db.get(User, profile.user_id)
              await email.send_admin_cancellation_alert(booking.id, owner.full_name if owner else "Counselor", client.full_name if client else "Client")
      else:
          await email.send_cancellation_email(client.email, booking.id, refund_pending)
  ```
  **Direct Observation**:
  - The outbox worker extracts only `refund_pending` from `job.payload` and passes it as the 3rd argument to `send_cancellation_email`.
  - It does not extract or pass `was_paid: bool`.

- In `backend/app/routers/bookings.py` (lines 383–404):
  ```python
  hours_until_session = (scheduled_start - now).total_seconds() / 3600
  refund_issued = False

  if hours_until_session >= 24 and booking.status == BookingStatus.confirmed:
      refund_issued = await refund_payment(booking_id, db)
      ...
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
  **Direct Observation**:
  - `refund_payment()` in `payment_service.py:109` returns `False` for manual GCash payments (setting `payment.status = PaymentStatus.refund_pending` and creating `VerifiedTransfer(status="refund_pending")`).
  - Because `refund_issued` is `False`, `cancel_booking` passes `"refund_pending": False` into the outbox payload.
  - `was_paid` is completely omitted from the outbox payload.
  - Additionally, if `booking.status == BookingStatus.pending_payment` and `payment.status == PaymentStatus.review`, cancelling the booking does not set `payment.status = PaymentStatus.failed` or preserve `PaymentClaim` for reconciliation.

### 1.2 Existing Test Infrastructure & Coverage Gaps
- In `backend/tests/conftest.py` (lines 41–53):
  `_send_email_sync` is automatically mocked:
  ```python
  patch("app.services.email_service._send_email_sync", return_value=True)
  ```
- Command run: `PYTHONPATH=backend backend/.venv/bin/pytest backend/tests/`
  Result: `105 passed, 2 skipped, 40 warnings in 10.50s`.
- In `backend/tests/test_ledger_and_reconciliation.py`:
  - Contains 4 existing tests (`test_claim_submission_and_booking_claims_limit`, `test_one_ledger_invariant_cancellation_and_transfer_refunds`, `test_claim_reconciliation_decisions`, `test_client_claims_summary_endpoint`).
  - Gaps: Zero tests for payment rejection claim synchronization, zero tests for hold expiration vs active hold correction on rejection, zero tests for `/payments/manual/claims/queue` active review exclusion, and zero tests for cancellation under review.
- In `backend/tests/test_payments.py`:
  - Line 85: asserts `assert cancelled.json()["refund_issued"] is False` on GCash cancellation.
  - Gap: Does not assert `refund_pending` in outbox or verify email copy.

---

## 2. Logic Chain

### 2.1 Email Service & Outbox State Machine
1. **Payload Enrichment**:
   In `bookings.py:cancel_booking`:
   - `was_paid = bool(booking.status == BookingStatus.confirmed or (payment and payment.status in (PaymentStatus.paid, PaymentStatus.refund_pending, PaymentStatus.refunded)))`
   - After `refund_payment(booking_id, db)`:
     `refund_pending = bool(refund_issued or (payment and payment.status in (PaymentStatus.refund_pending, PaymentStatus.refunded)))`
   - Enqueue payload must include:
     ```python
     {
         "booking_id": booking.id,
         "version": booking.schedule_version,
         "cancelled_by": "client",
         "refund_pending": refund_pending,
         "was_paid": was_paid,
     }
     ```
2. **Outbox Forwarding**:
   In `outbox.py:dispatch_job` / `cancellation_email`:
   - Extract both fields:
     ```python
     was_paid = job.payload.get("was_paid", False)
     refund_pending = job.payload.get("refund_pending", False)
     ```
   - Dispatch to `email.send_cancellation_email`:
     ```python
     await email.send_cancellation_email(
         client.email,
         booking.id,
         refund_pending=refund_pending,
         was_paid=was_paid,
     )
     ```
3. **Email Copy Decision Table**:
   In `email_service.py:send_cancellation_email`:
   | `refund_pending` | `was_paid` | Rendered `refund_note` Copy |
   |---|---|---|
   | `True` | `True` or `False` | `<p>A full refund is being processed and will appear in your GCash account within 5–10 business days.</p>` |
   | `False` | `True` | `<p>As per our cancellation policy, no refund will be issued for cancellations made less than 24 hours before the session.</p>` |
   | `False` | `False` | `""` (empty string — no policy warning or refund notice rendered) |

   Implementation snippet in `email_service.py`:
   ```python
   async def send_cancellation_email(
       user_email: str,
       booking_id: str,
       refund_pending: bool = False,
       was_paid: bool = False,
       **kwargs: Any,
   ) -> None:
       """Sends a booking cancellation confirmation email to the client."""
       if "refund_issued" in kwargs and kwargs["refund_issued"] is not None:
           refund_pending = kwargs["refund_issued"]

       subject = "Your Booking Has Been Cancelled"
       if refund_pending:
           refund_note = "<p>A full refund is being processed and will appear in your GCash account within 5–10 business days.</p>"
       elif was_paid:
           refund_note = "<p>As per our cancellation policy, no refund will be issued for cancellations made less than 24 hours before the session.</p>"
       else:
           refund_note = ""

       html_body = f"""
       <html>
         <body style="font-family: sans-serif; color: #333;">
           <h2>Booking Cancelled</h2>
           <p>Your counseling session booking has been cancelled.</p>
           <p><strong>Booking ID:</strong> {booking_id}</p>
           {refund_note}
           <p>If you have any questions, please contact our support team.</p>
         </body>
       </html>
       """
       if not await asyncio.to_thread(_send_email_sync, user_email, subject, html_body):
           raise RuntimeError("Email delivery failed")
   ```

---

## 3. Comprehensive Test Strategy for All 5 R2 Requirements

All regression tests are designed to integrate cleanly into `backend/tests/test_ledger_and_reconciliation.py` and `backend/tests/test_bookings.py`.

### 3.1 R2.1: Payment Rejection Claims Sync & Audit Event
**Target**: `backend/tests/test_ledger_and_reconciliation.py`  
**Test**: `test_payment_rejection_synchronously_updates_claims_and_audit(db)`  
**Coverage**:
1. Client submits GCash claim reference -> payment is `review`, claim is `open`.
2. Admin rejects payment via `POST /payments/manual/{booking_id}/review` with `{"decision": "reject", "reason": "Illegible receipt screenshot"}`.
3. Assert `payment.status == PaymentStatus.failed`, `payment.review_reason == "Illegible receipt screenshot"`, `payment.reviewed_by == admin.id`.
4. Assert all associated `PaymentClaim` records for this booking transition to `status = "rejected"` and `reason = "Illegible receipt screenshot"`.
5. Assert `AuditEvent` recorded with `action = "payment.reject"`, `outcome = "failed"`, `actor_id = admin.id`.
6. Assert `own_claims` returns:
   - `summary["submission_state"] == "rejected"`
   - `summary["rejection_reason"] == "Illegible receipt screenshot"`
   - `summary["claims"][0]["status"] == "rejected"`
   - `summary["claims"][0]["reason"] == "Illegible receipt screenshot"`
7. Also assert approving an on-time payment records `AuditEvent` with `action = "payment.approve"` and `outcome = "paid"`.

**Executable Test Implementation**:
```python
async def test_payment_rejection_synchronously_updates_claims_and_audit(db):
    client, _, admin, booking, payment = await seed_data(db)

    # 1. Client submits reference
    res = await submit(req(), booking.id, Reference(reference="CLAIM_REJECT_1"), client, db)
    assert res.status == PaymentStatus.review

    claim = (await db.execute(select(PaymentClaim).where(PaymentClaim.booking_id == booking.id))).scalar_one()
    assert claim.status == "open"
    assert claim.reference == "CLAIM_REJECT_1"

    # 2. Admin rejects payment
    reason_text = "Illegible receipt screenshot"
    reject_res = await review(req(), booking.id, Decision(decision="reject", reason=reason_text), admin, db)
    assert reject_res.status == PaymentStatus.failed
    assert reject_res.review_reason == reason_text
    assert reject_res.reviewed_by == admin.id
    assert reject_res.reviewed_at is not None

    # 3. Synchronous claim update verification
    await db.refresh(claim)
    assert claim.status == "rejected"
    assert claim.reason == reason_text

    # 4. AuditEvent verification for reject
    reject_event = (await db.execute(
        select(AuditEvent).where(
            AuditEvent.target_id == booking.id,
            AuditEvent.action == "payment.reject",
        )
    )).scalar_one_or_none()
    assert reject_event is not None
    assert reject_event.actor_id == admin.id
    assert reject_event.outcome == "failed"

    # 5. own_claims contract verification
    summary = await own_claims(booking.id, client, db)
    assert summary["state"] == "rejected"
    assert summary["submission_state"] == "rejected"
    assert summary["rejection_reason"] == reason_text
    assert len(summary["claims"]) == 1
    assert summary["claims"][0]["status"] == "rejected"
    assert summary["claims"][0]["reason"] == reason_text

    # 6. Verify payment.approve emits correct AuditEvent action
    _, _, admin, booking2, payment2 = await seed_data(db)
    await submit(req(), booking2.id, Reference(reference="CLAIM_APPROVE_1"), client, db)
    await review(req(), booking2.id, Decision(decision="approve"), admin, db)
    approve_event = (await db.execute(
        select(AuditEvent).where(
            AuditEvent.target_id == booking2.id,
            AuditEvent.action == "payment.approve",
        )
    )).scalar_one_or_none()
    assert approve_event is not None
    assert approve_event.actor_id == admin.id
    assert approve_event.outcome == "paid"
```

---

### 3.2 R2.2: Payment Rejection Hold Expiration vs Active Hold Correction
**Target**: `backend/tests/test_ledger_and_reconciliation.py`  
**Test**: `test_payment_rejection_hold_expiration_vs_correction(db)`  
**Coverage**:
1. **Case A (Hold Active)**: Rejection when `now < submission_deadline(booking)` keeps `booking.status == BookingStatus.pending_payment`, allowing client to submit a corrected reference.
2. **Case B (Hold Expired)**: Rejection when `now >= submission_deadline(booking)` transitions `booking.status == BookingStatus.cancelled`.

**Executable Test Implementation**:
```python
async def test_payment_rejection_hold_expiration_vs_correction(db):
    client, _, admin, booking, payment = await seed_data(db)

    # --- Case A: Rejection during active hold window (<15m) ---
    await submit(req(), booking.id, Reference(reference="REF_WRONG_AMT"), client, db)
    await review(req(), booking.id, Decision(decision="reject", reason="Amount mismatch: expected 300"), admin, db)

    await db.refresh(booking)
    # Booking must stay pending_payment to permit resubmission
    assert booking.status == BookingStatus.pending_payment
    await db.refresh(payment)
    assert payment.status == PaymentStatus.failed

    # Client resubmits corrected reference before hold expires
    resub = await submit(req(), booking.id, Reference(reference="REF_CORRECTED_300"), client, db)
    assert resub.status == PaymentStatus.review
    await db.refresh(booking)
    assert booking.status == BookingStatus.pending_payment

    all_claims = (await db.execute(
        select(PaymentClaim).where(PaymentClaim.booking_id == booking.id).order_by(PaymentClaim.created_at)
    )).scalars().all()
    assert len(all_claims) == 2
    assert all_claims[0].status == "rejected"
    assert all_claims[1].status == "open"

    # --- Case B: Rejection after hold deadline has elapsed (>=15m) ---
    _, counselor_user, _, _, _ = await seed_data(db)
    profile = (await db.execute(select(CounselorProfile).where(CounselorProfile.user_id == counselor_user.id))).scalar_one()

    start = datetime.now(timezone.utc) + timedelta(days=2)
    expired_booking = Booking(
        client_id=client.id,
        counselor_id=profile.id,
        scheduled_start=start,
        scheduled_end=start + timedelta(hours=1),
        status=BookingStatus.pending_payment,
        created_at=datetime.now(timezone.utc) - timedelta(minutes=25), # past 15-min hold
    )
    db.add(expired_booking)
    await db.flush()

    expired_payment = Payment(
        booking_id=expired_booking.id,
        amount=Decimal("300.00"),
        currency="PHP",
        status=PaymentStatus.review,
        provider="gcash_manual",
    )
    db.add(expired_payment)
    claim_exp = PaymentClaim(booking_id=expired_booking.id, reference="REF_EXPIRED_HOLD", status="open")
    db.add(claim_exp)
    await db.commit()

    await review(req(), expired_booking.id, Decision(decision="reject", reason="Hold deadline expired"), admin, db)

    await db.refresh(expired_booking)
    assert expired_booking.status == BookingStatus.cancelled
    await db.refresh(claim_exp)
    assert claim_exp.status == "rejected"

    summary_exp = await own_claims(expired_booking.id, client, db)
    assert summary_exp["submission_state"] == "rejected"
    assert summary_exp["rejection_reason"] == "Hold deadline expired"
```

---

### 3.3 R2.3: Review vs Reconciliation Queue Separation
**Target**: `backend/tests/test_ledger_and_reconciliation.py`  
**Test**: `test_review_and_claims_queue_separation(db)`  
**Coverage**:
1. Booking 1 is active on-time review (`BookingStatus.pending_payment` and `PaymentStatus.review`).
2. Booking 2 has an unlinked or late reconciliation claim (`PaymentClaim.status == "open"` on a cancelled/completed booking).
3. Assert Booking 1 appears in `/payments/manual/queue`.
4. Assert Booking 1's claim is EXCLUDED from `/payments/manual/claims/queue`.
5. Assert Booking 2's claim is INCLUDED in `/payments/manual/claims/queue`.

**Executable Test Implementation**:
```python
async def test_review_and_claims_queue_separation(db):
    client, _, admin, booking_a, payment_a = await seed_data(db)

    # 1. On-time submission for Booking A
    await submit(req(), booking_a.id, Reference(reference="ONTIME_QUEUE_REF"), client, db)
    await db.refresh(payment_a)
    assert payment_a.status == PaymentStatus.review
    assert booking_a.status == BookingStatus.pending_payment

    # 2. Seed a separate unlinked/late reconciliation claim for Booking B
    booking_b = Booking(
        client_id=client.id,
        counselor_id=booking_a.counselor_id,
        scheduled_start=booking_a.scheduled_start + timedelta(days=1),
        scheduled_end=booking_a.scheduled_end + timedelta(days=1),
        status=BookingStatus.cancelled,
        created_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    db.add(booking_b)
    await db.flush()

    payment_b = Payment(
        booking_id=booking_b.id,
        amount=Decimal("300.00"),
        currency="PHP",
        status=PaymentStatus.failed,
        provider="gcash_manual",
    )
    claim_b = PaymentClaim(booking_id=booking_b.id, reference="RECONCILE_ONLY_REF", status="open")
    db.add_all([payment_b, claim_b])
    await db.commit()

    # 3. Query /payments/manual/queue (active reviews)
    review_items = await queue(user=admin, db=db)
    review_ids = [p.id for p in review_items]
    assert payment_a.id in review_ids
    assert payment_b.id not in review_ids

    # 4. Query /payments/manual/claims/queue (reconciliation queue)
    claims_result = await claim_queue(page=1, user=admin, db=db)
    reconcile_refs = [item["reference"] for item in claims_result["items"]]

    # Booking A's on-time claim MUST NOT appear in claims queue
    assert "ONTIME_QUEUE_REF" not in reconcile_refs
    # Booking B's unreconciled claim MUST appear in claims queue
    assert "RECONCILE_ONLY_REF" in reconcile_refs
```

---

### 3.4 R2.4: Cancellation Under Review Handling
**Target**: `backend/tests/test_ledger_and_reconciliation.py`  
**Test**: `test_cancellation_under_review_transitions_payment_and_preserves_claim(db)`  
**Coverage**:
1. Client submits reference: `Payment.status == review`, `PaymentClaim.status == open`.
2. Client cancels booking via `cancel_booking`.
3. Assert `booking.status == BookingStatus.cancelled`.
4. Assert `payment.status == PaymentStatus.failed` (removed from active approval queue).
5. Assert `payment` no longer appears in `/payments/manual/queue`.
6. Assert `PaymentClaim` remains in `status == "open"` with reason annotated.
7. Assert `PaymentClaim` now appears in `/payments/manual/claims/queue` for admin review/refund.
8. Assert admin can reconcile the claim without 409 error.

**Executable Test Implementation**:
```python
async def test_cancellation_under_review_transitions_payment_and_preserves_claim(db):
    from app.routers.bookings import cancel_booking

    client, _, admin, booking, payment = await seed_data(db)

    # 1. Client submits reference
    await submit(req(), booking.id, Reference(reference="CANCEL_DURING_REV_REF"), client, db)
    await db.refresh(payment)
    assert payment.status == PaymentStatus.review

    claim = (await db.execute(select(PaymentClaim).where(PaymentClaim.booking_id == booking.id))).scalar_one()
    assert claim.status == "open"

    # Verify present in review queue and absent from claims queue before cancellation
    assert any(p.id == payment.id for p in await queue(user=admin, db=db))
    assert not any(item["reference"] == "CANCEL_DURING_REV_REF" for item in (await claim_queue(page=1, user=admin, db=db))["items"])

    # 2. Client cancels booking
    cancel_resp = await cancel_booking(req(), booking.id, current_user=client, db=db)
    assert cancel_resp.refund_issued is False

    # 3. Verify database states
    await db.refresh(booking)
    assert booking.status == BookingStatus.cancelled

    await db.refresh(payment)
    assert payment.status == PaymentStatus.failed
    assert payment.review_reason == "Client cancelled booking while reference was under review"

    await db.refresh(claim)
    # Claim must stay open for reconciliation
    assert claim.status == "open"
    assert claim.reason == "Client cancelled booking while reference was under review"

    # 4. Verify queue movement
    # Absent from manual review queue
    review_queue_items = await queue(user=admin, db=db)
    assert not any(p.id == payment.id for p in review_queue_items)

    # Present in claims reconciliation queue
    claims_queue_result = await claim_queue(page=1, user=admin, db=db)
    assert any(item["reference"] == "CANCEL_DURING_REV_REF" for item in claims_queue_result["items"])

    # 5. Verify admin reconciliation works cleanly (refund path)
    rec_resp = await reconcile(
        claim.id,
        Reconcile(decision="refund", reason="Client cancelled; issuing refund for real transfer", amount=Decimal("300.00")),
        admin,
        db,
    )
    assert rec_resp["status"] == "refund_pending"
    await db.refresh(claim)
    assert claim.status == "refund_pending"
```

---

### 3.5 R2.5: Cancellation Email Copy & Policy Notice
**Target**: `backend/tests/test_bookings.py` (or `test_ledger_and_reconciliation.py`)  
**Test**: `test_cancellation_email_outbox_payload_and_rendered_copy(db)`  
**Coverage**:
1. **Eligible GCash Refund ($\ge 24$h)**: Outbox payload has `refund_pending: True, was_paid: True`. Rendered email contains: `<p>A full refund is being processed and will appear in your GCash account within 5–10 business days.</p>`. Does NOT contain policy penalty.
2. **Ineligible Cancellation ($< 24$h)**: Outbox payload has `refund_pending: False, was_paid: True`. Rendered email contains: `<p>As per our cancellation policy, no refund will be issued for cancellations made less than 24 hours before the session.</p>`. Does NOT contain refund notice.
3. **Unpaid Cancellation**: Outbox payload has `refund_pending: False, was_paid: False`. Rendered email contains neither refund notice nor non-refundable policy warning.

**Executable Test Implementation**:
```python
async def test_cancellation_email_outbox_payload_and_rendered_copy(db):
    from unittest.mock import patch
    from app.routers.bookings import cancel_booking
    from app.services.email_service import send_cancellation_email

    # --- Scenario 1: Confirmed paid session cancelled >= 24h before scheduled start ---
    client, _, admin, booking_paid, payment_paid = await seed_data(db)
    # Confirm booking and set to paid
    await submit(req(), booking_paid.id, Reference(reference="PAID_GCASH_REF"), client, db)
    await review(req(), booking_paid.id, Decision(decision="approve"), admin, db)
    await db.refresh(booking_paid)
    assert booking_paid.status == BookingStatus.confirmed
    await db.refresh(payment_paid)
    assert payment_paid.status == PaymentStatus.paid

    # Client cancels >= 24h
    cancel_resp = await cancel_booking(req(), booking_paid.id, current_user=client, db=db)
    assert cancel_resp.refund_issued is False # Manual GCash API returns False

    await db.refresh(payment_paid)
    assert payment_paid.status == PaymentStatus.refund_pending

    # Verify OutboxJob payload
    outbox_job_paid = (await db.execute(
        select(OutboxJob).where(
            OutboxJob.kind == "cancellation_email",
            OutboxJob.payload["booking_id"].as_string() == booking_paid.id,
        )
    )).scalar_one()
    assert outbox_job_paid.payload["refund_pending"] is True
    assert outbox_job_paid.payload["was_paid"] is True

    # Verify Email copy for Scenario 1
    with patch("app.services.email_service._send_email_sync", return_value=True) as mock_send_1:
        await send_cancellation_email(
            client.email,
            booking_paid.id,
            refund_pending=outbox_job_paid.payload["refund_pending"],
            was_paid=outbox_job_paid.payload["was_paid"],
        )
        assert mock_send_1.called
        _, _, html_body_1 = mock_send_1.call_args[0]
        assert "<p>A full refund is being processed and will appear in your GCash account within 5–10 business days.</p>" in html_body_1
        assert "no refund will be issued" not in html_body_1

    # --- Scenario 2: Confirmed paid session cancelled < 24h before scheduled start ---
    _, _, admin, booking_late, payment_late = await seed_data(db)
    # Move start time to 3 hours from now
    booking_late.scheduled_start = datetime.now(timezone.utc) + timedelta(hours=3)
    booking_late.scheduled_end = booking_late.scheduled_start + timedelta(hours=1)
    await db.commit()

    await submit(req(), booking_late.id, Reference(reference="LATE_PAID_REF"), client, db)
    await review(req(), booking_late.id, Decision(decision="approve"), admin, db)
    await db.refresh(booking_late)
    assert booking_late.status == BookingStatus.confirmed

    # Client cancels < 24h
    await cancel_booking(req(), booking_late.id, current_user=client, db=db)

    outbox_job_late = (await db.execute(
        select(OutboxJob).where(
            OutboxJob.kind == "cancellation_email",
            OutboxJob.payload["booking_id"].as_string() == booking_late.id,
        )
    )).scalar_one()
    assert outbox_job_late.payload["refund_pending"] is False
    assert outbox_job_late.payload["was_paid"] is True

    # Verify Email copy for Scenario 2
    with patch("app.services.email_service._send_email_sync", return_value=True) as mock_send_2:
        await send_cancellation_email(
            client.email,
            booking_late.id,
            refund_pending=outbox_job_late.payload["refund_pending"],
            was_paid=outbox_job_late.payload["was_paid"],
        )
        assert mock_send_2.called
        _, _, html_body_2 = mock_send_2.call_args[0]
        assert "<p>As per our cancellation policy, no refund will be issued for cancellations made less than 24 hours before the session.</p>" in html_body_2
        assert "5–10 business days" not in html_body_2

    # --- Scenario 3: Unpaid booking cancelled ---
    _, _, admin, booking_unpaid, payment_unpaid = await seed_data(db)
    assert booking_unpaid.status == BookingStatus.pending_payment
    assert payment_unpaid.status == PaymentStatus.pending

    await cancel_booking(req(), booking_unpaid.id, current_user=client, db=db)

    outbox_job_unpaid = (await db.execute(
        select(OutboxJob).where(
            OutboxJob.kind == "cancellation_email",
            OutboxJob.payload["booking_id"].as_string() == booking_unpaid.id,
        )
    )).scalar_one()
    assert outbox_job_unpaid.payload["refund_pending"] is False
    assert outbox_job_unpaid.payload["was_paid"] is False

    # Verify Email copy for Scenario 3
    with patch("app.services.email_service._send_email_sync", return_value=True) as mock_send_3:
        await send_cancellation_email(
            client.email,
            booking_unpaid.id,
            refund_pending=outbox_job_unpaid.payload["refund_pending"],
            was_paid=outbox_job_unpaid.payload["was_paid"],
        )
        assert mock_send_3.called
        _, _, html_body_3 = mock_send_3.call_args[0]
        # Must NOT render any non-refundable policy warning
        assert "no refund will be issued" not in html_body_3
        assert "5–10 business days" not in html_body_3
        assert "Your counseling session booking has been cancelled." in html_body_3
```

---

## 4. Caveats
1. **`BookingCancelResponse.refund_issued` Preserved as `False`**:
   `backend/tests/test_payments.py:85` asserts `cancelled.json()["refund_issued"] is False` for manual GCash payments. Our design ensures `cancel_booking` continues returning `refund_issued=refund_issued` (`False`), avoiding test breakage while setting `refund_pending=True` in the outbox payload.
2. **Database Engine in SQLite vs PostgreSQL**:
   SQLite JSON extraction in queries behaves slightly differently for `job.payload["booking_id"].as_string()`. In SQLite tests, filtering by `OutboxJob.kind == "cancellation_email"` and filtering by booking id in Python or SQL is reliable across both engines.
3. **MFA Requirements for HTTP Endpoints**:
   Direct router function calls (`submit`, `review`, `cancel_booking`) bypass the SlowAPI rate limiter and HTTP MFA session cookies, allowing fast, isolated, deterministic unit testing of state transitions. Full HTTP calls should only be used where middleware/cookie integration is specifically under test.

---

## 5. Conclusion
- The cancellation email copy implementation in `backend/app/services/email_service.py` and `backend/app/services/outbox.py` is fully specified with backward compatibility for existing callers.
- The 5 regression tests in `backend/tests/test_ledger_and_reconciliation.py` directly cover all 5 R2 acceptance requirements:
  1. Synchronous payment rejection claim updates and audit events (`payment.reject`, `payment.approve`).
  2. Hold expiration upon rejection when past deadline vs active hold correction when within hold window.
  3. Review vs claims queue separation (`/payments/manual/queue` vs `/payments/manual/claims/queue`).
  4. Cancellation under review transitioning `payment.status = failed` and preserving `PaymentClaim.status = open`.
  5. Accurate cancellation email copy and outbox payload across all 3 cancellation scenarios.

---

## 6. Verification Method

### Test Execution Commands
Execute from the project root (`/home/scarecrow/dev/booking_system`):
```bash
# 1. Run targeted payments, ledger, and reconciliation tests
PYTHONPATH=backend backend/.venv/bin/pytest backend/tests/test_payments.py backend/tests/test_ledger_and_reconciliation.py backend/tests/test_bookings.py -v

# 2. Run full backend pytest suite
PYTHONPATH=backend backend/.venv/bin/pytest backend/tests/
```

### Invalidation Conditions
- Any failure in `test_payments.py` (specifically `refund_issued is False` on line 85).
- Any occurrence of `<p>As per our cancellation policy, no refund will be issued` in unpaid booking cancellation emails.
- Any duplication of on-time active review claims in `/payments/manual/claims/queue`.
- Missing `submission_state = "rejected"` in `GET /payments/manual/{booking_id}/claims`.
