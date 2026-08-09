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
    now = datetime.now(timezone.utc)
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
    
    # 4. Try double booking
    booking_resp2 = await async_client.post("/bookings/", json=booking_req, cookies=cookies)
    assert booking_resp2.status_code == 400
    assert "not available" in booking_resp2.json()["detail"]
    
    # 5. Check if booking expires
    # We can test the service function directly rather than waiting 30 minutes
    from app.services.booking_service import expire_booking_if_unpaid
    await expire_booking_if_unpaid(booking_id, db, delay_minutes=0) # 0 minutes delay for test
    
    await db.refresh(client_user) # just to expire session safely
    result = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = result.scalar_one()
    assert booking.status == BookingStatus.cancelled
