from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.booking import Booking, BookingStatus
from app.models.payment import Payment, PaymentStatus
from app.models.user import RoleEnum

pytestmark = pytest.mark.asyncio

async def test_simulated_payment_success(async_client: AsyncClient, db: AsyncSession):
    # Setup users
    c_data = {"email": "c_pay@ex.com", "password": "Pass123", "full_name": "C Pay", "captcha_token": "dummy"}
    resp = await async_client.post("/auth/signup", json=c_data)
    assert resp.status_code == 201
    from app.models.user import User
    c_user = (await db.execute(select(User).where(User.email == c_data["email"]))).scalar_one()
    c_user.role = RoleEnum.counselor
    c_user.is_verified = True
    await db.commit()
    
    from app.models.counselor_profile import CounselorProfile
    profile = CounselorProfile(user_id=c_user.id, is_active=True, is_verified=True, bio="Test")
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    cli_data = {"email": "cli_pay@ex.com", "password": "Pass123", "full_name": "Cli Pay", "captcha_token": "dummy"}
    resp = await async_client.post("/auth/signup", json=cli_data)
    assert resp.status_code == 201
    cli_user = (await db.execute(select(User).where(User.email == cli_data["email"]))).scalar_one()
    cli_user.is_verified = True
    await db.commit()
    
    login = await async_client.post("/auth/login", json={"email": cli_data["email"], "password": cli_data["password"]})
    cookies = {"access_token": login.cookies["access_token"]}
    
    # Create booking
    now = datetime.now(timezone.utc)
    booking_req = {
        "counselor_id": profile.id,
        "scheduled_start": (now + timedelta(days=2)).isoformat(),
        "scheduled_end": (now + timedelta(days=2, hours=1)).isoformat(),
        "intake_concern_category": "Anxiety",
        "captcha_token": "mock_captcha_token",
        "honeypot": ""
    }
    
    booking_resp = await async_client.post("/bookings/", json=booking_req, cookies=cookies)
    assert booking_resp.status_code == 201
    booking_id = booking_resp.json()["booking_id"]
    
    # Verify it is pending
    result = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = result.scalar_one()
    assert booking.status == BookingStatus.pending_payment
    
    # Call simulate payment success
    pay_resp = await async_client.post(f"/payments/simulate-success/{booking_id}")
    assert pay_resp.status_code == 200
    
    # Verify statuses are updated
    # We must close session or expire all to reload fresh data
    await db.commit() 
    
    b_result = await db.execute(select(Booking).where(Booking.id == booking_id))
    updated_booking = b_result.scalar_one()
    assert updated_booking.status == BookingStatus.confirmed
    
    p_result = await db.execute(select(Payment).where(Payment.booking_id == booking_id))
    updated_payment = p_result.scalar_one()
    assert updated_payment.status == PaymentStatus.paid
    assert updated_payment.paid_at is not None
