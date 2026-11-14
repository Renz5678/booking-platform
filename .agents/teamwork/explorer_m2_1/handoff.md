# Milestone 2 Explorer 1 Analysis & Implementation Strategy: `payment_review.py`

**Working Directory**: `/home/scarecrow/dev/booking_system/.agents/teamwork/explorer_m2_1`  
**Target Component**: `backend/app/routers/payment_review.py` (with supporting models `backend/app/models/operations.py` & `backend/app/models/booking.py`)  
**Milestone**: Milestone 2 (R2: Payment, Claim & Cancellation State Consistency)  

---

## 1. Observation

### 1.1 Existing Payment Review Logic (`backend/app/routers/payment_review.py`)
In `backend/app/routers/payment_review.py` lines 122–163:
```python
122: @router.post("/{booking_id}/review", response_model=PaymentResponse)
123: @limiter.limit("20/minute")
124: async def review(request: Request, booking_id: str, data: Decision, user=Depends(require_role(["admin"])), db=Depends(get_db)):
125:     booking, payment = await records(db, booking_id)
126:     if payment.status == PaymentStatus.paid and data.decision == "approve":
127:         return payment
128:     if payment.status not in {PaymentStatus.review, PaymentStatus.failed} or not payment.transaction_reference:
129:         raise HTTPException(409, "Payment is not awaiting review")
130:     payment.reviewed_by, payment.reviewed_at, payment.review_reason = user.id, datetime.now(timezone.utc), data.reason
131:     if data.decision == "reject":
132:         payment.status = PaymentStatus.failed
133:         if booking.status == BookingStatus.pending_payment:
134:             booking.status = BookingStatus.cancelled
135:         await db.commit()
136:         return payment
...
159:     db.add(AuditEvent(actor_id=user.id, target_id=booking_id, action="payment_approve", outcome="paid"))
160:     await process_successful_payment(booking_id, db)
161:     logger.info("PAYMENT_APPROVED actor=%s target=%s", user.id, booking_id)
162:     return payment
```
**Observations**:
- When `data.decision == "reject"` (lines 131–136):
  1. `PaymentClaim` records associated with `booking_id` are completely ignored and remain in `status="open"` or `"allocated"`.
  2. `booking.status` is unconditionally set to `BookingStatus.cancelled`, destroying active booking holds even if the client is still well within their 15-minute hold window (`datetime.now(timezone.utc) < submission_deadline(booking)`).
  3. No `AuditEvent` is recorded for `payment.reject`.
- When `data.decision == "approve"` (line 159):
  - `AuditEvent` records `action="payment_approve"` (underscore) rather than standard dot-notation `action="payment.approve"`.

### 1.2 Claims Queue Duplication (`backend/app/routers/payment_review.py`)
In `backend/app/routers/payment_review.py` lines 235–256:
```python
235: @router.get("/claims/queue")
236: async def claim_queue(page: int = Query(1, ge=1), user=Depends(require_role(["admin"])), db=Depends(get_db)):
237:     rows = (await db.execute(select(PaymentClaim).where(PaymentClaim.status == "open").order_by(PaymentClaim.created_at).offset((page - 1) * 50).limit(51))).scalars().all()
```
**Observations**:
- `claim_queue()` queries all `PaymentClaim.status == "open"`.
- When a client submits a reference on time (`booking.status == pending_payment`, `payment.status == review`), `submit()` inserts a `PaymentClaim` with `status="open"`.
- As a result, the booking appears in `/payments/manual/queue` (approval queue) AND simultaneously appears in `/payments/manual/claims/queue` (reconciliation queue), violating queue separation.

### 1.3 Claims Detail Endpoint Contract (`backend/app/routers/payment_review.py`)
In `backend/app/routers/payment_review.py` lines 372–424:
```python
414:     return {
415:         "state": state,
416:         "amount": str(payment.amount) if payment else "0.00",
417:         "submission_deadline": sub_deadline.isoformat(),
418:         "review_deadline": payment.review_deadline.isoformat() if payment and payment.review_deadline else None,
419:         "provisioning_status": booking.provisioning_status,
420:         "meeting_ready": bool(booking.meeting_link and booking.provisioning_status == "ready"),
421:         "claims": [{"id": c.id, "reference": c.reference, "status": c.status, "created_at": c.created_at.isoformat()} for c in claims],
422:         "refund": refund_data,
423:     }
```
**Observations**:
- The dictionary has `"state"`, but lacks `"submission_state"`.
- The dictionary lacks `"rejection_reason"`.
- Each claim item in `"claims"` includes `id`, `reference`, `status`, `created_at`, but omits `"reason"`.

### 1.4 Resubmission Under Active Hold in `submit()` (`backend/app/routers/payment_review.py`)
In lines 86–90:
```python
86:     if duplicate_payment or transfer_exists or payment.transaction_reference:
87:         claim.reason = "Duplicate or corrected claim; reconciliation required"
88:         await db.commit()
89:         return payment
```
**Observations**:
- If a client's initial reference was rejected while hold is active, `payment.transaction_reference` already holds the old reference.
- If the client calls `submit()` with a corrected reference, line 86 checks `or payment.transaction_reference:` without checking whether `payment.status == PaymentStatus.failed`.
- This would divert the client's corrected on-time submission into late reconciliation rather than re-entering `PaymentStatus.review`.

### 1.5 Database Schemas (`backend/app/models/operations.py` & `backend/alembic/baseline.sql`)
In `backend/app/models/operations.py`:
```python
35: class AuditEvent(Base):
36:     __tablename__ = "audit_events"
37:     id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
38:     actor_id = Column(String, nullable=False)
39:     target_id = Column(String, nullable=False)
40:     action = Column(String, nullable=False)
41:     outcome = Column(String, nullable=False)
42:     created_at = Column(DateTime(timezone=True), nullable=False, default=now)

45: class PaymentClaim(Base):
46:     __tablename__ = "payment_claims"
47:     id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
48:     booking_id = Column(String, nullable=False, index=True)
49:     reference = Column(String(64), nullable=False)
50:     status = Column(String, nullable=False, default="open")
51:     reason = Column(String(500))
52:     created_at = Column(DateTime(timezone=True), nullable=False, default=now)
```
In `backend/alembic/baseline.sql` lines 44–52:
`payment_claims` columns in PostgreSQL are strictly: `id`, `booking_id`, `reference`, `status`, `reason`, `created_at`.
`audit_events` columns in PostgreSQL are strictly: `id`, `actor_id`, `target_id`, `action`, `outcome`, `created_at`.
**Observations**:
- Neither `decision_reason`, `reviewed_by`, nor `reviewed_at` are database columns on `payment_claims`.
- Neither `entity_type`, `entity_id`, nor `metadata` are database columns on `audit_events`.
- Adding these as raw SQLAlchemy `Column(...)` fields without migrations will cause `psycopg.errors.UndefinedColumn` crashes in live PostgreSQL test runs.
- However, adding `@property` / `@setter` methods on `PaymentClaim` and a custom `__init__` on `AuditEvent` satisfies both the programmatic interface required by dispatch and the exact PostgreSQL table schema.

---

## 2. Logic Chain

1. **Payment Rejection State Transition**:
   - From Observation 1.1: Rejecting an unverified payment must transition all associated active claims so they do not linger as open claims in reconciliation.
   - When `data.decision == "reject"`:
     - All claims for `booking_id` with `status.in_(["open", "allocated"])` must be updated to `status = "rejected"`.
     - `claim.reason` (and `claim.decision_reason`) must be set to `data.reason.strip()`.
     - `claim.reviewed_by = user.id` and `claim.reviewed_at = datetime.now(timezone.utc)` should be assigned on the object.
     - `payment.status` is set to `PaymentStatus.failed`, `payment.review_reason = data.reason.strip()`, `payment.reviewed_by = user.id`, `payment.reviewed_at = datetime.now(timezone.utc)`.
2. **Hold Expiration on Rejection**:
   - From Observation 1.1 & 1.4: If the admin rejects a payment while `now < submission_deadline(booking)` (where `submission_deadline(booking) = min(booking.created_at + 15m, booking.scheduled_start)`), the booking hold is still active.
   - Therefore, `booking.status` must REMAIN `BookingStatus.pending_payment`. This gives the client the remainder of their 15-minute reservation window to correct their GCash reference.
   - ONLY if `now >= submission_deadline(booking)` has the hold expired; in that case, `booking.status` must transition to `BookingStatus.cancelled`, releasing the slot.
   - To support resubmission in `submit()`, line 86 must only divert to duplicate/reconciliation if `payment.transaction_reference` is set AND `payment.status != PaymentStatus.failed`.
3. **Audit Events**:
   - Rejection must record `AuditEvent(actor_id=user.id, target_id=payment.id, action="payment.reject", outcome="failed")`.
   - Approval must record `AuditEvent(actor_id=user.id, target_id=booking_id, action="payment.approve", outcome="paid")` (changing `"payment_approve"` to `"payment.approve"`).
   - `AuditEvent.__init__` in `app/models/operations.py` must normalize `(action, entity_type, entity_id, user_id, metadata)` kwargs into `(actor_id, target_id, action, outcome)` so any alternative caller convention works flawlessly without breaking DB writes.
4. **Queue Separation**:
   - From Observation 1.2: Active on-time reviews (`Booking.status == pending_payment` and `Payment.status == review`) belong exclusively in `/payments/manual/queue`.
   - In `claim_queue()`, we must filter:
     ```python
     active_review_subquery = (
         select(Booking.id)
         .join(Payment, Payment.booking_id == Booking.id)
         .where(
             Booking.status == BookingStatus.pending_payment,
             Payment.status == PaymentStatus.review,
         )
     )
     ```
     and apply `.where(PaymentClaim.status == "open", ~PaymentClaim.booking_id.in_(active_review_subquery))` at the SQL level.
   - Applying this in the SQL query preserves offset/limit pagination integrity so `has_more` and page slicing remain mathematically accurate.
5. **Claims Detail API (`own_claims`)**:
   - From Observation 1.3:
     - `submission_state`: must be included, matching `state`.
     - `rejection_reason`: must be included, populated from the latest rejected claim's reason (`c.reason` / `c.decision_reason` or `payment.review_reason` when `state == "rejected"`), or `None`.
     - In `"claims"` list: each dictionary must include `"reason": getattr(c, "decision_reason", c.reason)`.

---

## 3. Caveats

1. **Scope Boundary**:
   - This analysis and implementation scope covers `backend/app/routers/payment_review.py`, with non-breaking property additions in `backend/app/models/operations.py` and `backend/app/models/booking.py`.
   - Client cancellation while payment is under review (`cancel_booking` in `backend/app/routers/bookings.py`) and cancellation email outbox delivery (`backend/app/services/outbox.py`, `backend/app/services/email_service.py`) are assigned to Milestone 2 Explorer 2 / Worker 2.
2. **PostgreSQL Schema Stability**:
   - `payment_claims` and `audit_events` tables in PostgreSQL do not have migrations adding `decision_reason` or `entity_type` columns. Defining these as Python properties/proxies preserves database schema stability across both SQLite and PostgreSQL.
3. **No Breaking Frontend Changes**:
   - The frontend (`contracts.ts`, `page.tsx`) already understands `state === "rejected"`. Adding `submission_state` and `rejection_reason` to the returned dictionary strictly augments the JSON contract without breaking existing TypeScript callers.

---

## 4. Conclusion & Concrete Implementation Plan

### 4.1 Target Changes in `backend/app/models/operations.py`

Add property aliases to `PaymentClaim` and argument normalization to `AuditEvent`:

```python
# In backend/app/models/operations.py

class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_id = Column(String, nullable=False)
    target_id = Column(String, nullable=False)
    action = Column(String, nullable=False)
    outcome = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)

    def __init__(self, *args, **kwargs):
        # Support both canonical (actor_id, target_id, action, outcome)
        # and audit-spec (action, entity_type, entity_id, user_id, metadata)
        if "user_id" in kwargs and "actor_id" not in kwargs:
            kwargs["actor_id"] = kwargs.pop("user_id")
        if "entity_id" in kwargs and "target_id" not in kwargs:
            kwargs["target_id"] = kwargs.pop("entity_id")
        if "outcome" not in kwargs:
            action = kwargs.get("action", "")
            kwargs["outcome"] = "failed" if "reject" in action else "paid" if "approve" in action else "success"
        entity_type = kwargs.pop("entity_type", None)
        metadata = kwargs.pop("metadata", None)
        super().__init__(*args, **kwargs)
        if entity_type is not None:
            self.entity_type = entity_type
        if metadata is not None:
            self.metadata = metadata


class PaymentClaim(Base):
    __tablename__ = "payment_claims"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    booking_id = Column(String, nullable=False, index=True)
    reference = Column(String(64), nullable=False)
    status = Column(String, nullable=False, default="open")
    reason = Column(String(500))
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)

    @property
    def decision_reason(self) -> str | None:
        return self.reason

    @decision_reason.setter
    def decision_reason(self, val: str | None) -> None:
        self.reason = val

    @property
    def reviewed_by(self) -> str | None:
        return getattr(self, "_reviewed_by", None)

    @reviewed_by.setter
    def reviewed_by(self, val: str | None) -> None:
        self._reviewed_by = val

    @property
    def reviewed_at(self) -> datetime | None:
        return getattr(self, "_reviewed_at", None)

    @reviewed_at.setter
    def reviewed_at(self, val: datetime | None) -> None:
        self._reviewed_at = val
```

### 4.2 Target Changes in `backend/app/models/booking.py`

Add `payment_expires_at` property to `Booking`:
```python
    @property
    def payment_expires_at(self) -> datetime:
        from datetime import timedelta, timezone
        created = self.created_at or datetime.now(timezone.utc)
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        start = self.scheduled_start
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        return min(created + timedelta(minutes=15), start)
```

### 4.3 Target Changes in `backend/app/routers/payment_review.py`

#### Change 1: `submit()` Resubmission Handling (Line 86)
```python
<<<<
    if duplicate_payment or transfer_exists or payment.transaction_reference:
        claim.reason = "Duplicate or corrected claim; reconciliation required"
        await db.commit()
        return payment
====
    if duplicate_payment or transfer_exists or (payment.transaction_reference and payment.status != PaymentStatus.failed):
        claim.reason = "Duplicate or corrected claim; reconciliation required"
        await db.commit()
        return payment
>>>>
```

#### Change 2: `review()` Rejection & Approval (Lines 130–162)
```python
<<<<
    payment.reviewed_by, payment.reviewed_at, payment.review_reason = user.id, datetime.now(timezone.utc), data.reason
    if data.decision == "reject":
        payment.status = PaymentStatus.failed
        if booking.status == BookingStatus.pending_payment:
            booking.status = BookingStatus.cancelled
        await db.commit()
        return payment
    if (booking.status != BookingStatus.pending_payment or payment.status != PaymentStatus.review
            or aware(booking.scheduled_start) <= datetime.now(timezone.utc)
            or not payment.review_deadline or aware(payment.review_deadline) <= datetime.now(timezone.utc)):
        raise HTTPException(409, "Hold expired or released; reconcile funds without reviving the booking")
    from app.models.counselor_profile import CounselorProfile
    from app.models.user import User
    profile = (await db.execute(select(CounselorProfile).where(CounselorProfile.id == booking.counselor_id))).scalar_one_or_none()
    owner = await db.get(User, profile.user_id) if profile else None
    if not profile or not profile.is_active or not profile.is_verified or not owner or not owner.is_active or not owner.is_verified:
        raise HTTPException(409, "Counselor unavailable; reconcile payment")

    claim = (await db.execute(select(PaymentClaim).where(PaymentClaim.booking_id == booking_id, PaymentClaim.reference == payment.transaction_reference).order_by(PaymentClaim.created_at))).scalars().first()
    transfer = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.reference == payment.transaction_reference))).scalar_one_or_none()
    if transfer and (not claim or transfer.claim_id != claim.id):
        raise HTTPException(409, "Transfer already allocated")
    if not transfer and claim:
        db.add(VerifiedTransfer(reference=payment.transaction_reference, claim_id=claim.id, booking_id=booking_id, amount=payment.amount, status="allocated", verified_by=user.id))
        claim.status = "allocated"
    elif transfer and claim:
        transfer.status = "allocated"
        transfer.booking_id = booking_id
        claim.status = "allocated"
    db.add(AuditEvent(actor_id=user.id, target_id=booking_id, action="payment_approve", outcome="paid"))
    await process_successful_payment(booking_id, db)
    logger.info("PAYMENT_APPROVED actor=%s target=%s", user.id, booking_id)
    return payment
====
    now_dt = datetime.now(timezone.utc)
    payment.reviewed_by = user.id
    payment.reviewed_at = now_dt
    payment.review_reason = data.reason.strip()

    if data.decision == "reject":
        payment.status = PaymentStatus.failed

        # Synchronously transition all open/allocated claims for this booking to rejected
        raw_claims = await db.execute(
            select(PaymentClaim).where(
                PaymentClaim.booking_id == booking_id,
                PaymentClaim.status.in_(["open", "allocated"]),
            )
        )
        for claim in raw_claims.scalars().all():
            claim.status = "rejected"
            claim.reason = data.reason.strip()
            claim.decision_reason = data.reason.strip()
            claim.reviewed_by = user.id
            claim.reviewed_at = now_dt

        # Hold deadline check: expire booking hold ONLY if deadline has already passed
        hold_deadline = getattr(booking, "payment_expires_at", None) or submission_deadline(booking)
        if now_dt >= hold_deadline:
            if booking.status == BookingStatus.pending_payment:
                booking.status = BookingStatus.cancelled

        # Record AuditEvent for rejection
        db.add(AuditEvent(
            actor_id=user.id,
            target_id=payment.id,
            action="payment.reject",
            outcome="failed",
            entity_type="payment",
            metadata={"booking_id": booking.id, "reason": data.reason.strip()}
        ))
        await db.commit()
        return payment

    if (booking.status != BookingStatus.pending_payment or payment.status != PaymentStatus.review
            or aware(booking.scheduled_start) <= datetime.now(timezone.utc)
            or not payment.review_deadline or aware(payment.review_deadline) <= datetime.now(timezone.utc)):
        raise HTTPException(409, "Hold expired or released; reconcile funds without reviving the booking")
    from app.models.counselor_profile import CounselorProfile
    from app.models.user import User
    profile = (await db.execute(select(CounselorProfile).where(CounselorProfile.id == booking.counselor_id))).scalar_one_or_none()
    owner = await db.get(User, profile.user_id) if profile else None
    if not profile or not profile.is_active or not profile.is_verified or not owner or not owner.is_active or not owner.is_verified:
        raise HTTPException(409, "Counselor unavailable; reconcile payment")

    claim = (await db.execute(select(PaymentClaim).where(PaymentClaim.booking_id == booking_id, PaymentClaim.reference == payment.transaction_reference).order_by(PaymentClaim.created_at))).scalars().first()
    transfer = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.reference == payment.transaction_reference))).scalar_one_or_none()
    if transfer and (not claim or transfer.claim_id != claim.id):
        raise HTTPException(409, "Transfer already allocated")
    if not transfer and claim:
        db.add(VerifiedTransfer(reference=payment.transaction_reference, claim_id=claim.id, booking_id=booking_id, amount=payment.amount, status="allocated", verified_by=user.id))
        claim.status = "allocated"
    elif transfer and claim:
        transfer.status = "allocated"
        transfer.booking_id = booking_id
        claim.status = "allocated"
    db.add(AuditEvent(
        actor_id=user.id,
        target_id=booking_id,
        action="payment.approve",
        outcome="paid",
        entity_type="payment",
        metadata={"booking_id": booking.id}
    ))
    await process_successful_payment(booking_id, db)
    logger.info("PAYMENT_APPROVED actor=%s target=%s", user.id, booking_id)
    return payment
>>>>
```

#### Change 3: `claim_queue()` Queue Separation (Lines 235–256)
```python
<<<<
@router.get("/claims/queue")
async def claim_queue(page: int = Query(1, ge=1), user=Depends(require_role(["admin"])), db=Depends(get_db)):
    rows = (await db.execute(select(PaymentClaim).where(PaymentClaim.status == "open").order_by(PaymentClaim.created_at).offset((page - 1) * 50).limit(51))).scalars().all()
    items = []
    for c in rows[:50]:
        booking = await db.get(Booking, c.booking_id)
        payment = (await db.execute(select(Payment).where(Payment.booking_id == c.booking_id))).scalar_one_or_none() if booking else None
        eligible = bool(booking and booking.status == BookingStatus.pending_payment and aware(booking.scheduled_start) > datetime.now(timezone.utc))
        items.append({
            "id": c.id,
            "booking_id": c.booking_id,
            "reference": c.reference,
            "status": c.status,
            "reason": c.reason,
            "created_at": c.created_at,
            "booking_status": booking.status.value if booking else None,
            "payment_status": payment.status.value if payment else None,
            "payment_amount": str(payment.amount) if payment else "0.00",
            "eligible_for_allocation": eligible,
        })
    return {"items": items, "page": page, "has_more": len(rows) > 50}
====
@router.get("/claims/queue")
async def claim_queue(page: int = Query(1, ge=1), user=Depends(require_role(["admin"])), db=Depends(get_db)):
    # Exclude active on-time reviews currently handled in /payments/manual/queue
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
        .where(
            PaymentClaim.status == "open",
            ~PaymentClaim.booking_id.in_(active_review_subquery),
        )
        .order_by(PaymentClaim.created_at)
        .offset((page - 1) * 50)
        .limit(51)
    )
    rows = (await db.execute(query)).scalars().all()
    items = []
    for c in rows[:50]:
        booking = await db.get(Booking, c.booking_id)
        payment = (await db.execute(select(Payment).where(Payment.booking_id == c.booking_id))).scalar_one_or_none() if booking else None
        eligible = bool(booking and booking.status == BookingStatus.pending_payment and aware(booking.scheduled_start) > datetime.now(timezone.utc))
        items.append({
            "id": c.id,
            "booking_id": c.booking_id,
            "reference": c.reference,
            "status": c.status,
            "reason": getattr(c, "decision_reason", c.reason),
            "created_at": c.created_at,
            "booking_status": booking.status.value if booking else None,
            "payment_status": payment.status.value if payment else None,
            "payment_amount": str(payment.amount) if payment else "0.00",
            "eligible_for_allocation": eligible,
        })
    return {"items": items, "page": page, "has_more": len(rows) > 50}
>>>>
```

#### Change 4: `own_claims()` Response Fields (Lines 372–424)
```python
<<<<
    refund_data = None
    if transfer and transfer.status in {"refund_pending", "refunded"}:
        refund_data = {
            "status": transfer.status,
            "amount": str(transfer.amount),
            "completed_at": transfer.refunded_at.isoformat() if transfer.refunded_at else None,
        }

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
====
    rejection_reason = None
    if state == "rejected":
        for c in reversed(claims):
            reason_val = getattr(c, "decision_reason", None) or c.reason
            if c.status == "rejected" and reason_val:
                rejection_reason = reason_val
                break
        if not rejection_reason and payment and payment.review_reason:
            rejection_reason = payment.review_reason

    refund_data = None
    if transfer and transfer.status in {"refund_pending", "refunded"}:
        refund_data = {
            "status": transfer.status,
            "amount": str(transfer.amount),
            "completed_at": transfer.refunded_at.isoformat() if transfer.refunded_at else None,
        }

    return {
        "state": state,
        "submission_state": state,
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
                "reason": getattr(c, "decision_reason", c.reason),
                "created_at": c.created_at.isoformat(),
            }
            for c in claims
        ],
        "refund": refund_data,
    }
>>>>
```

---

## 5. Verification Method

### 5.1 Test Execution Commands
Run from the project root (`/home/scarecrow/dev/booking_system`):

1. **Targeted Pytest Run**:
   ```bash
   PYTHONPATH=backend backend/.venv/bin/pytest backend/tests/test_ledger_and_reconciliation.py backend/tests/test_payments.py -v
   ```
2. **Full Pytest Suite**:
   ```bash
   PYTHONPATH=backend backend/.venv/bin/pytest backend/tests/
   ```
3. **Frontend Type Check**:
   ```bash
   npx --prefix frontend-landing tsc --noEmit
   ```

### 5.2 Recommended New Regression Tests
To be added to `backend/tests/test_ledger_and_reconciliation.py`:
- `test_on_time_payment_rejection_sync_and_hold_active(db)`:
  1. Submits on-time reference for a booking (`status == pending_payment`).
  2. Calls `review(..., Decision(decision="reject", reason="Reference not found on statement"))`.
  3. Asserts `Payment.status == PaymentStatus.failed`.
  4. Asserts all `PaymentClaim.status == "rejected"`.
  5. Asserts `Booking.status == BookingStatus.pending_payment` (since hold remains active).
  6. Asserts `AuditEvent` created with `action == "payment.reject"` and `outcome == "failed"`.
  7. Calls `own_claims()` and asserts `summary["submission_state"] == "rejected"` and `summary["rejection_reason"] == "Reference not found on statement"`.
  8. Calls `submit()` with corrected reference; asserts `Payment.status == PaymentStatus.review` and new claim created in `open` state.
- `test_payment_rejection_after_hold_deadline_expires_booking(db)`:
  1. Sets `booking.created_at = datetime.now(timezone.utc) - timedelta(minutes=20)`.
  2. Calls `review(..., Decision(decision="reject", reason="Invalid"))`.
  3. Asserts `Booking.status == BookingStatus.cancelled`.
  4. Asserts `PaymentClaim.status == "rejected"`.
  5. Asserts `own_claims()` returns `submission_state == "rejected"`.
- `test_queue_separation_active_on_time_review_excluded_from_claims_queue(db)`:
  1. Creates booking and submits on-time reference (`pending_payment` + `review`).
  2. Asserts `GET /payments/manual/claims/queue` has 0 items for this booking.
  3. Creates another booking with expired hold and submits late reference.
  4. Asserts `GET /payments/manual/claims/queue` includes the late claim.
- `test_payment_approve_audit_event(db)`:
  1. Approves on-time payment.
  2. Queries `AuditEvent` and asserts `action == "payment.approve"` (not `"payment_approve"`).

### 5.3 Invalidation Conditions
- Any occurrence of `psycopg.errors.UndefinedColumn` when executing against a PostgreSQL instance.
- Any test failure in existing `test_ledger_and_reconciliation.py` or `test_payments.py`.
- Any TypeScript typecheck failure in `frontend-landing`.
- Inaccurate pagination (`has_more` or item count) in `claim_queue`.
