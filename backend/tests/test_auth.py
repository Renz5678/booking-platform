from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.rate_limit import limiter
from app.models.user import User

pytestmark = pytest.mark.asyncio


async def test_signup_verify_login_refresh_and_account_flow(
    async_client: AsyncClient, db: AsyncSession
):
    # 1. Signup
    signup_data = {
        "full_name": "Test User",
        "email": "test@example.com",
        "password": "Password123",
        "captcha_token": "dummy_token",
    }
    with patch("app.routers.auth.send_verification_email", new_callable=AsyncMock):
        response = await async_client.post("/auth/signup", json=signup_data)
    assert response.status_code == 201
    assert "OTP" in response.json()["msg"]

    # Fetch OTP from DB
    user = (
        await db.execute(select(User).where(User.email == signup_data["email"]))
    ).scalar_one()
    otp = user.verification_otp
    assert otp is not None

    # 2. Login rejected before verification
    login_data = {
        "email": signup_data["email"],
        "password": signup_data["password"],
    }
    login_resp = await async_client.post("/auth/login", json=login_data)
    assert login_resp.status_code == 401
    assert "verify your email" in login_resp.json()["detail"]

    # 3. Verify OTP
    verify_resp = await async_client.post(
        "/auth/verify-otp", json={"email": signup_data["email"], "otp": otp}
    )
    assert verify_resp.status_code == 200

    # 4. Login successful
    login_resp2 = await async_client.post("/auth/login", json=login_data)
    assert login_resp2.status_code == 200
    assert "access_token" in login_resp2.cookies
    assert "refresh_token" in login_resp2.cookies

    # 5. Access protected route
    me_resp = await async_client.get(
        "/auth/me", cookies={"access_token": login_resp2.cookies["access_token"]}
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == signup_data["email"]
    assert me_resp.json()["role"] == "client"

    # 6. Refresh token using UUID subject
    refresh_resp = await async_client.post(
        "/auth/refresh",
        cookies={"refresh_token": login_resp2.cookies["refresh_token"]},
    )
    assert refresh_resp.status_code == 200
    assert "access_token" in refresh_resp.cookies

    # 7. Update full_name via PUT /auth/me
    update_resp = await async_client.put(
        "/auth/me",
        json={"full_name": "Updated Test User"},
        cookies={"access_token": refresh_resp.cookies["access_token"]},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["full_name"] == "Updated Test User"

    # 8. Change password via POST /auth/change-password
    pw_resp = await async_client.post(
        "/auth/change-password",
        json={
            "current_password": "Password123",
            "new_password": "NewPassword123",
        },
        cookies={"access_token": refresh_resp.cookies["access_token"]},
    )
    assert pw_resp.status_code == 200

    # Login with new password succeeds
    new_login = await async_client.post(
        "/auth/login",
        json={"email": signup_data["email"], "password": "NewPassword123"},
    )
    assert new_login.status_code == 200


async def test_honeypot_rejection(async_client: AsyncClient):
    signup_data = {
        "full_name": "Bot User",
        "email": "bot@example.com",
        "password": "Password123",
        "website": "http://spam.com",
        "captcha_token": "dummy_token",
    }
    response = await async_client.post("/auth/signup", json=signup_data)
    assert response.status_code == 201

    login_data = {"email": "bot@example.com", "password": "Password123"}
    login_resp = await async_client.post("/auth/login", json=login_data)
    assert login_resp.status_code == 401


async def test_rate_limiting(async_client: AsyncClient):
    signup_data = {
        "full_name": "Rate User",
        "email": "rate@example.com",
        "password": "Password123",
        "captcha_token": "dummy_token",
    }
    limiter.reset()
    limiter.enabled = True
    try:
        for _ in range(5):
            await async_client.post("/auth/signup", json=signup_data)

        response = await async_client.post("/auth/signup", json=signup_data)
        assert response.status_code == 429
        assert "Rate limit exceeded" in response.json().get(
            "detail", response.json().get("error", "")
        )
    finally:
        limiter.reset()
        limiter.enabled = False


async def test_protected_routes_unauthorized(async_client: AsyncClient):
    response = await async_client.get("/auth/me")
    assert response.status_code == 401

    response = await async_client.get(
        "/auth/me", cookies={"access_token": "invalid.token.here"}
    )
    assert response.status_code == 401
