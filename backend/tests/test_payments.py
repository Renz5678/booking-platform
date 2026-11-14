"""Manual transfers remain unconfirmed until an MFA-authenticated admin reviews them."""
from datetime import datetime, timedelta, timezone, time
import pytest
from sqlalchemy import select
from app.models.user import User, RoleEnum
from app.models.counselor_profile import CounselorProfile
from app.models.availability import Availability
from app.models.payment import Payment, PaymentStatus
from app.services.mfa import totp
import time as clock

pytestmark = pytest.mark.asyncio


async def account(client, db, email, role):
    await client.post("/auth/signup", json={"email": email, "password": "Password123", "full_name": "Test Account", "captcha_token": "dummy"})
    user = (await db.execute(select(User).where(User.email == email))).scalar_one()
    user.role, user.is_verified = role, True
    await db.commit()
    return user


async def login(client, email, *, mfa=False):
    client.cookies.clear()
    response = await client.post("/auth/login", json={"email": email, "password": "Password123"})
    assert response.status_code == 200
    if mfa:
        assert (await client.get("/admin/bookings")).status_code == 403
        enrollment = await client.post("/auth/mfa/enroll")
        assert enrollment.status_code == 200
        result = await client.post("/auth/mfa/verify", json={"code": totp(enrollment.json()["secret"], int(clock.time()) // 30)})
        assert result.status_code == 200
        assert len(result.json()["recovery_codes"]) == 10
    return dict(client.cookies)


async def setup_booking(client, db):
    counselor = await account(client, db, "counselor@example.com", RoleEnum.counselor)
    profile = CounselorProfile(user_id=counselor.id, is_active=True, is_verified=True, bio="Test")
    db.add(profile)
    await db.flush()
    for day in range(7):
        db.add(Availability(counselor_id=profile.id, day_of_week=day, is_recurring=True, start_time=time(0), end_time=time(23, 59)))
    await db.commit()
    await account(client, db, "client@example.com", RoleEnum.client)
    client_cookies = await login(client, "client@example.com")
    start = (datetime.now(timezone.utc) + timedelta(days=3)).replace(hour=1, minute=0, second=0, microsecond=0)
    response = await client.post("/bookings/", json={"counselor_id": profile.id, "scheduled_start": start.isoformat(), "scheduled_end": (start + timedelta(hours=1)).isoformat(), "intake_concern_category": "General", "intake_notes": "Private client note", "captcha_token": "mock_captcha_token"})
    assert response.status_code == 201, response.text
    await account(client, db, "admin@example.com", RoleEnum.admin)
    return response.json()["booking_id"], client_cookies


async def test_manual_payment_review_requires_admin_mfa(async_client, db):
    booking_id, client_cookies = await setup_booking(async_client, db)
    async_client.cookies.update(client_cookies)
    submitted = await async_client.post(f"/payments/manual/{booking_id}/submit", json={"reference": "gcash123"})
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["status"] == "review"
    assert (await async_client.get("/payments/manual/queue")).status_code == 403
    admin_cookies = await login(async_client, "admin@example.com", mfa=True)
    queue = await async_client.get("/payments/manual/queue")
    assert queue.status_code == 200 and len(queue.json()) == 1
    approval = await async_client.post(f"/payments/manual/{booking_id}/review", json={"decision": "approve"})
    assert approval.status_code == 200, approval.text
    assert approval.json()["status"] == "paid"
    detail = await async_client.get(f"/bookings/{booking_id}")
    assert detail.json()["intake_form"] is None
    assert (await async_client.post(f"/payments/manual/{booking_id}/review", json={"decision": "approve"})).status_code == 200
    async_client.cookies.clear()
    async_client.cookies.update(client_cookies)
    assert (await async_client.get(f"/bookings/{booking_id}/receipt")).status_code == 200


async def test_manual_refund_is_pending_until_actual_transfer(async_client, db):
    booking_id, client_cookies = await setup_booking(async_client, db)
    async_client.cookies.update(client_cookies)
    await async_client.post(f"/payments/manual/{booking_id}/submit", json={"reference": "GCASH456"})
    admin_cookies = await login(async_client, "admin@example.com", mfa=True)
    assert (await async_client.post(f"/payments/manual/{booking_id}/review", json={"decision": "approve"})).status_code == 200
    async_client.cookies.clear()
    async_client.cookies.update(client_cookies)
    cancelled = await async_client.post(f"/bookings/{booking_id}/cancel")
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["refund_issued"] is False
    db.expire_all()
    payment = (await db.execute(select(Payment).where(Payment.booking_id == booking_id))).scalar_one()
    assert payment.status == PaymentStatus.refund_pending
    async_client.cookies.clear()
    async_client.cookies.update(admin_cookies)
    result = await async_client.post(f"/payments/manual/{booking_id}/refund", json={"reference": "RETURN456"})
    assert result.status_code == 200 and result.json()["status"] == "refunded"
    assert (await async_client.post(f"/payments/manual/{booking_id}/refund", json={"reference": "RETURN456"})).status_code == 200
