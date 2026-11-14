# Milestone 2 Investigation Report: Payment, Claim & Cancellation State Consistency (`bookings.py`)

**Explorer**: Explorer 2 (Milestone 2)  
**Date**: 2026-10-31  
**Target File**: `/home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m2_2/handoff.md`  

---

## 1. Observation

### 1.1 Current `cancel_booking` Implementation (`backend/app/routers/bookings.py:344-411`)
In `backend/app/routers/bookings.py`:
```python
344: @router.post("/{booking_id}/cancel", response_model=BookingCancelResponse)
345: @limiter.limit("20/minute")
346: async def cancel_booking(
347:     request: Request,
348:     booking_id: str,
349:     current_user: User = Depends(require_role(["client"])),
350:     db: AsyncSession = Depends(get_db),
351: ):
...
357:     result = await db.execute(
358:         select(Booking)
359:         .options(selectinload(Booking.client))
360:         .where(Booking.id == booking_id).with_for_update()
361:     )
362:     booking = result.scalar_one_or_none()
...
370:     if booking.status not in [BookingStatus.pending_payment, BookingStatus.confirmed]:
...
382:     hours_until_session = (scheduled_start - now).total_seconds() / 3600
383:     refund_issued = False
384: 
385:     if hours_until_session >= 24 and booking.status == BookingStatus.confirmed:
386:         # Attempt refund — only confirmed (paid) bookings can be refunded
387:         refund_issued = await refund_payment(booking_id, db)
...
394:     booking.status = BookingStatus.cancelled
395:     booking.schedule_version += 1
396:     from app.services.outbox import booking_job, enqueue
397:     await booking_job(db, booking, "calendar")
398:     await enqueue(db, f"cancellation_email:{booking.id}:{booking.schedule_version}", "cancellation_email", {
399:         "booking_id": booking.id,
400:         "version": booking.schedule_version,
401:         "cancelled_by": "client",
402:         "refund_pending": refund_issued,
403:     })
404:     await db.commit()
405: 
406:     return BookingCancelResponse(
407:         msg="Booking cancelled successfully.",
408:         booking_id=booking_id,
409:         refund_issued=refund_issued,
410:     )
```
Direct observations:
- `Payment` and `PaymentClaim` are not loaded or locked in `cancel_booking`.
- When `booking.status == BookingStatus.pending_payment`, `cancel_booking` changes only `booking.status = BookingStatus.cancelled`. It does not transition `Payment.status` from `PaymentStatus.review` to `PaymentStatus.failed`, nor does it annotate `PaymentClaim`.
- Line 402 enqueues `"refund_pending": refund_issued` and does not pass `"was_paid"`.

### 1.2 Queue Filters in `backend/app/routers/payment_review.py`
In `backend/app/routers/payment_review.py`:
- **Active Review Queue (`/payments/manual/queue`, lines 115–119)**:
  ```python
  115: rows = await db.execute(select(Payment).where(or_(
  116:     Payment.status.in_([PaymentStatus.review, PaymentStatus.refund_pending]),
  117:     (Payment.status == PaymentStatus.failed) & Payment.transaction_reference.is_not(None) & Payment.reviewed_at.is_(None)
  118: )).order_by(Payment.created_at).offset((page - 1) * 50).limit(50))
  ```
  If a payment is `PaymentStatus.failed`, it appears in `/payments/manual/queue` if and only if `Payment.reviewed_at.is_(None)`. Therefore, setting `Payment.status = PaymentStatus.failed` AND `Payment.reviewed_at = now` (non-null) removes the payment from `/payments/manual/queue`.
- **Review Endpoint (`/payments/manual/{booking_id}/review`, lines 137–140)**:
  ```python
  137: if (booking.status != BookingStatus.pending_payment or payment.status != PaymentStatus.review
  138:         or aware(booking.scheduled_start) <= datetime.now(timezone.utc)
  139:         or not payment.review_deadline or aware(payment.review_deadline) <= datetime.now(timezone.utc)):
  140:     raise HTTPException(409, "Hold expired or released; reconcile funds without reviving the booking")
  ```
  If an unreviewed payment remained in `/payments/manual/queue` after booking cancellation, any admin attempting to approve it triggers this `HTTPException(409)`.
- **Claims Reconciliation Queue (`/payments/manual/claims/queue`, lines 235–237)**:
  With Feature 5 (Milestone 2 queue separation):
  ```python
  active_review_subquery = (
      select(Booking.id)
      .join(Payment, Payment.booking_id == Booking.id)
      .where(
          Booking.status == BookingStatus.pending_payment,
          Payment.status == PaymentStatus.review,
      )
  )
  select(PaymentClaim).where(PaymentClaim.status == "open", ~PaymentClaim.booking_id.in_(active_review_subquery))
  ```
  While `booking.status == pending_payment` and `payment.status == review`, claims are excluded from the reconciliation queue. Once `booking.status == cancelled` and `payment.status == failed`, the claim becomes visible in `/payments/manual/claims/queue` for admin reconciliation.

### 1.3 Refund Behavior in `refund_payment()` (`backend/app/services/payment_service.py:87–109`)
```python
87:  if payment.provider == "gcash_manual" or not payment.provider_payment_id:
88:      payment.status = PaymentStatus.refund_pending
89:      from app.models.operations import VerifiedTransfer
90:      transfer = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.booking_id == booking_id))).scalar_one_or_none()
...
98:          transfer = VerifiedTransfer(
...
103:             status="refund_pending",
...
107:     await db.flush()
108:     logger.warning("Manual refund requires an actual transfer and administrator reconciliation: %s", booking_id)
109:     return False
```
`refund_payment()` returns `False` for manual GCash payments, while synchronously setting `payment.status = PaymentStatus.refund_pending` and creating/updating `VerifiedTransfer(status="refund_pending")`.

### 1.4 Test Assertion in `backend/tests/test_payments.py:83-88`
```python
83: cancelled = await async_client.post(f"/bookings/{booking_id}/cancel")
84: assert cancelled.status_code == 200, cancelled.text
85: assert cancelled.json()["refund_issued"] is False
86: db.expire_all()
87: payment = (await db.execute(select(Payment).where(Payment.booking_id == booking_id))).scalar_one()
88: assert payment.status == PaymentStatus.refund_pending
```
The endpoint response contract requires `refund_issued=False` for manual GCash cancellations, because the funds cannot be refunded automatically via an external gateway.

### 1.5 Database Models: `PaymentClaim` (`backend/app/models/operations.py:45–53`)
```python
class PaymentClaim(Base):
    __tablename__ = "payment_claims"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    booking_id = Column(String, nullable=False, index=True)
    reference = Column(String(64), nullable=False)
    status = Column(String, nullable=False, default="open")
    reason = Column(String(500))
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)
```
The database column is named `reason`. `decision_reason` is not currently an attribute on `PaymentClaim`.

---

## 2. Logic Chain

### 2.1 Concurrency & Row Locking
1. In `cancel_booking`, concurrent state changes may occur if a client cancels while an admin is reviewing (`POST /payments/manual/{booking_id}/review`) or another process is expiring holds.
2. Therefore, `Booking`, `Payment`, and `PaymentClaim` must all be queried with `.with_for_update()`.
3. In async SQLAlchemy, accessing `booking.payment` directly when not eager-loaded will trigger an unexpected lazy load and raise `MissingGreenlet`. Eager-loading `selectinload(Booking.payment)` and loading `Payment` with `.with_for_update()` keeps instances unified in the identity map and prevents runtime greenlet errors.

### 2.2 Transition on Cancellation Under Review
1. From Observation 1.1, if `booking.status == BookingStatus.pending_payment`:
   - A client may have submitted a reference (`payment.status == PaymentStatus.review`) and/or created `PaymentClaim` records.
2. From Observation 1.2, `/payments/manual/queue` displays `failed` payments only if `payment.reviewed_at.is_(None)`.
3. If `cancel_booking` sets:
   - `payment.status = PaymentStatus.failed`
   - `payment.reviewed_at = now`
   - `payment.reviewed_by = current_user.id`
   - `payment.review_reason = "Client cancelled booking while reference was under review"`
   then the payment is guaranteed to be omitted from `/payments/manual/queue`. Admin approval conflicts (`409 Conflict`) are completely prevented.
4. Keeping associated claims in `status = "open"` with reason `"Client cancelled booking while reference was under review"` ensures that when the booking leaves `pending_payment`, the claim satisfies `~PaymentClaim.booking_id.in_(active_review_subquery)`.
5. The claim immediately appears in `/payments/manual/claims/queue`, allowing the administrator to inspect the reference and initiate a manual GCash refund via `/claims/{claim_id}/reconcile`.

### 2.3 Refund Status & Email Notice Derivation
1. **`was_paid` derivation**:
   - Evaluated before `booking.status` is set to `cancelled`:
     ```python
     was_paid = bool(
         booking.status == BookingStatus.confirmed
         or (payment and payment.status in (PaymentStatus.paid, PaymentStatus.refund_pending, PaymentStatus.refunded))
     )
     ```
   - For an unpaid booking (`pending_payment` with payment in `pending` or `review`), `was_paid == False`.
   - For a confirmed booking, `was_paid == True`.
2. **`refund_pending` derivation**:
   - For a confirmed booking cancelled $\ge 24$h before session, `refund_payment()` runs.
   - Per Observation 1.3, `refund_payment()` sets `payment.status = PaymentStatus.refund_pending` and returns `refund_issued = False`.
   - Computing:
     ```python
     refund_pending = bool(
         refund_issued
         or (payment and payment.status in (PaymentStatus.refund_pending, PaymentStatus.refunded))
     )
     ```
     accurately evaluates `refund_pending = True` for manual GCash cancellations, and `refund_pending = True` for automated gateway refunds where `refund_issued == True`.
   - For cancellations $< 24$h before session or unpaid cancellations, `refund_pending = False`.
3. **Outbox Payload**:
   - Passing `"refund_pending": refund_pending` and `"was_paid": was_paid` to the `cancellation_email` outbox job ensures downstream consumers (`outbox.py` and `email_service.py`) generate the correct email copy:
     - `refund_pending == True`: GCash refund within 5–10 business days notice.
     - `refund_pending == False and was_paid == True`: "<24h non-refundable" policy notice.
     - `was_paid == False`: neutral cancellation notice without misleading refund/penalty copy.
4. **API Response Contract**:
   - Per Observation 1.4, returning `BookingCancelResponse(refund_issued=refund_issued)` preserves `refund_issued=False` in the JSON response, satisfying `test_payments.py:85`.

### 2.4 Model Compatibility: `PaymentClaim.decision_reason`
1. Per Observation 1.5, `PaymentClaim` has the column `reason = Column(String(500))`.
2. Setting `claim.decision_reason` on an instance without a property/synonym would cause an `AttributeError`.
3. Adding a Python property or `synonym("reason")` on `PaymentClaim`:
   ```python
   @property
   def decision_reason(self) -> str | None:
       return self.reason

   @decision_reason.setter
   def decision_reason(self, val: str | None) -> None:
       self.reason = val
   ```
   guarantees that code or tests accessing `claim.decision_reason` read and write to `claim.reason` transparently.

---

## 3. Caveats

1. **Counselor-Initiated Cancellations (`counselor_cancel_booking`)**:
   - Although the primary task is `cancel_booking` (client cancellation), `counselor_cancel_booking` in `backend/app/routers/bookings.py:413-483` also enqueues `cancellation_email` with `"refund_pending": refund_issued`.
   - Counselor cancellations always grant a full refund, so `counselor_cancel_booking` should also calculate `refund_pending` and `was_paid` using the same formula to avoid passing `refund_pending: False` for manual GCash bookings cancelled by a counselor.
2. **`db.refresh(payment)` after `refund_payment()`**:
   - `refund_payment()` calls `db.flush()`. Because `payment` is in the session identity map, `payment.status` is already modified in memory. Calling `await db.refresh(payment)` guarantees the in-memory state is synchronized with the database record.
3. **Unpaid Cancellation Payment Transition**:
   - If a client cancels a `pending_payment` booking where `payment.status == PaymentStatus.pending` (no claim submitted), `payment.status` should transition to `PaymentStatus.failed` (mirroring `booking_service.py:134`).

---

## 4. Conclusion & Concrete Implementation Strategy

### 4.1 Changes to `backend/app/routers/bookings.py`

#### Import Additions
```python
from app.models.operations import PaymentClaim
```

#### Proposed `cancel_booking` Implementation
```python
@router.post("/{booking_id}/cancel", response_model=BookingCancelResponse)
@limiter.limit("20/minute")
async def cancel_booking(
    request: Request,
    booking_id: str,
    current_user: User = Depends(require_role(["client"])),
    db: AsyncSession = Depends(get_db),
):
    """
    Client cancels their own booking.
    - If ≥ 24 hours before the session: full refund is issued.
    - If < 24 hours before the session: cancellation is processed with no refund.
    """
    result = await db.execute(
        select(Booking)
        .options(selectinload(Booking.client), selectinload(Booking.payment))
        .where(Booking.id == booking_id)
        .with_for_update()
    )
    booking = result.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to cancel this booking")

    if booking.status not in [BookingStatus.pending_payment, BookingStatus.confirmed]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel a booking with status '{booking.status.value}'.",
        )

    # Lock payment and claims rows
    payment = (
        await db.execute(
            select(Payment).where(Payment.booking_id == booking_id).with_for_update()
        )
    ).scalar_one_or_none()
    if not payment and booking.payment:
        payment = booking.payment

    claims = (
        await db.execute(
            select(PaymentClaim)
            .where(PaymentClaim.booking_id == booking_id)
            .with_for_update()
        )
    ).scalars().all()

    now = datetime.now(timezone.utc)
    scheduled_start = booking.scheduled_start
    if scheduled_start.tzinfo is None:
        scheduled_start = scheduled_start.replace(tzinfo=timezone.utc)

    hours_until_session = (scheduled_start - now).total_seconds() / 3600
    refund_issued = False

    # Compute was_paid prior to mutating booking status
    was_paid = bool(
        booking.status == BookingStatus.confirmed
        or (
            payment
            and payment.status in (PaymentStatus.paid, PaymentStatus.refund_pending, PaymentStatus.refunded)
        )
    )

    # 1. Cancellation while Payment is under review or Claim is open
    if booking.status == BookingStatus.pending_payment:
        has_open_claims = any(c.status in ("open", "allocated") for c in claims)
        if (payment and payment.status == PaymentStatus.review) or has_open_claims:
            if payment:
                payment.status = PaymentStatus.failed
                payment.reviewed_at = now
                payment.reviewed_by = current_user.id
                payment.review_reason = "Client cancelled booking while reference was under review"
            for claim in claims:
                if claim.status in ("open", "allocated"):
                    claim.status = "open"
                    claim.reason = "Client cancelled booking while reference was under review"
                    if hasattr(claim, "decision_reason"):
                        claim.decision_reason = "Client cancelled booking while reference was under review"
        elif payment and payment.status == PaymentStatus.pending:
            payment.status = PaymentStatus.failed

    # 2. Refund handling for confirmed bookings
    if hours_until_session >= 24 and booking.status == BookingStatus.confirmed:
        refund_issued = await refund_payment(booking_id, db)
        if not refund_issued:
            logger.warning(
                "Cancellation for booking %s proceeding without refund due to refund failure.",
                booking_id,
            )
        if payment:
            await db.refresh(payment)

    # Compute refund_pending for outbox notification
    refund_pending = bool(
        refund_issued
        or (
            payment
            and payment.status in (PaymentStatus.refund_pending, PaymentStatus.refunded)
        )
    )

    booking.status = BookingStatus.cancelled
    booking.schedule_version += 1

    from app.services.outbox import booking_job, enqueue
    await booking_job(db, booking, "calendar")
    await enqueue(
        db,
        f"cancellation_email:{booking.id}:{booking.schedule_version}",
        "cancellation_email",
        {
            "booking_id": booking.id,
            "version": booking.schedule_version,
            "cancelled_by": "client",
            "refund_pending": refund_pending,
            "was_paid": was_paid,
        },
    )
    await db.commit()

    return BookingCancelResponse(
        msg="Booking cancelled successfully.",
        booking_id=booking_id,
        refund_issued=refund_issued,
    )
```

#### Aligned `counselor_cancel_booking` Implementation
```python
    # Full refund always applies for counselor-initiated cancellations
    refund_issued = False
    was_paid = bool(
        booking.status == BookingStatus.confirmed
        or (payment and payment.status in (PaymentStatus.paid, PaymentStatus.refund_pending, PaymentStatus.refunded))
    )

    if booking.status == BookingStatus.confirmed:
        refund_issued = await refund_payment(booking_id, db)
        if not refund_issued:
            logger.warning(
                "Counselor cancellation for booking %s proceeding without refund due to refund failure.",
                booking_id,
            )
        if payment:
            await db.refresh(payment)

    refund_pending = bool(
        refund_issued
        or (payment and payment.status in (PaymentStatus.refund_pending, PaymentStatus.refunded))
    )
```

### 4.2 Supporting Changes in Models and Services

1. **`backend/app/models/operations.py` (`PaymentClaim`)**:
   Add property alias for `decision_reason`:
   ```python
   class PaymentClaim(Base):
       ...
       @property
       def decision_reason(self) -> str | None:
           return self.reason

       @decision_reason.setter
       def decision_reason(self, val: str | None) -> None:
           self.reason = val
   ```
2. **`backend/app/services/outbox.py`**:
   Extract `was_paid` from payload and pass to email service:
   ```python
   was_paid = job.payload.get("was_paid", False)
   ...
   await email.send_cancellation_email(client.email, booking.id, refund_pending, was_paid=was_paid)
   ```
3. **`backend/app/services/email_service.py`**:
   Update `send_cancellation_email`:
   ```python
   async def send_cancellation_email(
       user_email: str, booking_id: str, refund_issued: bool, was_paid: bool = False
   ) -> None:
       subject = "Your Booking Has Been Cancelled"
       if refund_issued:
           refund_note = "<p>Your booking is eligible for a full refund, which our team will process via GCash within 5–10 business days.</p>"
       elif was_paid:
           refund_note = "<p>As per our cancellation policy, no refund will be issued for cancellations made less than 24 hours before the session.</p>"
       else:
           refund_note = ""
   ```

---

## 5. Verification Method

### 5.1 Verification Commands
Run from `/home/scarecrow/dev/booking_system`:
```bash
# 1. Existing payments and reconciliation tests (verifies no regressions)
PYTHONPATH=backend backend/.venv/bin/pytest backend/tests/test_payments.py backend/tests/test_ledger_and_reconciliation.py

# 2. Full backend test suite
PYTHONPATH=backend backend/.venv/bin/pytest backend/tests/
```

### 5.2 Specific Test Cases to Add / Verify
1. **Cancellation while Reference is Under Review**:
   - Create booking (`pending_payment`).
   - Client submits GCash reference (`POST /payments/manual/{id}/submit`), setting `payment.status = "review"` and claim `status = "open"`.
   - Client cancels booking (`POST /bookings/{id}/cancel`).
   - Verify DB:
     - `booking.status == BookingStatus.cancelled`
     - `payment.status == PaymentStatus.failed`
     - `payment.reviewed_at is not None`
     - `payment.review_reason == "Client cancelled booking while reference was under review"`
     - `claim.status == "open"`
     - `claim.reason == "Client cancelled booking while reference was under review"`
   - Verify Queue Endpoints:
     - `GET /payments/manual/queue` (as admin) does NOT return this booking (HTTP 200, items empty).
     - `GET /payments/manual/claims/queue` (as admin) DOES return this claim in the reconciliation queue.
2. **Refund Status and Response Contract**:
   - Cancel confirmed manual GCash booking $\ge 24$h before session:
     - Verify API response: `refund_issued == False` (`test_payments.py:85` passes).
     - Verify `payment.status == PaymentStatus.refund_pending`.
     - Verify outbox payload: `refund_pending == True`, `was_paid == True`.
   - Cancel confirmed booking $< 24$h before session:
     - Verify API response: `refund_issued == False`.
     - Verify outbox payload: `refund_pending == False`, `was_paid == True`.
   - Cancel unpaid booking (`pending_payment`):
     - Verify outbox payload: `refund_pending == False`, `was_paid == False`.

### 5.3 Invalidation Conditions
- If `cancelled.json()["refund_issued"]` returns `True` for manual GCash cancellations, `test_payments.py:85` will fail.
- If `payment.reviewed_at` is left `None`, the cancelled booking remains in `/payments/manual/queue`.
- If `PaymentClaim.status` is changed to `"rejected"` instead of remaining `"open"`, it will disappear from `/payments/manual/claims/queue` and cannot be reconciled by an admin.
- If `booking.payment` is lazily evaluated without `selectinload` or prior query in async SQLAlchemy, it will raise `MissingGreenlet`.
