from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid
import pytest
from sqlalchemy import select
from app.models.user import User, RoleEnum
from app.models.counselor_profile import CounselorProfile
from app.models.availability import Availability
from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.models.operations import PaymentClaim, VerifiedTransfer, OutboxJob, AuditEvent
from app.routers.payment_review import Reference, Decision, Reconcile, submit, review, refund, queue, claim_queue, refund_queue, reconcile, refund_transfer, own_claims
from types import SimpleNamespace
from starlette.requests import Request
from fastapi import HTTPException

pytestmark = pytest.mark.asyncio


def req():
    return Request({"type": "http", "path": "/", "headers": []})


async def seed_data(db, suffix=None):
    tag = suffix or uuid.uuid4().hex[:8]
    client = User(email=f"client_{tag}@example.com", full_name="Client User", password_hash="hash", role=RoleEnum.client, is_verified=True)
    counselor_user = User(email=f"counselor_{tag}@example.com", full_name="Counselor User", password_hash="hash", role=RoleEnum.counselor, is_verified=True)
    admin = User(email=f"admin_{tag}@example.com", full_name="Admin User", password_hash="hash", role=RoleEnum.admin, is_verified=True)
    db.add_all([client, counselor_user, admin])
    await db.flush()

    profile = CounselorProfile(user_id=counselor_user.id, is_active=True, is_verified=True, bio="Bio")
    db.add(profile)
    await db.flush()

    now = datetime.now(timezone.utc)
    start = now + timedelta(days=2)
    booking = Booking(
        client_id=client.id,
        counselor_id=profile.id,
        scheduled_start=start,
        scheduled_end=start + timedelta(hours=1),
        status=BookingStatus.pending_payment,
    )
    db.add(booking)
    await db.flush()

    payment = Payment(
        booking_id=booking.id,
        amount=Decimal("300.00"),
        currency="PHP",
        status=PaymentStatus.pending,
        provider="gcash_manual",
    )
    db.add(payment)
    await db.commit()
    return client, counselor_user, admin, booking, payment


async def test_claim_submission_and_booking_claims_limit(db):
    client, _, admin, booking, payment = await seed_data(db)

    # Submit 1st claim
    res = await submit(req(), booking.id, Reference(reference="CLAIM101"), client, db)
    assert res.status == PaymentStatus.review
    assert payment.transaction_reference == "CLAIM101"

    # Idempotent retry with same reference returns same payment
    res_retry = await submit(req(), booking.id, Reference(reference="CLAIM101"), client, db)
    assert res_retry.status == PaymentStatus.review

    # Submit corrected/duplicate claims up to 5
    for i in range(2, 5):
        await submit(req(), booking.id, Reference(reference=f"CLAIM10{i}"), client, db)

    claims = (await db.execute(select(PaymentClaim).where(PaymentClaim.booking_id == booking.id))).scalars().all()
    assert len(claims) == 4

    # 5th claim succeeds
    await submit(req(), booking.id, Reference(reference="CLAIM105"), client, db)

    # 6th claim raises 409
    with pytest.raises(HTTPException) as exc:
        await submit(req(), booking.id, Reference(reference="CLAIM106"), client, db)
    assert exc.value.status_code == 409


async def test_one_ledger_invariant_cancellation_and_transfer_refunds(db):
    client, _, admin, booking, payment = await seed_data(db)

    # Submit and approve payment
    await submit(req(), booking.id, Reference(reference="PAY1001"), client, db)
    await review(req(), booking.id, Decision(decision="approve"), admin, db)
    await db.refresh(payment)
    assert payment.status == PaymentStatus.paid

    # VerifiedTransfer created on approval
    transfer = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.reference == "PAY1001"))).scalar_one()
    assert transfer.status == "allocated"
    assert transfer.booking_id == booking.id

    # Client cancels booking >= 24h before session
    from app.services.payment_service import refund_payment
    await refund_payment(booking.id, db)
    await db.refresh(payment)
    assert payment.status == PaymentStatus.refund_pending
    await db.refresh(transfer)
    assert transfer.status == "refund_pending"

    # Appears in refunds queue
    ref_queue = await refund_queue(page=1, user=admin, db=db)
    assert len(ref_queue["items"]) >= 1
    refund_item = next(item for item in ref_queue["items"] if item["id"] == transfer.id)
    assert refund_item["source"] == "cancellation"
    assert refund_item["status"] == "refund_pending"

    # Admin completes refund
    res = await refund(req(), booking.id, Reference(reference="REFUND999"), admin, db)
    assert res.status == PaymentStatus.refunded
    await db.refresh(transfer)
    assert transfer.status == "refunded"
    assert transfer.refund_reference == "REFUND999"
    assert transfer.refunded_at is not None

    # Reusing same refund reference for another refund fails
    with pytest.raises(HTTPException) as exc:
        transfer2 = VerifiedTransfer(
            reference="PAY1002",
            claim_id="dummy_claim",
            amount=Decimal("300.00"),
            status="refund_pending",
            verified_by=admin.id
        )
        db.add(transfer2)
        await db.flush()
        await refund_transfer(transfer2.id, Reference(reference="REFUND999"), admin, db)
    assert exc.value.status_code == 409


async def test_claim_reconciliation_decisions(db):
    client, _, admin, booking, payment = await seed_data(db)

    # 1. Late claim submission (past 15-min hold)
    booking.created_at = datetime.now(timezone.utc) - timedelta(minutes=20)
    await db.commit()

    await submit(req(), booking.id, Reference(reference="LATE9001"), client, db)
    claim = (await db.execute(select(PaymentClaim).where(PaymentClaim.reference == "LATE9001"))).scalar_one()
    assert claim.status == "open"

    # Check claims queue
    q = await claim_queue(page=1, user=admin, db=db)
    assert any(item["id"] == claim.id for item in q["items"])

    # Decision: duplicate
    dup_res = await reconcile(claim.id, Reconcile(decision="duplicate", reason="Already received earlier"), admin, db)
    assert dup_res["status"] == "duplicate"
    await db.refresh(claim)
    assert claim.status == "duplicate"

    # New claim for refund reconciliation
    claim2 = PaymentClaim(booking_id=booking.id, reference="LATE9002", status="open")
    db.add(claim2)
    await db.commit()

    ref_res = await reconcile(claim2.id, Reconcile(decision="refund", reason="Verified late GCash transfer", amount=Decimal("300.00")), admin, db)
    assert ref_res["status"] == "refund_pending"
    transfer = (await db.execute(select(VerifiedTransfer).where(VerifiedTransfer.claim_id == claim2.id))).scalar_one()
    assert transfer.status == "refund_pending"
    assert transfer.amount == Decimal("300.00")

    # Complete the late transfer refund
    completed = await refund_transfer(transfer.id, Reference(reference="GCASHREF01"), admin, db)
    assert completed["status"] == "refunded"
    await db.refresh(transfer)
    assert transfer.refund_reference == "GCASHREF01"
    assert transfer.status == "refunded"
    await db.refresh(claim2)
    assert claim2.status == "refunded"


async def test_client_claims_summary_endpoint(db):
    client, _, admin, booking, payment = await seed_data(db)

    # State 1: awaiting_submission
    summary = await own_claims(booking.id, client, db)
    assert summary["state"] == "awaiting_submission"
    assert summary["meeting_ready"] is False

    # State 2: under_review
    await submit(req(), booking.id, Reference(reference="CLIENT123"), client, db)
    summary = await own_claims(booking.id, client, db)
    assert summary["state"] == "under_review"
    assert len(summary["claims"]) == 1

    # State 3: paid
    await review(req(), booking.id, Decision(decision="approve"), admin, db)
    summary = await own_claims(booking.id, client, db)
    assert summary["state"] == "paid"


async def test_payment_rejection_synchronously_updates_claims_and_audit(db):
    client, _, admin, booking, payment = await seed_data(db)

    # 1. Client submits reference
    res = await submit(req(), booking.id, Reference(reference="CLAIM-REJECT-1"), client, db)
    assert res.status == PaymentStatus.review

    claim = (await db.execute(select(PaymentClaim).where(PaymentClaim.booking_id == booking.id))).scalar_one()
    assert claim.status == "open"
    assert claim.reference == "CLAIM-REJECT-1"

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
    assert claim.rejection_reason == reason_text
    assert claim.decision_reason == reason_text

    # 4. AuditEvent verification for reject
    reject_event = (await db.execute(
        select(AuditEvent).where(
            AuditEvent.action == "payment.reject",
        )
    )).scalar_one_or_none()
    assert reject_event is not None
    assert reject_event.actor_id == admin.id
    assert reject_event.outcome == "failed"
    assert reject_event.target_id == payment.id

    # 5. own_claims contract verification
    summary = await own_claims(booking.id, client, db)
    assert summary["state"] == "rejected"
    assert summary["submission_state"] == "rejected"
    assert summary["rejection_reason"] == reason_text
    assert len(summary["claims"]) == 1
    assert summary["claims"][0]["status"] == "rejected"
    assert summary["claims"][0]["reason"] == reason_text

    # 6. Verify payment.approve emits correct AuditEvent action
    client2, _, admin, booking2, payment2 = await seed_data(db)
    await submit(req(), booking2.id, Reference(reference="CLAIM-APPROVE-1"), client2, db)
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


async def test_payment_rejection_hold_expiration_vs_correction(db):
    client, _, admin, booking, payment = await seed_data(db)

    # --- Case A: Rejection during active hold window (<15m) ---
    await submit(req(), booking.id, Reference(reference="REF-WRONG-AMT"), client, db)
    await review(req(), booking.id, Decision(decision="reject", reason="Amount mismatch: expected 300"), admin, db)

    await db.refresh(booking)
    # Booking must stay pending_payment to permit resubmission
    assert booking.status == BookingStatus.pending_payment
    await db.refresh(payment)
    assert payment.status == PaymentStatus.failed

    # Client resubmits corrected reference before hold expires
    resub = await submit(req(), booking.id, Reference(reference="REF-CORRECTED-300"), client, db)
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
        transaction_reference="REF-EXPIRED-HOLD",
    )
    db.add(expired_payment)
    claim_exp = PaymentClaim(booking_id=expired_booking.id, reference="REF-EXPIRED-HOLD", status="open")
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


async def test_review_and_claims_queue_separation(db):
    client, _, admin, booking_a, payment_a = await seed_data(db)

    # 1. On-time submission for Booking A
    await submit(req(), booking_a.id, Reference(reference="ONTIME-QUEUE-REF"), client, db)
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
    claim_b = PaymentClaim(booking_id=booking_b.id, reference="RECONCILE-ONLY-REF", status="open")
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
    assert "ONTIME-QUEUE-REF" not in reconcile_refs
    # Booking B's unreconciled claim MUST appear in claims queue
    assert "RECONCILE-ONLY-REF" in reconcile_refs


async def test_cancellation_under_review_transitions_payment_and_preserves_claim(db):
    from app.routers.bookings import cancel_booking

    client, _, admin, booking, payment = await seed_data(db)

    # 1. Client submits reference
    await submit(req(), booking.id, Reference(reference="CANCEL-DURING-REV-REF"), client, db)
    await db.refresh(payment)
    assert payment.status == PaymentStatus.review

    claim = (await db.execute(select(PaymentClaim).where(PaymentClaim.booking_id == booking.id))).scalar_one()
    assert claim.status == "open"

    # Verify present in review queue and absent from claims queue before cancellation
    assert any(p.id == payment.id for p in await queue(user=admin, db=db))
    assert not any(item["reference"] == "CANCEL-DURING-REV-REF" for item in (await claim_queue(page=1, user=admin, db=db))["items"])

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
    assert any(item["reference"] == "CANCEL-DURING-REV-REF" for item in claims_queue_result["items"])

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
