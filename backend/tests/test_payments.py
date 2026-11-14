from datetime import datetime, time, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.availability import Availability
from app.models.booking import Booking, BookingStatus
from app.models.counselor_profile import CounselorProfile
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.user import RoleEnum, User
from app.services.calendar_service import MANILA_TZ

pytestmark = pytest.mark.asyncio


async def _setup_counselor_and_client(
    async_client: AsyncClient, db: AsyncSession, target_date
):
    c_data = {
        "email": "c_pay@example.com",
        "password": "Password123",
        "full_name": "C Pay",
        "captcha_token": "dummy",
    }
    cli_data = {
        "email": "cli_pay@example.com",
        "password": "Password123",
        "full_name": "Cli Pay",
        "captcha_token": "dummy",
    }
    with patch("app.routers.auth.send_verification_email", new_callable=AsyncMock):
        for payload in (c_data, cli_data):
            resp = await async_client.post("/auth/signup", json=payload)
            assert resp.status_code == 201

    c_user = (
        await db.execute(select(User).where(User.email == c_data["email"]))
    ).scalar_one()
    c_user.role = RoleEnum.counselor
    c_user.is_verified = True

    cli_user = (
        await db.execute(select(User).where(User.email == cli_data["email"]))
    ).scalar_one()
    cli_user.is_verified = True
    await db.commit()

    profile = CounselorProfile(
        user_id=c_user.id, is_active=True, is_verified=True, bio="Test"
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    db.add(
        Availability(
            counselor_id=profile.id,
            day_of_week=target_date.weekday(),
            start_time=time(9, 0),
            end_time=time(17, 0),
            is_recurring=True,
        )
    )
    await db.commit()

    c_login = await async_client.post(
        "/auth/login",
        json={"email": c_data["email"], "password": c_data["password"]},
    )
    cli_login = await async_client.post(
        "/auth/login",
        json={"email": cli_data["email"], "password": cli_data["password"]},
    )
    return (
        profile,
        {"access_token": c_login.cookies["access_token"]},
        {"access_token": cli_login.cookies["access_token"]},
    )


async def test_manual_payment_proof_counselor_verify_and_reject(
    async_client: AsyncClient, db: AsyncSession
):
    target_date = datetime.now(MANILA_TZ).date() + timedelta(days=2)
    day_str = target_date.isoformat()
    profile, c_cookies, cli_cookies = await _setup_counselor_and_client(
        async_client, db, target_date
    )

    # 1. Create booking (no PayMongo checkout; manual 1-hour verification window)
    booking_req = {
        "counselor_id": profile.id,
        "scheduled_start": f"{day_str}T10:00:00+08:00",
        "scheduled_end": f"{day_str}T11:00:00+08:00",
        "intake_concern_category": "Anxiety",
        "captcha_token": "mock_captcha_token",
        "honeypot": "",
    }
    booking_resp = await async_client.post(
        "/bookings/", json=booking_req, cookies=cli_cookies
    )
    assert booking_resp.status_code == 201
    booking_body = booking_resp.json()
    assert booking_body["payment_window_minutes"] == 60
    booking_id = booking_body["booking_id"]

    # 2. Client submits optional reference number & receipt image
    proof_resp = await async_client.post(
        f"/payments/{booking_id}/proof",
        data={"reference_number": "GCASH-998877", "payment_method": "gcash"},
        files={"file": ("receipt.png", b"\x89PNG\r\n\x1a\nfake", "image/png")},
        cookies=cli_cookies,
    )
    assert proof_resp.status_code == 200
    proof_json = proof_resp.json()
    assert proof_json["provider"] == "manual"
    assert proof_json["provider_payment_id"] == "GCASH-998877"
    assert proof_json["payment_method"] == "gcash"
    assert proof_json["proof_url"].startswith("data:image/png;base64,")

    # 3. Counselor verifies payment -> confirms booking & creates Google Meet
    with (
        patch(
            "app.services.payment_service.create_google_meet_event",
            new=AsyncMock(return_value=("https://meet.google.com/abc-defg-hij", "evt_pay_1")),
        ),
        patch(
            "app.services.payment_service.send_booking_confirmation",
            new_callable=AsyncMock,
        ),
        patch("app.tasks.reminders.send_session_reminder_task.apply_async"),
    ):
        verify_resp = await async_client.post(
            f"/payments/{booking_id}/verify", cookies=c_cookies
        )
    assert verify_resp.status_code == 200

    updated_booking = (
        await db.execute(select(Booking).where(Booking.id == booking_id))
    ).scalar_one()
    assert updated_booking.status == BookingStatus.confirmed
    assert updated_booking.meeting_link == "https://meet.google.com/abc-defg-hij"

    updated_payment = (
        await db.execute(select(Payment).where(Payment.booking_id == booking_id))
    ).scalar_one()
    assert updated_payment.status == PaymentStatus.paid
    assert updated_payment.provider_payment_id == "GCASH-998877"
    assert updated_payment.payment_method == PaymentMethod.gcash
    assert updated_payment.paid_at is not None

    # 4. Second booking rejected by counselor -> cancelled & failed
    booking_req2 = {
        "counselor_id": profile.id,
        "scheduled_start": f"{day_str}T14:00:00+08:00",
        "scheduled_end": f"{day_str}T15:00:00+08:00",
        "intake_concern_category": "Stress",
        "captcha_token": "mock_captcha_token",
        "honeypot": "",
    }
    booking_resp2 = await async_client.post(
        "/bookings/", json=booking_req2, cookies=cli_cookies
    )
    assert booking_resp2.status_code == 201
    booking_id2 = booking_resp2.json()["booking_id"]

    with patch(
        "app.routers.payments.send_cancellation_email", new_callable=AsyncMock
    ) as mock_cancel_email:
        reject_resp = await async_client.post(
            f"/payments/{booking_id2}/reject", cookies=c_cookies
        )
    assert reject_resp.status_code == 200
    assert mock_cancel_email.await_count == 1

    b2 = (
        await db.execute(select(Booking).where(Booking.id == booking_id2))
    ).scalar_one()
    assert b2.status == BookingStatus.cancelled
    p2 = (
        await db.execute(select(Payment).where(Payment.booking_id == booking_id2))
    ).scalar_one()
    assert p2.status == PaymentStatus.failed
