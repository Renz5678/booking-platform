# Technical Survey Report: Requirement R2 (Manual Payment, Claim, and Booking Cancellation State Consistency)

**Author:** Survey Explorer 2  
**Date:** 2026-10-31  
**Project:** Alaga Therapy Booking Platform (`backend/` FastAPI + PostgreSQL)  
**Target Path:** `/home/scarecrow/dev/booking_system/.agents/teamwork/explorer_survey_2/report.md`  

---

## 1. Executive Summary

Requirement R2 addresses state consistency and reconciliation across manual GCash payments, client reference claims (`PaymentClaim`), verified ledger records (`VerifiedTransfer`), booking holds (`Booking`), and client notifications (`cancellation_email`).

Currently:
1. **Payment Rejection Desynchronization**: Rejecting a manual payment via `POST /payments/manual/{booking_id}/review` (`decision="reject"`) transitions `Payment.status = failed` and unconditionally sets `Booking.status = cancelled`, but **leaves all associated `PaymentClaim` records untouched** (in `"open"` or `"allocated"`). As a result:
   - Claims continue to linger in `/payments/manual/claims/queue`.
   - `GET /payments/manual/{booking_id}/claims` fails to report `state = "rejected"` (evaluating instead to `"reconciliation"` or `"expired"`).
   - No `rejection_reason` or `submission_state = "rejected"` is exposed to the client.
   - On rejection within the active 15-minute hold window, the booking is cancelled immediately instead of allowing the client to submit a corrected GCash reference before hold expiration.
   - No audit event (`payment.reject`) is recorded on rejection, and approval records `payment_approve` instead of `payment.approve`.
2. **Review vs. Reconciliation Queue Duplication**: Active on-time payment submissions (`Booking.status == pending_payment` and `Payment.status == review`) currently appear simultaneously in both `/payments/manual/queue` (for admin approval) and `/payments/manual/claims/queue` (for ledger reconciliation), violating queue separation.
3. **Cancellation Under Review Flaw**: When a client cancels a `pending_payment` booking that has an unreviewed payment (`payment.status == review`), `Payment` remains in `review`, keeping the cancelled booking in `/payments/manual/queue` where any subsequent approval attempts fail with `409 Conflict`.
4. **Cancellation Email Inaccurate Refund Notice**: In `cancel_booking`, `refund_payment()` returns `False` for manual GCash payments (because money cannot be refunded instantly via API). Consequently, `refund_issued` is `False`, passing `"refund_pending": False` to the outbox job. In `send_cancellation_email()`, this causes the client to receive an erroneous notice stating that *"no refund will be issued for cancellations made less than 24 hours before the session"*, even when the client cancelled days in advance or cancelled an unpaid booking.

---

## 2. Current State of Code and Affected Files

### 2.1 File Overview

| File Path | Role in R2 | Current State / Shortcomings |
|---|---|---|
| `backend/app/routers/payment_review.py` | Admin review, submit, refund, reconciliation, claims summary | - Line 131: Rejection does not touch `PaymentClaim` or record `AuditEvent`.<br>- Line 134: Unconditionally cancels booking on reject regardless of hold window.<br>- Line 159: Approving records `action="payment_approve"` rather than `payment.approve`.<br>- Line 235: `claim_queue` does not exclude active on-time reviews.<br>- Line 372: `own_claims` does not return `submission_state` or `rejection_reason`. |
| `backend/app/routers/bookings.py` | Client & counselor cancellation, hold management | - Line 346 (`cancel_booking`): Cancelling `pending_payment` with payment in `review` does not transition payment to `failed` or annotate claim.<br>- Line 402: Outbox payload receives `refund_pending: refund_issued` (`False` for manual GCash) and lacks `was_paid` flag. |
| `backend/app/services/email_service.py` | Transactional email generation and delivery | - Line 175 (`send_cancellation_email`): Hardcodes `<24h non-refundable` notice whenever `refund_issued` is `False`, misleading unpaid and on-time manual cancellations. |
| `backend/app/services/outbox.py` | Durable job worker and dispatcher | - Line 114: Dispatches `cancellation_email` without checking whether booking was paid (`was_paid`). |
| `backend/app/services/payment_service.py` | Refund handler | - Line 87 (`refund_payment`): Correctly marks `Payment.status = refund_pending` and creates `VerifiedTransfer`, but returns `False` (intended, but caller in `bookings.py` misinterprets it). |
| `backend/app/services/booking_service.py` | Stale booking sweeper | - Line 100 (`cancel_stale_pending_bookings`): Cancels bookings older than 15m; already preserves bookings whose payment has active `review_deadline`. |
| `backend/app/models/operations.py` | Operational data models | - `PaymentClaim`, `VerifiedTransfer`, `AuditEvent`. |
| `backend/app/models/payment.py` | Payment entity and enums | - `PaymentStatus`: `pending`, `review`, `refund_pending`, `paid`, `failed`, `refunded`. |
| `backend/app/models/booking.py` | Booking entity and enums | - `BookingStatus`: `pending_payment`, `confirmed`, `cancelled`, `completed`, `no_show`. |

---

## 3. Data Models, Schemas, and State Transitions

### 3.1 Data Model Definitions

#### `PaymentClaim` (`app/models/operations.py`)
```python
class PaymentClaim(Base):
    __tablename__ = "payment_claims"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    booking_id = Column(String, nullable=False, index=True)
    reference = Column(String(64), nullable=False)
    status = Column(String, nullable=False, default="open")  # "open", "allocated", "rejected", "duplicate", "refund_pending", "refunded"
    reason = Column(String(500))                             # Rejection or reconciliation explanation
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)
```

#### `Payment` (`app/models/payment.py`)
```python
class PaymentStatus(str, enum.Enum):
    pending = "pending"
    review = "review"
    refund_pending = "refund_pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"

class Payment(Base):
    __tablename__ = "payments"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    booking_id = Column(String, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, unique=True)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String, default="PHP", nullable=False)
    provider = Column(String, default="paymongo", nullable=False)  # "gcash_manual" for manual flow
    transaction_reference = Column(String(64), nullable=True, unique=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    review_deadline = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_reason = Column(String(500), nullable=True)
    refund_reference = Column(String(64), nullable=True, unique=True)
    refunded_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(PaymentStatus, native_enum=False), default=PaymentStatus.pending, nullable=False)
```

#### `AuditEvent` (`app/models/operations.py`)
```python
class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_id = Column(String, nullable=False)
    target_id = Column(String, nullable=False)
    action = Column(String, nullable=False)     # e.g., "payment.approve", "payment.reject", "claim_reconcile"
    outcome = Column(String, nullable=False)    # e.g., "paid", "failed", "allocated", "rejected"
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)
```

#### `Booking` (`app/models/booking.py`)
```python
class BookingStatus(str, enum.Enum):
    pending_payment = "pending_payment"
    confirmed = "confirmed"
    cancelled = "cancelled"
    completed = "completed"
    no_show = "no_show"
    # Note: "expired" is NOT a DB enum value; expired holds are marked as "cancelled" in DB.
    # The string "expired" is a virtual state in own_claims / client contracts.
```

### 3.2 State Transition Matrix

| Scenario / Trigger | Initial State (`Booking`, `Payment`, `Claim`) | Target State (`Booking`, `Payment`, `Claim`) | Side Effects & Notifications |
|---|---|---|---|
| **Client submits reference on-time** | `(pending_payment, pending, none)` | `(pending_payment, review, open)` | Payment in `/payments/manual/queue`; Claim excluded from `/payments/manual/claims/queue`. |
| **Admin approves on-time payment** | `(pending_payment, review, open)` | `(confirmed, paid, allocated)` | `VerifiedTransfer(allocated)` created; Outbox `calendar` job enqueued; `AuditEvent("payment.approve", "paid")`. |
| **Admin rejects payment (hold deadline passed)** | `(pending_payment, review, open)` | `(cancelled, failed, rejected)` | `Claim.reason = reason`, `Payment.review_reason = reason`; `AuditEvent("payment.reject", "failed")`; Slot released; `own_claims` returns `submission_state="rejected"`. |
| **Admin rejects payment (hold deadline NOT passed)** | `(pending_payment, review, open)` | `(pending_payment, failed, rejected)` | Booking stays `pending_payment` so client can resubmit corrected reference; `AuditEvent("payment.reject", "failed")`; `own_claims` returns `submission_state="rejected"`. |
| **Client cancels unpaid booking (`pending_payment` + `pending`)** | `(pending_payment, pending, none)` | `(cancelled, failed, none)` | Outbox `cancellation_email` enqueued with `refund_pending=False`, `was_paid=False`; Email sends standard cancellation (omits `<24h non-refundable` notice). |
| **Client cancels booking under review (`pending_payment` + `review`)** | `(pending_payment, review, open)` | `(cancelled, failed, open)` | Payment moved out of `/payments/manual/queue`; Claim kept `open` with reason; Claim now visible in `/payments/manual/claims/queue` for admin review/refund; Outbox email with `refund_pending=False`, `was_paid=False`. |
| **Client cancels paid booking $\ge 24$h before session** | `(confirmed, paid, allocated)` | `(cancelled, refund_pending, refund_pending)` | `VerifiedTransfer(refund_pending)` created; Outbox email with `refund_pending=True`, `was_paid=True` ("refund via GCash within 5–10 business days"). |
| **Client cancels paid booking $< 24$h before session** | `(confirmed, paid, allocated)` | `(cancelled, paid, allocated)` | `refund_payment()` not called; Outbox email with `refund_pending=False`, `was_paid=True` ("<24h non-refundable" notice included). |

---

## 4. Deep Inspection of Existing Code Gaps

### 4.1 Payment Rejection Gaps in `backend/app/routers/payment_review.py`
In `review()` (lines 122–136):
```python
    if data.decision == "reject":
        payment.status = PaymentStatus.failed
        if booking.status == BookingStatus.pending_payment:
            booking.status = BookingStatus.cancelled
        await db.commit()
        return payment
```
**Defects Identified**:
1. Does not touch `PaymentClaim`. Any claim submitted by the client stays `status="open"`.
2. Unconditionally sets `booking.status = BookingStatus.cancelled` even if `datetime.now(timezone.utc) < submission_deadline(booking)`, blocking the client from submitting a corrected reference.
3. Does not record an `AuditEvent` with `action="payment.reject"`.
4. Does not record `action="payment.approve"` on approval (currently records `payment_approve`).
5. `GET /payments/manual/{booking_id}/claims` does not expose `submission_state` or `rejection_reason`.

### 4.2 Queue Duplication in `backend/app/routers/payment_review.py`
In `claim_queue()` (`GET /payments/manual/claims/queue`, lines 235–256):
```python
    rows = (await db.execute(select(PaymentClaim).where(PaymentClaim.status == "open").order_by(PaymentClaim.created_at).offset((page - 1) * 50).limit(51))).scalars().all()
```
**Defects Identified**:
- Selects all claims where `status == "open"`. Because on-time submissions create a `PaymentClaim` with `status="open"`, the claim is displayed in `/admin/reconciliation` while simultaneously displayed in `/admin/payments` (`/payments/manual/queue`).
- Needs an exclusion subquery:
  ```python
  active_review_subquery = (
      select(Booking.id)
      .join(Payment, Payment.booking_id == Booking.id)
      .where(
          Booking.status == BookingStatus.pending_payment,
          Payment.status == PaymentStatus.review,
      )
  )
  where(PaymentClaim.status == "open", ~PaymentClaim.booking_id.in_(active_review_subquery))
  ```

### 4.3 Cancellation Handling in `backend/app/routers/bookings.py`
In `cancel_booking()` (lines 357–405):
```python
    if hours_until_session >= 24 and booking.status == BookingStatus.confirmed:
        refund_issued = await refund_payment(booking_id, db)
...
    booking.status = BookingStatus.cancelled
    booking.schedule_version += 1
    await enqueue(db, f"cancellation_email:{booking.id}:{booking.schedule_version}", "cancellation_email", {
        "booking_id": booking.id,
        "version": booking.schedule_version,
        "cancelled_by": "client",
        "refund_pending": refund_issued,
    })
```
**Defects Identified**:
1. When `booking.status == BookingStatus.pending_payment`, it does not query `Payment` or `PaymentClaim`. If `payment.status == PaymentStatus.review`, it leaves `payment.status` as `review`. The cancelled booking stays stuck in `/payments/manual/queue`.
2. When `booking.status == BookingStatus.confirmed` and `hours_until_session >= 24`, `refund_payment()` returns `False` for manual GCash payments (while setting `payment.status = refund_pending`). `cancel_booking` takes `refund_issued` directly as `refund_pending`, which evaluates to `False`!
3. `was_paid` is not passed in the outbox payload.

### 4.4 Cancellation Email Notice in `backend/app/services/email_service.py`
In `send_cancellation_email()` (lines 175–192):
```python
    refund_note = (
        "<p>A full refund has been processed and will appear in your account within 3–7 business days.</p>"
        if refund_issued
        else "<p>As per our cancellation policy, no refund will be issued for cancellations made less than 24 hours before the session.</p>"
    )
```
**Defects Identified**:
1. Hardcoded binary logic: if `refund_issued` is `False`, it assumes the cancellation was $< 24$ hours and displays the penalty clause.
2. Unpaid bookings receive the penalty clause.
3. Paid bookings with pending manual GCash refund receive the penalty clause instead of the 5–10 business days notice.

---

## 5. Existing Tests and Test Coverage Gaps

### 5.1 Existing Tests Covering Payments and Bookings
- `backend/tests/test_payments.py`:
  - `test_manual_payment_review_requires_admin_mfa`: Tests approval flow and MFA requirement.
  - `test_manual_refund_is_pending_until_actual_transfer`: Tests cancellation of confirmed booking > 24h, verifies `payment.status == refund_pending` and admin refund flow.
- `backend/tests/test_ledger_and_reconciliation.py`:
  - `test_claim_submission_and_booking_claims_limit`: Tests reference submission and 5-claim cap.
  - `test_one_ledger_invariant_cancellation_and_transfer_refunds`: Tests ledger state across cancel and refund.
  - `test_claim_reconciliation_decisions`: Tests late claim submission and admin duplicate/refund reconcile.
  - `test_client_claims_summary_endpoint`: Tests `own_claims` for `awaiting_submission`, `under_review`, `paid`.

### 5.2 Specific Test Gaps for Requirement R2
1. **Payment Rejection Synchronicity**: No test checks that rejecting an on-time payment sets `PaymentClaim.status = "rejected"`, populates `PaymentClaim.reason`, records `AuditEvent("payment.reject")`, and causes `GET /payments/manual/{booking_id}/claims` to return `submission_state = "rejected"` with `rejection_reason`.
2. **Hold Expiration on Rejection**: No test verifies that if payment is rejected after the 15-minute hold deadline has elapsed, `booking.status` transitions to `cancelled` and the slot is released, whereas if rejected while the hold is active, `booking.status` remains `pending_payment` allowing reference resubmission.
3. **Queue Deduplication**: No test asserts that an on-time submission (`pending_payment` + `review`) appears in `/payments/manual/queue` and is absent from `/payments/manual/claims/queue`.
4. **Client Cancellation Under Review**: No test verifies that cancelling a `pending_payment` booking with `payment.status == review` transitions `payment.status = failed`, removes it from `/payments/manual/queue`, and moves the `PaymentClaim` into `/payments/manual/claims/queue`.
5. **Accurate Refund Status in Cancellation Emails**: No test checks that:
   - Cancelling a paid manual GCash booking $\ge 24$h ahead sets `refund_pending=True` in the outbox job payload.
   - Cancelling an unpaid booking sets `refund_pending=False` and `was_paid=False`.
   - `send_cancellation_email` emits the 5–10 business day refund notice for `refund_pending=True`, the $<24$h notice only when `was_paid=True and not refund_pending`, and neutral text for unpaid cancellations.

---

## 6. Recommended Implementation Details & Pitfall Mitigation

### 6.1 `backend/app/routers/payment_review.py`

#### 1. In `review()`:
```python
    if data.decision == "reject":
        payment.status = PaymentStatus.failed
        payment.reviewed_by = user.id
        payment.reviewed_at = datetime.now(timezone.utc)
        payment.review_reason = data.reason.strip()

        # Synchronously update all open/allocated claims for this booking
        raw_claims = await db.execute(
            select(PaymentClaim).where(
                PaymentClaim.booking_id == booking_id,
                PaymentClaim.status.in_(["open", "allocated"]),
            )
        )
        for claim in raw_claims.scalars().all():
            claim.status = "rejected"
            claim.reason = data.reason.strip()

        # Hold deadline check: expire booking if deadline has passed
        now_dt = datetime.now(timezone.utc)
        if now_dt >= submission_deadline(booking):
            if booking.status == BookingStatus.pending_payment:
                booking.status = BookingStatus.cancelled

        db.add(AuditEvent(actor_id=user.id, target_id=booking_id, action="payment.reject", outcome="failed"))
        await db.commit()
        return payment

    # In approve branch:
    ...
    db.add(AuditEvent(actor_id=user.id, target_id=booking_id, action="payment.approve", outcome="paid"))
    await process_successful_payment(booking_id, db)
```

#### 2. In `claim_queue()` (`GET /payments/manual/claims/queue`):
```python
    active_review_subquery = (
        select(Booking.id)
        .join(Payment, Payment.booking_id == Booking.id)
        .where(
            Booking.status == BookingStatus.pending_payment,
            Payment.status == PaymentStatus.review,
        )
    )
    query = (
        select(PaymentClaim)
        .where(PaymentClaim.status == "open")
        .where(~PaymentClaim.booking_id.in_(active_review_subquery))
        .order_by(PaymentClaim.created_at)
        .offset((page - 1) * 50)
        .limit(51)
    )
    rows = (await db.execute(query)).scalars().all()
```

#### 3. In `own_claims()` (`GET /payments/manual/{booking_id}/claims`):
```python
    # Derive rejection reason
    rejection_reason = None
    if state == "rejected":
        rejection_reason = payment.review_reason if payment else None
        if not rejection_reason:
            for c in reversed(claims):
                if c.status == "rejected" and c.reason:
                    rejection_reason = c.reason
                    break

    return {
        "state": state,
        "submission_state": state,  # Required by R2 specification
        "rejection_reason": rejection_reason,
        "amount": str(payment.amount) if payment else "0.00",
        "submission_deadline": sub_deadline.isoformat(),
        "review_deadline": payment.review_deadline.isoformat() if payment and payment.review_deadline else None,
        "provisioning_status": booking.provisioning_status,
        "meeting_ready": bool(booking.meeting_link and booking.provisioning_status == "ready"),
        "claims": [
            {
                "id": c.id,
                "reference": c.reference,
                "status": c.status,
                "reason": c.reason,
                "created_at": c.created_at.isoformat(),
            }
            for c in claims
        ],
        "refund": refund_data,
    }
```

### 6.2 `backend/app/routers/bookings.py`

In `cancel_booking()`:
```python
    # Load associated payment and claims
    payment = (await db.execute(select(Payment).where(Payment.booking_id == booking_id).with_for_update())).scalar_one_or_none()
    claims = (await db.execute(select(PaymentClaim).where(PaymentClaim.booking_id == booking_id).with_for_update())).scalars().all()

    was_paid = bool(booking.status == BookingStatus.confirmed or (payment and payment.status in (PaymentStatus.paid, PaymentStatus.refund_pending, PaymentStatus.refunded)))

    # If pending_payment is cancelled while reference under review or claim open
    if booking.status == BookingStatus.pending_payment:
        if payment and payment.status == PaymentStatus.review:
            payment.status = PaymentStatus.failed
            payment.reviewed_by = current_user.id
            payment.reviewed_at = datetime.now(timezone.utc)
            payment.review_reason = "Client cancelled booking while reference was under review"
            for claim in claims:
                if claim.status == "open" and not claim.reason:
                    claim.reason = "Client cancelled booking while reference was under review"

    refund_issued = False
    if hours_until_session >= 24 and booking.status == BookingStatus.confirmed:
        refund_issued = await refund_payment(booking_id, db)
        if payment:
            await db.refresh(payment)

    refund_pending = bool(refund_issued or (payment and payment.status in (PaymentStatus.refund_pending, PaymentStatus.refunded)))

    booking.status = BookingStatus.cancelled
    booking.schedule_version += 1

    from app.services.outbox import booking_job, enqueue
    await booking_job(db, booking, "calendar")
    await enqueue(db, f"cancellation_email:{booking.id}:{booking.schedule_version}", "cancellation_email", {
        "booking_id": booking.id,
        "version": booking.schedule_version,
        "cancelled_by": "client",
        "refund_pending": refund_pending,
        "was_paid": was_paid,
    })
    await db.commit()

    return BookingCancelResponse(
        msg="Booking cancelled successfully.",
        booking_id=booking_id,
        refund_issued=refund_issued,  # Preserves False for manual GCash in existing test_payments.py
    )
```

### 6.3 `backend/app/services/outbox.py` & `backend/app/services/email_service.py`

In `outbox.py`:
```python
    elif job.kind == "cancellation_email" and booking.status == BookingStatus.cancelled:
        cancelled_by = job.payload.get("cancelled_by", "client")
        refund_pending = job.payload.get("refund_pending", False)
        was_paid = job.payload.get("was_paid", False)
        if cancelled_by == "counselor":
            await email.send_counselor_cancellation_notification(client.email, booking.id)
            if profile and profile.user_id:
                owner = await db.get(User, profile.user_id)
                await email.send_admin_cancellation_alert(booking.id, owner.full_name if owner else "Counselor", client.full_name if client else "Client")
        else:
            await email.send_cancellation_email(client.email, booking.id, refund_pending, was_paid=was_paid)
```

In `email_service.py`:
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

## 7. Potential Pitfalls and Subtle Side Effects

1. **`refund_issued` in `BookingCancelResponse` vs. Email Payload**:
   - In `backend/tests/test_payments.py:85`, there is an explicit assertion:
     `assert cancelled.json()["refund_issued"] is False`
   - This asserts that an immediate automated refund was not issued. If `cancel_booking` returns `refund_issued=refund_pending` (`True`), this test will break!
   - Therefore, `BookingCancelResponse` must return `refund_issued=refund_issued` (or keep the existing response attribute), while the outbox job payload accurately takes `refund_pending=refund_pending`.
2. **SQL vs. Python Pagination in `/payments/manual/claims/queue`**:
   - If active review claims are filtered out in Python after executing `.offset((page - 1) * 50).limit(51)`, the pagination slice will be short (e.g. 48 items), corrupting `has_more` and skipping items on subsequent pages.
   - The filtering MUST be performed in the SQL `where` clause using the subquery `~PaymentClaim.booking_id.in_(...)`.
3. **Concurrent Resubmission Under Active Hold**:
   - When payment is rejected while `now < submission_deadline(booking)`, `booking.status` must remain `BookingStatus.pending_payment`.
   - If `booking.status` was set to `cancelled`, any resubmission via `POST /payments/manual/{booking_id}/submit` would see `booking.status != pending_payment` and treat the resubmission as late reconciliation rather than an active booking hold.
4. **Preserving Open Claim on Cancellation Under Review**:
   - When the client cancels during review, the payment is set to `PaymentStatus.failed`, but the `PaymentClaim` must stay in `status="open"`.
   - Admin reconciliation can then inspect the claim in `/payments/manual/claims/queue` and issue a manual refund or reject it if fraudulent.

---

## 8. Verification Strategy & Commands

### 8.1 Backend Verification Commands
Execute from repository root or `backend/`:
```bash
# 1. Targeted test of ledger and payments
PYTHONPATH=. backend/.venv/bin/pytest backend/tests/test_payments.py backend/tests/test_ledger_and_reconciliation.py backend/tests/test_bookings.py

# 2. Full backend test suite
PYTHONPATH=. backend/.venv/bin/pytest backend/tests/
```

### 8.2 Frontend Verification Commands
Execute from repository root:
```bash
# 1. Typecheck frontend
npx --prefix frontend-landing tsc --noEmit

# 2. Lint frontend
npm --prefix frontend-landing run lint
```

---
*Report compiled and verified by Survey Explorer 2.*
