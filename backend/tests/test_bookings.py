from datetime import datetime, time, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.encryption import encrypt_token
from app.models.availability import Availability
from app.models.booking import Booking, BookingStatus
from app.models.counselor_profile import CounselorProfile
from app.models.payment import Payment, PaymentStatus
from app.models.user import RoleEnum, User
from app.services.booking_service import (
    cancel_stale_pending_bookings,
    check_counselor_availability,
)
from app.services.calendar_service import MANILA_TZ

pytestmark = pytest.mark.asyncio


async def test_booking_flow_timezone_and_calendar_sync(
    async_client: AsyncClient, db: AsyncSession
):
    # 1. Create a verified counselor with Google Calendar connected and Manila availability
    counselor_data = {
        "email": "counselor_book@example.com",
        "password": "Password123",
        "full_name": "Counselor Book",
        "captcha_token": "dummy",
    }
    with patch("app.routers.auth.send_verification_email", new_callable=AsyncMock):
        resp = await async_client.post("/auth/signup", json=counselor_data)
    assert resp.status_code == 201

    counselor_user = (
        await db.execute(select(User).where(User.email == counselor_data["email"]))
    ).scalar_one()
    counselor_user.role = RoleEnum.counselor
    counselor_user.is_verified = True
    await db.commit()

    profile = CounselorProfile(
        user_id=counselor_user.id,
        is_active=True,
        is_verified=True,
        bio="Test",
        specialization_tags=["Stress"],
        google_calendar_connected=True,
        google_refresh_token=encrypt_token("fake-refresh-token"),
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    tomorrow_manila = datetime.now(MANILA_TZ).date() + timedelta(days=1)
    avail = Availability(
        counselor_id=profile.id,
        day_of_week=tomorrow_manila.weekday(),
        start_time=time(9, 0),
        end_time=time(17, 0),
        is_recurring=True,
    )
    db.add(avail)
    await db.commit()

    # 2. Verify slots endpoint returns Asia/Manila (+08:00) timestamps & reflects Google busy times
    day_str = tomorrow_manila.isoformat()
    gcal_busy = [
        (
            datetime.combine(tomorrow_manila, time(11, 0), tzinfo=MANILA_TZ),
            datetime.combine(tomorrow_manila, time(12, 0), tzinfo=MANILA_TZ),
        )
    ]
    with patch(
        "app.services.availability_service.get_google_calendar_busy_intervals",
        new=AsyncMock(return_value=gcal_busy),
    ):
        slots_resp = await async_client.get(
            f"/availability/{profile.id}/slots?start_date={day_str}&end_date={day_str}&duration=60"
        )
    assert slots_resp.status_code == 200
    day_slots = slots_resp.json()[day_str]
    assert f"{day_str}T09:00:00+08:00" in day_slots["available"]
    assert f"{day_str}T11:00:00+08:00" in day_slots["occupied"]

    # 3. Create client and log in
    client_data = {
        "email": "client_book@example.com",
        "password": "Password123",
        "full_name": "Client Book",
        "captcha_token": "dummy",
    }
    with patch("app.routers.auth.send_verification_email", new_callable=AsyncMock):
        resp = await async_client.post("/auth/signup", json=client_data)
    assert resp.status_code == 201
    client_user = (
        await db.execute(select(User).where(User.email == client_data["email"]))
    ).scalar_one()
    client_user.is_verified = True
    await db.commit()

    login_resp = await async_client.post(
        "/auth/login",
        json={"email": client_data["email"], "password": client_data["password"]},
    )
    cookies = {"access_token": login_resp.cookies["access_token"]}

    # 4. Reject booking outside counselor availability blocks
    outside_req = {
        "counselor_id": profile.id,
        "scheduled_start": f"{day_str}T20:00:00+08:00",
        "scheduled_end": f"{day_str}T21:00:00+08:00",
        "intake_concern_category": "Stress",
        "intake_notes": "Late evening",
        "captcha_token": "mock_captcha_token",
    }
    outside_resp = await async_client.post(
        "/bookings/", json=outside_req, cookies=cookies
    )
    assert outside_resp.status_code == 400

    # 5. Create valid booking in Asia/Manila
    booking_req = {
        "counselor_id": profile.id,
        "scheduled_start": f"{day_str}T10:00:00+08:00",
        "scheduled_end": f"{day_str}T11:00:00+08:00",
        "intake_concern_category": "Stress",
        "intake_notes": "Very stressed",
        "captcha_token": "mock_captcha_token",
    }
    with patch(
        "app.services.booking_service.check_google_calendar_busy",
        new=AsyncMock(return_value=False),
    ):
        booking_resp = await async_client.post(
            "/bookings/", json=booking_req, cookies=cookies
        )
    assert booking_resp.status_code == 201
    booking_body = booking_resp.json()
    assert booking_body["payment_window_minutes"] == 60
    assert booking_body["amount"] == 1500.0
    booking_id = booking_body["booking_id"]

    # 5b. Verify GET /bookings/me includes payment and GET /bookings/counselor/me includes client_name
    my_bookings_resp = await async_client.get("/bookings/me", cookies=cookies)
    assert my_bookings_resp.status_code == 200
    my_bookings = my_bookings_resp.json()
    assert len(my_bookings) == 1
    assert my_bookings[0]["payment"]["amount"] == 1500.0

    c_login_resp = await async_client.post(
        "/auth/login",
        json={"email": counselor_data["email"], "password": counselor_data["password"]},
    )
    c_cookies = {"access_token": c_login_resp.cookies["access_token"]}
    c_bookings_resp = await async_client.get("/bookings/counselor/me", cookies=c_cookies)
    assert c_bookings_resp.status_code == 200
    c_bookings = c_bookings_resp.json()
    assert len(c_bookings) == 1
    assert c_bookings[0]["client_name"] == "Client Book"

    # 6. Reject concurrent/second pending booking (slot-squatting or overlap)
    booking_resp2 = await async_client.post(
        "/bookings/", json=booking_req, cookies=cookies
    )
    assert booking_resp2.status_code == 400

    # 7. Confirm booking and attach a calendar event ID, then verify reschedule/cancel calendar sync
    booking = (
        await db.execute(select(Booking).where(Booking.id == booking_id))
    ).scalar_one()
    booking.status = BookingStatus.confirmed
    booking.google_calendar_event_id = "evt_123"
    await db.commit()

    with (
        patch(
            "app.services.booking_service.check_google_calendar_busy",
            new=AsyncMock(return_value=False),
        ),
        patch(
            "app.routers.bookings.update_calendar_event", new_callable=AsyncMock
        ) as mock_update_cal,
    ):
        reschedule_resp = await async_client.put(
            f"/bookings/{booking_id}/reschedule",
            json={
                "new_scheduled_start": f"{day_str}T13:00:00+08:00",
                "new_scheduled_end": f"{day_str}T14:00:00+08:00",
            },
            cookies=cookies,
        )
    assert reschedule_resp.status_code == 200
    assert mock_update_cal.await_count == 1
    assert mock_update_cal.await_args.args[1] == "evt_123"

    with (
        patch(
            "app.routers.bookings.delete_calendar_event", new_callable=AsyncMock
        ) as mock_delete_cal,
        patch(
            "app.routers.bookings.send_cancellation_email", new_callable=AsyncMock
        ),
    ):
        cancel_resp = await async_client.post(
            f"/bookings/{booking_id}/cancel", cookies=cookies
        )
    assert cancel_resp.status_code == 200
    assert mock_delete_cal.await_count == 1
    assert mock_delete_cal.await_args.args[1] == "evt_123"

    # 8. Verify cancel_stale_pending_bookings sweeper cancels stale pending_payment bookings
    stale_booking = Booking(
        client_id=client_user.id,
        counselor_id=profile.id,
        scheduled_start=datetime.combine(tomorrow_manila, time(15, 0), tzinfo=MANILA_TZ),
        scheduled_end=datetime.combine(tomorrow_manila, time(16, 0), tzinfo=MANILA_TZ),
        status=BookingStatus.pending_payment,
    )
    db.add(stale_booking)
    await db.commit()

    swept = await cancel_stale_pending_bookings(db, max_age_minutes=-1)
    assert swept == 1
    stale_row = (
        await db.execute(select(Booking).where(Booking.id == stale_booking.id))
    ).scalar_one()
    assert stale_row.status == BookingStatus.cancelled


async def test_check_counselor_availability_merges_adjacent_blocks(db: AsyncSession):
    counselor_user = User(
        email="counselor_merge@example.com",
        password_hash="hashed",
        full_name="Merge Counselor",
        role=RoleEnum.counselor,
        is_verified=True,
    )
    db.add(counselor_user)
    await db.flush()

    profile = CounselorProfile(
        user_id=counselor_user.id,
        is_active=True,
        is_verified=True,
    )
    db.add(profile)
    await db.flush()

    target_date = (datetime.now(MANILA_TZ) + timedelta(days=2)).date()
    for hour in (8, 9, 10):
        db.add(
            Availability(
                counselor_id=profile.id,
                specific_date=target_date,
                start_time=time(hour, 0),
                end_time=time(hour + 1, 0),
                is_recurring=False,
            )
        )
    await db.commit()

    start_3h = datetime.combine(target_date, time(8, 0), tzinfo=MANILA_TZ)
    end_3h = datetime.combine(target_date, time(11, 0), tzinfo=MANILA_TZ)
    end_4h = datetime.combine(target_date, time(12, 0), tzinfo=MANILA_TZ)

    with patch(
        "app.services.booking_service.check_google_calendar_busy",
        new=AsyncMock(return_value=False),
    ):
        assert await check_counselor_availability(db, profile.id, start_3h, end_3h) is True
        assert await check_counselor_availability(db, profile.id, start_3h, end_4h) is False
        # Negative duration is rejected
        assert await check_counselor_availability(db, profile.id, end_3h, start_3h) is False


async def test_booking_validation_and_sweeper_preserves_proof(
    async_client: AsyncClient, db: AsyncSession
):
    counselor_user = User(
        email="c_val@example.com",
        password_hash="hashed",
        full_name="Counselor Val",
        role=RoleEnum.counselor,
        is_verified=True,
    )
    db.add(counselor_user)
    await db.flush()

    profile = CounselorProfile(
        user_id=counselor_user.id,
        is_active=True,
        is_verified=True,
    )
    db.add(profile)
    await db.flush()

    tomorrow = (datetime.now(MANILA_TZ) + timedelta(days=1)).date()
    yesterday = (datetime.now(MANILA_TZ) - timedelta(days=1)).date()
    db.add(
        Availability(
            counselor_id=profile.id,
            specific_date=tomorrow,
            start_time=time(9, 0),
            end_time=time(17, 0),
            is_recurring=False,
        )
    )
    await db.commit()

    # Invalid slot query returns 400 instead of 500
    bad_slots = await async_client.get(
        f"/availability/{profile.id}/slots?start_date={tomorrow.isoformat()}&end_date={yesterday.isoformat()}"
    )
    assert bad_slots.status_code == 400

    # Sign up & login client
    client_data = {
        "email": "cli_val@example.com",
        "password": "Password123",
        "full_name": "Client Val",
        "captcha_token": "dummy",
    }
    with patch("app.routers.auth.send_verification_email", new_callable=AsyncMock):
        resp = await async_client.post("/auth/signup", json=client_data)
    assert resp.status_code == 201
    cli_user = (
        await db.execute(select(User).where(User.email == client_data["email"]))
    ).scalar_one()
    cli_user.is_verified = True
    await db.commit()

    login_resp = await async_client.post(
        "/auth/login",
        json={"email": client_data["email"], "password": client_data["password"]},
    )
    cookies = {"access_token": login_resp.cookies["access_token"]}

    # Reject past booking
    past_resp = await async_client.post(
        "/bookings/",
        json={
            "counselor_id": profile.id,
            "scheduled_start": f"{yesterday.isoformat()}T10:00:00+08:00",
            "scheduled_end": f"{yesterday.isoformat()}T11:00:00+08:00",
            "intake_concern_category": "Stress",
            "captcha_token": "mock_captcha_token",
        },
        cookies=cookies,
    )
    assert past_resp.status_code == 400

    # Reject negative duration booking
    neg_resp = await async_client.post(
        "/bookings/",
        json={
            "counselor_id": profile.id,
            "scheduled_start": f"{tomorrow.isoformat()}T12:00:00+08:00",
            "scheduled_end": f"{tomorrow.isoformat()}T11:00:00+08:00",
            "intake_concern_category": "Stress",
            "captcha_token": "mock_captcha_token",
        },
        cookies=cookies,
    )
    assert neg_resp.status_code == 400

    # Sweeper must NOT cancel a pending_payment booking that already has proof_url
    b_with_proof = Booking(
        client_id=cli_user.id,
        counselor_id=profile.id,
        scheduled_start=datetime.combine(tomorrow, time(10, 0), tzinfo=MANILA_TZ),
        scheduled_end=datetime.combine(tomorrow, time(11, 0), tzinfo=MANILA_TZ),
        status=BookingStatus.pending_payment,
    )
    db.add(b_with_proof)
    await db.flush()
    db.add(
        Payment(
            booking_id=b_with_proof.id,
            amount=1500.0,
            currency="PHP",
            provider="manual",
            status=PaymentStatus.pending,
            proof_url="data:image/png;base64,abc",
        )
    )
    await db.commit()

    swept = await cancel_stale_pending_bookings(db, max_age_minutes=-1)
    assert swept == 0
    await db.refresh(b_with_proof)
    assert b_with_proof.status == BookingStatus.pending_payment

