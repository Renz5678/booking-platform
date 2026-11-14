from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock
import pytest
from sqlalchemy import select
from app.models.user import User, RoleEnum
from app.models.operations import OutboxJob, RecoveryToken
from app.services.auth_service import get_password_hash, verify_password
from app.core.encryption import decrypt_token
from app.routers.recovery import digest

pytestmark = pytest.mark.asyncio


async def test_recovery_single_use_and_no_plaintext(async_client, db):
    user = User(email="recovery@example.com", full_name="Recovery Client", password_hash=get_password_hash("Password123"), role=RoleEnum.client, is_verified=True)
    db.add(user)
    await db.commit()
    response = await async_client.post("/auth/password-reset/request", json={"email": "RECOVERY@example.com", "captcha_token": "dummy_token"})
    assert response.status_code == 200
    job = (await db.execute(select(OutboxJob).where(OutboxJob.kind == "reset_email"))).scalar_one()
    token = decrypt_token(job.payload["encrypted_secret"])
    assert token not in str(job.payload)
    stored = await db.get(RecoveryToken, digest(token))
    assert stored.user_id == user.id
    data = {"token": token, "new_password": "ChangedPassword123"}
    assert (await async_client.post("/auth/password-reset/confirm", json=data)).status_code == 200
    assert (await async_client.post("/auth/password-reset/confirm", json=data)).status_code == 400
    await db.refresh(user)
    assert verify_password(data["new_password"], user.password_hash)


async def test_unknown_recovery_is_generic(async_client):
    response = await async_client.post("/auth/password-reset/request", json={"email": "unknown@example.com", "captcha_token": "dummy_token"})
    assert response.status_code == 200
    assert "eligible" in response.json()["msg"]


async def test_outbox_failure_is_retryable_and_sanitized(db):
    from conftest import TestingSessionLocal
    from app.services.outbox import dispatch
    job = OutboxJob(operation_key="failure", kind="test", payload={})
    db.add(job)
    await db.commit()
    with patch("app.services.outbox.execute", AsyncMock(side_effect=RuntimeError("secret token must not be logged"))):
        await dispatch(TestingSessionLocal)
    await db.refresh(job)
    assert job.status == "pending"
    assert job.attempts == 1
    assert job.error_code == "RuntimeError"
    assert job.lease_until is None


async def test_unauthorized_document_download(async_client):
    assert (await async_client.get("/counselors/unknown/credentials/download")).status_code == 401


async def make_payment(db):
    from app.models import Booking, BookingStatus, CounselorProfile, Payment, PaymentStatus
    client = User(email="payer@example.com", full_name="Payer", password_hash="unused", role=RoleEnum.client, is_verified=True)
    staff = User(email="staff@example.com", full_name="Staff", password_hash="unused", role=RoleEnum.counselor, is_verified=True)
    db.add_all([client, staff]); await db.flush()
    profile = CounselorProfile(user_id=staff.id, is_active=True, is_verified=True)
    db.add(profile); await db.flush()
    start = datetime.now(timezone.utc) + timedelta(days=3)
    booking = Booking(client_id=client.id, counselor_id=profile.id, scheduled_start=start, scheduled_end=start+timedelta(hours=1), status=BookingStatus.pending_payment)
    db.add(booking); await db.flush()
    payment = Payment(booking_id=booking.id, amount=300, provider="gcash_manual", status=PaymentStatus.pending)
    db.add(payment); await db.commit()
    return client, booking, payment


async def test_approval_queues_delivery_without_provider_calls(db):
    from starlette.requests import Request
    from types import SimpleNamespace
    from app.routers.payment_review import submit, review, Reference, Decision
    client, booking, payment = await make_payment(db)
    request = Request({"type": "http", "path": "/", "headers": []})
    await submit(request, booking.id, Reference(reference="GCASH123"), client, db)
    with patch("app.services.calendar_service.create_google_meet_event", AsyncMock(side_effect=AssertionError("Must not call provider in approval"))):
        await review(request, booking.id, Decision(decision="approve"), SimpleNamespace(id="admin"), db)
    await db.refresh(payment)
    assert payment.status.value == "paid"
    jobs = (await db.execute(select(OutboxJob).where(OutboxJob.kind == "calendar"))).scalars().all()
    assert len(jobs) == 1
    await review(request, booking.id, Decision(decision="approve"), SimpleNamespace(id="admin"), db)
    assert len((await db.execute(select(OutboxJob).where(OutboxJob.kind == "calendar"))).scalars().all()) == 1


async def test_late_transfer_refund_does_not_revive_booking(db):
    from starlette.requests import Request
    from types import SimpleNamespace
    from app.models import BookingStatus
    from app.models.operations import PaymentClaim, VerifiedTransfer
    from app.routers.payment_review import submit, reconcile, refund_transfer, Reference, Reconcile
    client, booking, payment = await make_payment(db)
    booking.status = BookingStatus.cancelled
    await db.commit()
    request = Request({"type": "http", "path": "/", "headers": []})
    await submit(request, booking.id, Reference(reference="LATE123"), client, db)
    claim = (await db.execute(select(PaymentClaim))).scalar_one()
    admin = SimpleNamespace(id="admin")
    await reconcile(claim.id, Reconcile(decision="refund", reason="Verified late transfer", amount=300), admin, db)
    transfer = (await db.execute(select(VerifiedTransfer))).scalar_one()
    await refund_transfer(transfer.id, Reference(reference="RETURN123"), admin, db)
    await refund_transfer(transfer.id, Reference(reference="RETURN123"), admin, db)
    await db.refresh(booking)
    assert booking.status == BookingStatus.cancelled
    assert transfer.status == "refunded"


async def test_private_download_denies_other_client(db):
    from app.models.counselor_profile import CounselorProfile
    from app.routers.counselors import download_credentials
    from fastapi import HTTPException
    client, booking, payment = await make_payment(db)
    with pytest.raises(HTTPException) as error:
        await download_credentials(booking.counselor_id, client, db)
    assert error.value.status_code == 404


async def test_outbox_exhaustion_surfaces_failure(db):
    from conftest import TestingSessionLocal
    from app.services.outbox import dispatch
    job = OutboxJob(operation_key="exhausted", kind="test", payload={}, attempts=7)
    db.add(job); await db.commit()
    with patch("app.services.outbox.execute", AsyncMock(side_effect=RuntimeError("private failure"))):
        await dispatch(TestingSessionLocal)
    await db.refresh(job)
    assert job.status == "failed"
    assert job.attempts == 8
