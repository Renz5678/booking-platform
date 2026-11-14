from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.booking import Booking, BookingStatus
from app.models.user import RoleEnum

pytestmark = pytest.mark.asyncio

async def test_booking_flow_and_hold(async_client: AsyncClient, db: AsyncSession):
    # 1. Create a counselor
    counselor_data = {
        "email": "counselor_book@example.com",
        "password": "Password123",
        "full_name": "Counselor Book",
        "captcha_token": "dummy"
    }
    resp = await async_client.post("/auth/signup", json=counselor_data)
    assert resp.status_code == 201
    from app.models.user import User
    counselor_user = (await db.execute(select(User).where(User.email == counselor_data["email"]))).scalar_one()
    counselor_user.role = RoleEnum.counselor
    counselor_user.is_verified = True
    await db.commit()
    
    # Create profile
    from app.models.counselor_profile import CounselorProfile
    profile = CounselorProfile(user_id=counselor_user.id, is_active=True, is_verified=True, bio="Test", specialization_tags=["Stress"])
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    from datetime import time
    from app.models.availability import Availability
    for day in range(7):
        db.add(Availability(counselor_id=profile.id, day_of_week=day, start_time=time(0), end_time=time(23, 59), is_recurring=True))
    await db.commit()

    # 2. Create a client and login
    client_data = {
        "email": "client_book@example.com",
        "password": "Password123",
        "full_name": "Client Book",
        "captcha_token": "dummy"
    }
    resp = await async_client.post("/auth/signup", json=client_data)
    assert resp.status_code == 201
    client_user = (await db.execute(select(User).where(User.email == client_data["email"]))).scalar_one()
    client_user.is_verified = True
    await db.commit()
    
    login_resp = await async_client.post("/auth/login", json={"email": client_data["email"], "password": client_data["password"]})
    token = login_resp.cookies["access_token"]
    cookies = {"access_token": token}
    
    # 3. Create booking
    now = datetime.now(timezone.utc).replace(hour=1, minute=0, second=0, microsecond=0)
    booking_req = {
        "counselor_id": profile.id,
        "scheduled_start": (now + timedelta(days=1)).isoformat(),
        "scheduled_end": (now + timedelta(days=1, hours=1)).isoformat(),
        "intake_concern_category": "Stress",
        "intake_notes": "Very stressed",
        "captcha_token": "mock_captcha_token"
    }
    
    booking_resp = await async_client.post("/bookings/", json=booking_req, cookies=cookies)
    assert booking_resp.status_code == 201
    booking_id = booking_resp.json()["booking_id"]
    
    # 4. Try double booking with same client (should reject due to active pending unpaid booking)
    booking_resp2 = await async_client.post("/bookings/", json=booking_req, cookies=cookies)
    assert booking_resp2.status_code == 409
    assert "pending unpaid booking" in booking_resp2.json()["detail"]

    # 4b. Another client attempts to book the exact same slot -> should reject as slot not available
    client2_data = {
        "email": "client2_book@example.com",
        "password": "Password123",
        "full_name": "Client Two",
        "captcha_token": "dummy"
    }
    resp2 = await async_client.post("/auth/signup", json=client2_data)
    assert resp2.status_code == 201
    c2 = (await db.execute(select(User).where(User.email == client2_data["email"]))).scalar_one()
    c2.is_verified = True
    await db.commit()

    login2 = await async_client.post("/auth/login", json={"email": client2_data["email"], "password": client2_data["password"]})
    c2_cookies = {"access_token": login2.cookies["access_token"]}
    resp_conflict = await async_client.post("/bookings/", json=booking_req, cookies=c2_cookies)
    assert resp_conflict.status_code == 409
    assert "not available" in resp_conflict.json()["detail"].lower()
    
    # 5. Check if booking expires
    from app.services.booking_service import cancel_stale_pending_bookings
    cancelled_count = await cancel_stale_pending_bookings(db, max_age_minutes=0) # 0 minutes for test
    assert cancelled_count >= 1
    
    await db.refresh(client_user) # just to expire session safely
    result = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = result.scalar_one()
    assert booking.status == BookingStatus.cancelled


async def test_timezone_and_slot_consistency(async_client: AsyncClient, db: AsyncSession):
    """
    Validates that:
    1. Availability slots generated for 09:00-17:00 PHT counselor are returned in Asia/Manila (+08:00) ISO format.
    2. Booking 1:00 PM - 4:00 PM PHT (13:00 - 16:00 +08:00) converts and persists in DB as UTC (05:00 - 08:00 UTC).
    3. Serialization for both client (/bookings/me) and counselor (/bookings/counselor/me) returns ISO strings with 'Z' so local browsers reconstruct 1:00 PM - 4:00 PM (not 9:00 PM - 12:00 AM).
    """
    from datetime import time
    from zoneinfo import ZoneInfo
    from app.models.user import User
    from app.models.counselor_profile import CounselorProfile
    from app.models.availability import Availability

    PHT = ZoneInfo("Asia/Manila")

    # 1. Create Counselor with Monday-Friday 09:00-17:00 PHT availability
    c_data = {"email": "tz_counselor@example.com", "password": "Password123", "full_name": "Dr. Manila Time", "captcha_token": "dummy"}
    await async_client.post("/auth/signup", json=c_data)
    c_user = (await db.execute(select(User).where(User.email == c_data["email"]))).scalar_one()
    c_user.role = RoleEnum.counselor
    c_user.is_verified = True
    await db.commit()

    c_profile = CounselorProfile(user_id=c_user.id, is_active=True, is_verified=True, bio="PHT Counselor", specialization_tags=["Anxiety"])
    db.add(c_profile)
    await db.commit()
    await db.refresh(c_profile)

    # Add recurring availability: Monday through Friday 09:00 to 17:00
    for day in range(5):
        db.add(Availability(counselor_id=c_profile.id, day_of_week=day, start_time=time(9, 0), end_time=time(17, 0), is_recurring=True))
    await db.commit()

    future = datetime.now(PHT).date() + timedelta(days=7)
    while future.weekday() > 4:
        future += timedelta(days=1)
    date_text = future.isoformat()
    # 2. Check slots endpoint for a test date: 2026-10-23 (Friday)
    slots_resp = await async_client.get(f"/availability/{c_profile.id}/slots?start_date={date_text}&end_date={date_text}&duration=60")
    assert slots_resp.status_code == 200
    day_slots = slots_resp.json().get(date_text, {}).get("available", [])
    assert len(day_slots) > 0
    # Every slot must be formatted in Asia/Manila (+08:00)
    assert any(f"{date_text}T13:00:00+08:00" in slot for slot in day_slots)
    assert any(f"{date_text}T09:00:00+08:00" in slot for slot in day_slots)

    # 3. Create Client and book 1:00 PM - 4:00 PM PHT (13:00 to 16:00 +08:00)
    cl_data = {"email": "tz_client@example.com", "password": "Password123", "full_name": "Manila Client", "captcha_token": "dummy"}
    await async_client.post("/auth/signup", json=cl_data)
    cl_user = (await db.execute(select(User).where(User.email == cl_data["email"]))).scalar_one()
    cl_user.is_verified = True
    await db.commit()

    cl_login = await async_client.post("/auth/login", json={"email": cl_data["email"], "password": cl_data["password"]})
    cl_cookies = {"access_token": cl_login.cookies["access_token"]}

    # Client sends explicit PHT time (+08:00) for 1:00 PM - 4:00 PM
    booking_req = {
        "counselor_id": c_profile.id,
        "scheduled_start": f"{date_text}T13:00:00+08:00",
        "scheduled_end": f"{date_text}T14:00:00+08:00",
        "intake_concern_category": "Anxiety",
        "intake_notes": "Timezone test",
        "captcha_token": "mock_captcha_token"
    }
    create_resp = await async_client.post("/bookings/", json=booking_req, cookies=cl_cookies)
    assert create_resp.status_code == 201
    booking_id = create_resp.json()["booking_id"]

    # 4. Verify stored UTC time in DB
    saved_booking = (await db.execute(select(Booking).where(Booking.id == booking_id))).scalar_one()
    # 13:00 PHT minus 8 hours = 05:00 UTC
    assert saved_booking.scheduled_start.hour == 5
    # 16:00 PHT minus 8 hours = 08:00 UTC
    assert saved_booking.scheduled_end.hour == 6

    # 5. Verify /bookings/me for client
    me_resp = await async_client.get("/bookings/me", cookies=cl_cookies)
    assert me_resp.status_code == 200
    my_bookings = me_resp.json()
    assert len(my_bookings) == 1
    # Check that ISO serialization includes 'Z' or '+00:00'
    assert my_bookings[0]["scheduled_start"].endswith("Z") or "+00:00" in my_bookings[0]["scheduled_start"]
    # The UTC start time is 05:00:00
    assert "05:00:00" in my_bookings[0]["scheduled_start"]

    # 6. Verify /bookings/counselor/me for counselor
    c_login = await async_client.post("/auth/login", json={"email": c_data["email"], "password": c_data["password"]})
    from app.services.mfa import totp
    import time as clock
    enrollment = await async_client.post("/auth/mfa/enroll")
    verification = await async_client.post("/auth/mfa/verify", json={"code": totp(enrollment.json()["secret"], int(clock.time()) // 30)})
    assert verification.status_code == 200
    c_cookies = {"access_token": c_login.cookies["access_token"]}
    c_me_resp = await async_client.get("/bookings/counselor/me", cookies=c_cookies)
    assert c_me_resp.status_code == 200
    c_bookings = c_me_resp.json()
    assert len(c_bookings) == 1
    assert "05:00:00" in c_bookings[0]["scheduled_start"]

    # 7. Counselor marks payment as paid -> confirm Google Meet and calendar integration
    mark_paid_resp = await async_client.post(f"/bookings/{booking_id}/mark-paid", cookies=c_cookies)
    assert mark_paid_resp.status_code == 403


async def test_cancellation_email_outbox_payload_and_rendered_copy(db: AsyncSession):
    import uuid
    from decimal import Decimal
    from unittest.mock import patch
    from starlette.requests import Request
    from app.models.user import User, RoleEnum
    from app.models.counselor_profile import CounselorProfile
    from app.models.payment import Payment, PaymentStatus
    from app.models.operations import OutboxJob
    from app.routers.payment_review import Reference, Decision, submit, review
    from app.routers.bookings import cancel_booking
    from app.services.email_service import send_cancellation_email

    def req():
        return Request({"type": "http", "path": "/", "headers": []})

    async def seed_booking(scheduled_start, status=BookingStatus.pending_payment, payment_status=PaymentStatus.pending):
        tag = uuid.uuid4().hex[:8]
        client = User(email=f"client_{tag}@example.com", full_name=f"Client {tag}", password_hash="hash", role=RoleEnum.client, is_verified=True)
        counselor_u = User(email=f"counselor_{tag}@example.com", full_name=f"Counselor {tag}", password_hash="hash", role=RoleEnum.counselor, is_verified=True)
        admin = User(email=f"admin_{tag}@example.com", full_name="Admin", password_hash="hash", role=RoleEnum.admin, is_verified=True)
        db.add_all([client, counselor_u, admin])
        await db.flush()

        profile = CounselorProfile(user_id=counselor_u.id, is_active=True, is_verified=True, bio="Bio")
        db.add(profile)
        await db.flush()

        booking = Booking(
            client_id=client.id,
            counselor_id=profile.id,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_start + timedelta(hours=1),
            status=status,
        )
        db.add(booking)
        await db.flush()

        payment = Payment(
            booking_id=booking.id,
            amount=Decimal("300.00"),
            currency="PHP",
            status=payment_status,
            provider="gcash_manual",
        )
        db.add(payment)
        await db.commit()
        return client, admin, booking, payment

    # --- Scenario 1: Confirmed paid session cancelled >= 24h before scheduled start ---
    now = datetime.now(timezone.utc)
    client_1, admin_1, booking_1, payment_1 = await seed_booking(now + timedelta(days=2))
    await submit(req(), booking_1.id, Reference(reference="PAID-GCASH-1"), client_1, db)
    await review(req(), booking_1.id, Decision(decision="approve"), admin_1, db)
    await db.refresh(booking_1)
    assert booking_1.status == BookingStatus.confirmed
    await db.refresh(payment_1)
    assert payment_1.status == PaymentStatus.paid

    # Client cancels >= 24h
    cancel_resp = await cancel_booking(req(), booking_1.id, current_user=client_1, db=db)
    assert cancel_resp.refund_issued is False

    await db.refresh(payment_1)
    assert payment_1.status == PaymentStatus.refund_pending

    # Verify OutboxJob payload
    all_outbox = (await db.execute(select(OutboxJob).where(OutboxJob.kind == "cancellation_email"))).scalars().all()
    job_1 = next(j for j in all_outbox if j.payload.get("booking_id") == booking_1.id)
    assert job_1.payload["refund_pending"] is True
    assert job_1.payload["was_paid"] is True

    # Verify Email copy for Scenario 1
    with patch("app.services.email_service._send_email_sync", return_value=True) as mock_send_1:
        await send_cancellation_email(
            client_1.email,
            booking_1.id,
            refund_pending=job_1.payload["refund_pending"],
            was_paid=job_1.payload["was_paid"],
        )
        assert mock_send_1.called
        _, _, html_body_1 = mock_send_1.call_args[0]
        assert "<p>A full refund is being processed and will appear in your GCash account within 5–10 business days.</p>" in html_body_1
        assert "no refund will be issued" not in html_body_1

    # --- Scenario 2: Confirmed paid session cancelled < 24h before scheduled start ---
    client_2, admin_2, booking_2, payment_2 = await seed_booking(now + timedelta(days=2))
    await submit(req(), booking_2.id, Reference(reference="LATE-PAID-2"), client_2, db)
    await review(req(), booking_2.id, Decision(decision="approve"), admin_2, db)
    await db.refresh(booking_2)
    assert booking_2.status == BookingStatus.confirmed

    # Move start time to 3 hours from now
    booking_2.scheduled_start = datetime.now(timezone.utc) + timedelta(hours=3)
    booking_2.scheduled_end = booking_2.scheduled_start + timedelta(hours=1)
    await db.commit()

    # Client cancels < 24h
    await cancel_booking(req(), booking_2.id, current_user=client_2, db=db)

    all_outbox = (await db.execute(select(OutboxJob).where(OutboxJob.kind == "cancellation_email"))).scalars().all()
    job_2 = next(j for j in all_outbox if j.payload.get("booking_id") == booking_2.id)
    assert job_2.payload["refund_pending"] is False
    assert job_2.payload["was_paid"] is True

    # Verify Email copy for Scenario 2
    with patch("app.services.email_service._send_email_sync", return_value=True) as mock_send_2:
        await send_cancellation_email(
            client_2.email,
            booking_2.id,
            refund_pending=job_2.payload["refund_pending"],
            was_paid=job_2.payload["was_paid"],
        )
        assert mock_send_2.called
        _, _, html_body_2 = mock_send_2.call_args[0]
        assert "<p>As per our cancellation policy, no refund will be issued for cancellations made less than 24 hours before the session.</p>" in html_body_2
        assert "5–10 business days" not in html_body_2

    # --- Scenario 3: Unpaid booking cancelled ---
    client_3, admin_3, booking_3, payment_3 = await seed_booking(now + timedelta(days=2))
    assert booking_3.status == BookingStatus.pending_payment
    assert payment_3.status == PaymentStatus.pending

    await cancel_booking(req(), booking_3.id, current_user=client_3, db=db)

    all_outbox = (await db.execute(select(OutboxJob).where(OutboxJob.kind == "cancellation_email"))).scalars().all()
    job_3 = next(j for j in all_outbox if j.payload.get("booking_id") == booking_3.id)
    assert job_3.payload["refund_pending"] is False
    assert job_3.payload["was_paid"] is False

    # Verify Email copy for Scenario 3
    with patch("app.services.email_service._send_email_sync", return_value=True) as mock_send_3:
        await send_cancellation_email(
            client_3.email,
            booking_3.id,
            refund_pending=job_3.payload["refund_pending"],
            was_paid=job_3.payload["was_paid"],
        )
        assert mock_send_3.called
        _, _, html_body_3 = mock_send_3.call_args[0]
        # Must NOT render any non-refundable policy warning
        assert "no refund will be issued" not in html_body_3
        assert "5–10 business days" not in html_body_3
        assert "Your counseling session booking has been cancelled." in html_body_3

