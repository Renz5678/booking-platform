from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, or_, func
from sqlalchemy.exc import IntegrityError
from app.core.security import get_current_user, require_role
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.models.operations import PaymentClaim, VerifiedTransfer, AuditEvent
from app.schemas.payment import PaymentResponse
from app.services.account_limits import account_limit
from app.services.payment_service import process_successful_payment

router = APIRouter(prefix="/payments/manual", tags=["manual payments"])
logger = logging.getLogger(__name__)


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def submission_deadline(booking):
    return min(aware(booking.created_at) + timedelta(minutes=15), aware(booking.scheduled_start))


class Reference(BaseModel):
    reference: str = Field(min_length=6, max_length=64)

    @field_validator("reference")
    @classmethod
    def normalize(cls, value):
        import re
        value = value.strip().upper()
        if not re.fullmatch(r"[A-Z0-9-]{6,64}", value):
            raise ValueError("Use the GCash transaction reference (letters, numbers and hyphens)")
        return value


class Decision(BaseModel):
    decision: Literal["approve", "reject"]
    reason: str = Field(default="", max_length=500)


async def records(db, booking_id):
    booking = (await db.execute(select(Booking).where(Booking.id == booking_id).with_for_update())).scalar_one_or_none()
    payment = (await db.execute(select(Payment).where(Payment.booking_id == booking_id).with_for_update())).scalar_one_or_none()
    if not booking or not payment:
        raise HTTPException(404, "Booking payment not found")
    return booking, payment


@router.post("/{booking_id}/submit", response_model=PaymentResponse)
@limiter.limit("5/15minute")
async def submit(request: Request, booking_id: str, data: Reference, user=Depends(require_role(["client"])), db=Depends(get_db)):
    booking, payment = await records(db, booking_id)
    if booking.client_id != user.id:
        raise HTTPException(403, "Not your booking")

    raw_existing = (await db.execute(select(PaymentClaim).where(PaymentClaim.booking_id == booking_id, PaymentClaim.reference == data.reference))).scalars().first()
    existing_claim = raw_existing if isinstance(raw_existing, PaymentClaim) else None
    if existing_claim:
        return payment

    if payment.status in {PaymentStatus.paid, PaymentStatus.refund_pending, PaymentStatus.refunded}:
        raise HTTPException(409, "Payment already settled; contact support for corrections")

    await account_limit("payment_claim_submit", user.id, 10, 900)

    # Limit maximum claims per booking
    raw_count = (await db.execute(select(func.count(PaymentClaim.id)).where(PaymentClaim.booking_id == booking_id))).scalar()
    if isinstance(raw_count, (int, float)) and raw_count >= 5:
        raise HTTPException(409, "Maximum payment claims submitted for this booking. Please contact support.")

    claim = PaymentClaim(booking_id=booking_id, reference=data.reference)
    db.add(claim)

    raw_dup = (await db.execute(select(Payment).where(Payment.transaction_reference == data.reference, Payment.id != payment.id))).scalar_one_or_none()
    duplicate_payment = raw_dup if isinstance(raw_dup, Payment) else None
    raw_transfer = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.reference == data.reference))).scalar_one_or_none()
    transfer_exists = raw_transfer if isinstance(raw_transfer, VerifiedTransfer) else None
    if duplicate_payment or transfer_exists or (payment.transaction_reference and payment.status != PaymentStatus.failed):
        claim.reason = "Duplicate or corrected claim; reconciliation required"
        await db.commit()
        return payment

    payment.transaction_reference = data.reference
    payment.submitted_at = datetime.now(timezone.utc)
    eligible = booking.status == BookingStatus.pending_payment and payment.submitted_at < submission_deadline(booking)
    if eligible:
        payment.status = PaymentStatus.review
        payment.review_deadline = min(payment.submitted_at + timedelta(hours=24), aware(booking.scheduled_start))
        payment.reviewed_at = None
        payment.reviewed_by = None
        payment.review_reason = None
    else:
        payment.status = PaymentStatus.failed
        payment.review_reason = "Late transfer reference; administrator reconciliation required"
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # Preserve the claim even when another transaction won reference uniqueness.
        booking, payment = await records(db, booking_id)
        db.add(PaymentClaim(booking_id=booking_id, reference=data.reference, reason="Concurrent duplicate reference; reconciliation required"))
        await db.commit()
        return payment
    logger.info("PAYMENT_SUBMITTED actor=%s target=%s eligible=%s", user.id, booking_id, eligible)
    return payment


@router.get("/queue", response_model=list[PaymentResponse])
async def queue(page: int = Query(1, ge=1), user=Depends(require_role(["admin"])), db=Depends(get_db)):
    page_num = page if isinstance(page, int) else 1
    rows = await db.execute(select(Payment).where(or_(
        Payment.status.in_([PaymentStatus.review, PaymentStatus.refund_pending]),
        (Payment.status == PaymentStatus.failed) & Payment.transaction_reference.is_not(None) & Payment.reviewed_at.is_(None)
    )).order_by(Payment.created_at).offset((page_num - 1) * 50).limit(50))
    return rows.scalars().all()


@router.post("/{booking_id}/review", response_model=PaymentResponse)
@limiter.limit("20/minute")
async def review(request: Request, booking_id: str, data: Decision, user=Depends(require_role(["admin"])), db=Depends(get_db)):
    booking, payment = await records(db, booking_id)
    if payment.status == PaymentStatus.paid and data.decision == "approve":
        return payment
    if payment.status not in {PaymentStatus.review, PaymentStatus.failed} or not payment.transaction_reference:
        raise HTTPException(409, "Payment is not awaiting review")
    now_dt = datetime.now(timezone.utc)
    payment.reviewed_by = user.id
    payment.reviewed_at = now_dt
    payment.review_reason = data.reason.strip() if data.reason else ""

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
            claim.reason = data.reason.strip() if data.reason else ""
            claim.rejection_reason = data.reason.strip() if data.reason else ""
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
            metadata={"booking_id": booking.id, "reason": data.reason.strip() if data.reason else ""}
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
        metadata={"booking_id": booking.id}
    ))
    await process_successful_payment(booking_id, db)
    logger.info("PAYMENT_APPROVED actor=%s target=%s", user.id, booking_id)
    return payment


@router.post("/{booking_id}/refund", response_model=PaymentResponse)
@limiter.limit("20/minute")
async def refund(request: Request, booking_id: str, data: Reference, user=Depends(require_role(["admin"])), db=Depends(get_db)):
    booking, payment = await records(db, booking_id)
    if payment.status == PaymentStatus.refunded and payment.refund_reference == data.reference:
        return payment
    if payment.status != PaymentStatus.refund_pending:
        raise HTTPException(409, "No pending refund")

    # Authoritative ledger check: refund reference uniqueness once across all workflows
    raw_collision = (await db.execute(select(VerifiedTransfer).where(
        or_(VerifiedTransfer.refund_reference == data.reference, VerifiedTransfer.reference == data.reference)
    ))).scalar_one_or_none()
    collision = raw_collision if isinstance(raw_collision, VerifiedTransfer) else None
    if collision:
        raise HTTPException(409, "Refund reference already recorded")

    raw_transfer = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.booking_id == booking_id).with_for_update())).scalar_one_or_none()
    transfer = raw_transfer if isinstance(raw_transfer, VerifiedTransfer) else None
    if not transfer and payment.transaction_reference:
        raw_ref_transfer = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.reference == payment.transaction_reference).with_for_update())).scalar_one_or_none()
        transfer = raw_ref_transfer if isinstance(raw_ref_transfer, VerifiedTransfer) else None
    now_dt = datetime.now(timezone.utc)
    if not transfer:
        transfer = VerifiedTransfer(
            reference=payment.transaction_reference or f"MANUAL-{booking_id}",
            claim_id=booking_id,
            booking_id=booking_id,
            amount=getattr(payment, "amount", Decimal("0.00")),
            status="refunded",
            refund_reference=data.reference,
            refunded_at=now_dt,
            refunded_by=user.id,
            verified_by=user.id,
        )
        db.add(transfer)
    else:
        transfer.refund_reference = data.reference
        transfer.status = "refunded"
        transfer.refunded_at = now_dt
        transfer.refunded_by = user.id

    payment.refund_reference = data.reference
    payment.refunded_at = now_dt
    payment.status = PaymentStatus.refunded
    payment.reviewed_by = user.id

    # Update associated claim if present
    try:
        import inspect
        raw_res = await db.execute(select(PaymentClaim).where(PaymentClaim.booking_id == booking_id, PaymentClaim.status.in_(["open", "allocated", "refund_pending"])))
        raw_scalars = raw_res.scalars() if hasattr(raw_res, "scalars") else None
        raw_claim = raw_scalars.first() if raw_scalars and hasattr(raw_scalars, "first") else None
        if inspect.iscoroutine(raw_claim):
            raw_claim = await raw_claim
        if isinstance(raw_claim, PaymentClaim):
            raw_claim.status = "refunded"
    except Exception:
        pass

    db.add(AuditEvent(actor_id=user.id, target_id=booking_id, action="refund_completed", outcome="refunded"))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Refund reference already recorded")
    logger.info("REFUND_RECORDED actor=%s target=%s", user.id, booking_id)
    return payment


@router.get("/claims/queue")
async def claim_queue(page: int = Query(1, ge=1), user=Depends(require_role(["admin"])), db=Depends(get_db)):
    # Exclude claims where booking is currently in active on-time review
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
            "reason": getattr(c, "rejection_reason", None) or getattr(c, "decision_reason", None) or c.reason,
            "created_at": c.created_at,
            "booking_status": booking.status.value if booking else None,
            "payment_status": payment.status.value if payment else None,
            "payment_amount": str(payment.amount) if payment else "0.00",
            "eligible_for_allocation": eligible,
        })
    return {"items": items, "page": page, "has_more": len(rows) > 50}


@router.get("/refunds/queue")
async def refund_queue(page: int = Query(1, ge=1), user=Depends(require_role(["admin"])), db=Depends(get_db)):
    rows = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.status == "refund_pending").order_by(VerifiedTransfer.created_at).offset((page - 1) * 50).limit(51))).scalars().all()
    items = []
    for t in rows[:50]:
        items.append({
            "id": t.id,
            "booking_id": t.booking_id,
            "reference": t.reference,
            "amount": str(t.amount),
            "source": "cancellation" if t.booking_id else "late_transfer",
            "status": t.status,
            "created_at": t.created_at,
        })
    return {"items": items, "page": page, "has_more": len(rows) > 50}


class Reconcile(BaseModel):
    decision: Literal["reject", "duplicate", "allocate", "refund"]
    reason: str = Field(min_length=3, max_length=500)
    amount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=10, decimal_places=2)


@router.post("/claims/{claim_id}/reconcile")
async def reconcile(claim_id: str, data: Reconcile, user=Depends(require_role(["admin"])), db=Depends(get_db)):
    candidate = await db.get(PaymentClaim, claim_id)
    if not candidate:
        raise HTTPException(404, "Claim not found")
    booking, payment = await records(db, candidate.booking_id)
    claim = (await db.execute(select(PaymentClaim).where(PaymentClaim.id == claim_id).with_for_update())).scalar_one()
    if claim.status != "open":
        return {"status": claim.status}

    if data.decision == "reject":
        claim.status = "rejected"
    elif data.decision == "duplicate":
        claim.status = "duplicate"
    elif data.decision == "allocate":
        # Check booking still eligible
        if booking.status != BookingStatus.pending_payment or aware(booking.scheduled_start) <= datetime.now(timezone.utc):
            raise HTTPException(409, "Booking hold expired or cancelled; cannot allocate funds")
        if data.amount != payment.amount:
            raise HTTPException(422, f"Allocation amount {data.amount} must match booking amount {payment.amount}")
        exists = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.reference == claim.reference))).scalar_one_or_none()
        if exists and exists.status not in {"open", "refund_pending"}:
            raise HTTPException(409, "Transfer already allocated to another booking")
        payment.transaction_reference = claim.reference
        payment.submitted_at = claim.created_at
        payment.status = PaymentStatus.review
        payment.review_deadline = min(datetime.now(timezone.utc) + timedelta(hours=24), aware(booking.scheduled_start))
        claim.status = "allocated"
    elif data.decision == "refund":
        if data.amount <= 0:
            raise HTTPException(422, "Record the actual received amount")
        exists = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.reference == claim.reference))).scalar_one_or_none()
        if exists:
            raise HTTPException(409, "Transfer already accounted for; reject duplicate claim")
        db.add(VerifiedTransfer(reference=claim.reference, claim_id=claim.id, booking_id=claim.booking_id, amount=data.amount, status="refund_pending", verified_by=user.id))
        claim.status = "refund_pending"

    claim.reason = data.reason
    db.add(AuditEvent(actor_id=user.id, target_id=claim.id, action="claim_reconcile", outcome=claim.status))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Transfer already accounted for")
    return {"status": claim.status}


@router.post("/transfers/{transfer_id}/refund")
async def refund_transfer(transfer_id: str, data: Reference, user=Depends(require_role(["admin"])), db=Depends(get_db)):
    transfer = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.id == transfer_id).with_for_update())).scalar_one_or_none()
    if not transfer:
        raise HTTPException(404, "Transfer not found")
    if transfer.status == "refunded" and transfer.refund_reference == data.reference:
        return {"status": "refunded"}
    if transfer.status != "refund_pending":
        raise HTTPException(409, "No pending refund")

    # Uniqueness check across incoming and outgoing references
    collision = (await db.execute(select(VerifiedTransfer).where(
        or_(VerifiedTransfer.refund_reference == data.reference, VerifiedTransfer.reference == data.reference)
    ))).scalar_one_or_none()
    if collision:
        raise HTTPException(409, "Refund reference already used")

    now_dt = datetime.now(timezone.utc)
    transfer.refund_reference = data.reference
    transfer.status = "refunded"
    transfer.refunded_at = now_dt
    transfer.refunded_by = user.id

    claim = await db.get(PaymentClaim, transfer.claim_id)
    if claim:
        claim.status = "refunded"

    if transfer.booking_id:
        payment = (await db.execute(select(Payment).where(Payment.booking_id == transfer.booking_id).with_for_update())).scalar_one_or_none()
        if payment and payment.status == PaymentStatus.refund_pending:
            payment.status = PaymentStatus.refunded
            payment.refund_reference = data.reference
            payment.refunded_at = now_dt
            payment.reviewed_by = user.id

    db.add(AuditEvent(actor_id=user.id, target_id=transfer.id, action="reconciliation_refund", outcome="refunded"))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Refund reference already used")
    return {"status": "refunded"}


@router.get("/{booking_id}/claims")
async def own_claims(booking_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    booking = await db.get(Booking, booking_id)
    if not booking or (booking.client_id != user.id and user.role.value != "admin"):
        raise HTTPException(404, "Booking not found")
    payment = (await db.execute(select(Payment).where(Payment.booking_id == booking_id))).scalar_one_or_none()
    claims = (await db.execute(select(PaymentClaim).where(PaymentClaim.booking_id == booking_id).order_by(PaymentClaim.created_at))).scalars().all()
    transfer = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.booking_id == booking_id))).scalar_one_or_none()

    now_dt = datetime.now(timezone.utc)
    sub_deadline = submission_deadline(booking)

    # Derive authoritative state
    if payment and payment.status == PaymentStatus.paid or booking.status == BookingStatus.confirmed:
        state = "paid"
    elif payment and payment.status == PaymentStatus.refunded:
        state = "refunded"
    elif payment and payment.status == PaymentStatus.refund_pending:
        state = "refund_pending"
    elif any(c.status in {"refund_pending", "refunded"} for c in claims):
        state = "refunded" if all(c.status == "refunded" for c in claims if c.status in {"refund_pending", "refunded"}) else "refund_pending"
    elif payment and payment.status == PaymentStatus.review or any(c.status == "allocated" for c in claims):
        state = "under_review"
    elif any(c.status == "open" for c in claims):
        state = "reconciliation"
    elif any(c.status == "rejected" for c in claims) and not any(c.status == "open" for c in claims):
        state = "rejected"
    elif booking.status == BookingStatus.cancelled:
        state = "expired"
    elif now_dt > sub_deadline:
        state = "expired"
    else:
        state = "awaiting_submission"

    rejection_reason = None
    if state == "rejected":
        for c in reversed(claims):
            reason_val = getattr(c, "rejection_reason", None) or getattr(c, "decision_reason", None) or c.reason
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
                "reason": getattr(c, "rejection_reason", None) or getattr(c, "decision_reason", None) or c.reason,
                "created_at": c.created_at.isoformat(),
            }
            for c in claims
        ],
        "refund": refund_data,
    }
