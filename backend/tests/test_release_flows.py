from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import pytest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from starlette.requests import Request
from app.models.user import RoleEnum
from app.models.payment import PaymentStatus
from app.models.booking import BookingStatus
from app.routers.payment_review import submit, review, refund, Reference, Decision, submission_deadline
from app.services.oauth_state import pkce_challenge


def test_pkce_rfc7636_vector():
    assert pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"


def test_payment_submission_deadline_never_outlives_session_start():
    now = datetime.now(timezone.utc)
    assert submission_deadline(SimpleNamespace(created_at=now, scheduled_start=now + timedelta(minutes=5))) == now + timedelta(minutes=5)


def records(age=0):
    now = datetime.now(timezone.utc)
    booking = SimpleNamespace(id="booking", client_id="client", created_at=now - timedelta(minutes=age), scheduled_start=now + timedelta(days=2), status=BookingStatus.pending_payment)
    payment = SimpleNamespace(id="payment", transaction_reference=None, status=PaymentStatus.pending, review_deadline=None, paid_at=None)
    return booking, payment


def request():
    return Request({"type": "http", "path": "/", "headers": []})


@pytest.mark.asyncio
@pytest.mark.parametrize("age,expected", [(0, PaymentStatus.review), (16, PaymentStatus.failed)])
async def test_reference_submission_and_late_reconciliation(age, expected):
    booking, payment = records(age)
    with patch("app.routers.payment_review.records", AsyncMock(return_value=(booking, payment))):
        from unittest.mock import MagicMock
        db = AsyncMock()
        db.add = MagicMock()
        result_mock = MagicMock()
        result_mock.scalars.return_value.first.return_value = None
        result_mock.scalar_one_or_none.return_value = None
        db.execute.return_value = result_mock
        result = await submit(request(), "booking", Reference(reference="abc123"), SimpleNamespace(id="client"), db)
        assert result.status == expected
        assert result.transaction_reference == "ABC123"
        db.commit.assert_awaited_once()
        if expected == PaymentStatus.review:
            assert result.review_deadline <= booking.scheduled_start


@pytest.mark.asyncio
async def test_cannot_submit_another_clients_payment():
    with patch("app.routers.payment_review.records", AsyncMock(return_value=records())):
        with pytest.raises(HTTPException) as error:
            await submit(request(), "booking", Reference(reference="ABC123"), SimpleNamespace(id="other"), AsyncMock())
        assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_expired_review_cannot_revive_booking():
    booking, payment = records()
    payment.transaction_reference = "ABC123"
    payment.status = PaymentStatus.review
    payment.review_deadline = datetime.now(timezone.utc) - timedelta(seconds=1)
    with patch("app.routers.payment_review.records", AsyncMock(return_value=(booking, payment))), patch("app.routers.payment_review.process_successful_payment", AsyncMock()) as process:
        with pytest.raises(HTTPException) as error:
            await review(request(), "booking", Decision(decision="approve"), SimpleNamespace(id="admin"), AsyncMock())
        assert error.value.status_code == 409
        process.assert_not_awaited()


@pytest.mark.asyncio
async def test_completed_refund_is_idempotent_and_requires_pending_state():
    booking, payment = records()
    payment.status = PaymentStatus.refund_pending
    db = AsyncMock()
    with patch("app.routers.payment_review.records", AsyncMock(return_value=(booking, payment))):
        await refund(request(), "booking", Reference(reference="REF123"), SimpleNamespace(id="admin"), db)
        assert payment.status == PaymentStatus.refunded
        await refund(request(), "booking", Reference(reference="REF123"), SimpleNamespace(id="admin"), db)
        db.commit.assert_awaited_once()
        with pytest.raises(HTTPException):
            await refund(request(), "booking", Reference(reference="OTHER123"), SimpleNamespace(id="admin"), db)


@pytest.mark.asyncio
async def test_oauth_state_is_bound_and_consumed_once(db):
    from app.models.user import User
    from app.services.sessions import issue_session
    from app.services.oauth_state import begin, consume
    import jwt
    from app.config import settings
    user = User(email="oauth@example.com", password_hash="unused", full_name="OAuth User", is_verified=True)
    db.add(user)
    await db.commit()
    access, _ = await issue_session(db, user.id)
    sid = jwt.decode(access, settings.JWT_SECRET, algorithms=["HS256"], audience="alaga-web")["sid"]
    state, challenge = await begin(db, sid, user.id, "client")
    with pytest.raises(HTTPException):
        await consume(db, state, "another-session", user.id, "client")
    with pytest.raises(HTTPException):
        await consume(db, state, sid, user.id, "counselor")
    verifier = await consume(db, state, sid, user.id, "client")
    assert pkce_challenge(verifier) == challenge
    with pytest.raises(HTTPException):
        await consume(db, state, sid, user.id, "client")


@pytest.mark.asyncio
async def test_oversized_request_rejected_before_parsing(async_client):
    result = await async_client.post("/auth/signup", content=b"x" * (64 * 1024 + 1), headers={"content-type": "application/json"})
    assert result.status_code == 413
