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


async def test_forgot_and_reset_password_security_flow(
    async_client: AsyncClient, db: AsyncSession
):
    from datetime import datetime, timedelta, timezone
    from app.services.auth_service import hash_reset_token

    # Create and verify user
    signup_data = {
        "full_name": "Reset User",
        "email": "ResetUser@Example.com",
        "password": "Password123",
        "captcha_token": "dummy_token",
    }
    with patch("app.routers.auth.send_verification_email", new_callable=AsyncMock):
        resp = await async_client.post("/auth/signup", json=signup_data)
    assert resp.status_code == 201

    user = (
        await db.execute(select(User).where(User.email == "resetuser@example.com"))
    ).scalar_one()
    user.is_verified = True
    await db.commit()

    # Log in to obtain active access and refresh cookies before reset
    login_resp = await async_client.post(
        "/auth/login",
        json={"email": "resetuser@example.com", "password": "Password123"},
    )
    assert login_resp.status_code == 200
    old_access = login_resp.cookies["access_token"]
    old_refresh = login_resp.cookies["refresh_token"]

    # 1. Enumeration resistance: unknown vs known email return identical 200 JSON
    with patch("app.routers.auth.send_password_reset_email", new_callable=AsyncMock) as mock_send:
        unknown_resp = await async_client.post(
            "/auth/forgot-password",
            json={"email": "nobody@example.com", "captcha_token": "dummy_token"},
        )
        # 2. Honeypot silently drops without sending email
        bot_resp = await async_client.post(
            "/auth/forgot-password",
            json={
                "email": "resetuser@example.com",
                "website": "http://spam.example",
                "captcha_token": "dummy_token",
            },
        )
        assert unknown_resp.status_code == 200
        assert bot_resp.status_code == 200
        assert unknown_resp.json() == bot_resp.json()
        assert mock_send.await_count == 0

        # 3. Valid request (mixed-case email) sends once; immediate repeat is suppressed by 2-min cooldown
        known_resp = await async_client.post(
            "/auth/forgot-password",
            json={"email": "  ResetUser@Example.COM  ", "captcha_token": "dummy_token"},
        )
        cooldown_resp = await async_client.post(
            "/auth/forgot-password",
            json={"email": "resetuser@example.com", "captcha_token": "dummy_token"},
        )
        assert known_resp.status_code == 200
        assert cooldown_resp.status_code == 200
        assert known_resp.json() == unknown_resp.json()
        assert mock_send.await_count == 1
        raw_token = mock_send.await_args.args[1]

    # 4. DB stores only SHA-256 hash, never plaintext token
    await db.refresh(user)
    assert user.reset_token_hash == hash_reset_token(raw_token)
    assert user.reset_token_hash != raw_token

    # 5. Simulate lockout, then verify expired token is rejected
    user.failed_login_attempts = 5
    user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
    user.reset_token_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db.commit()

    expired_resp = await async_client.post(
        "/auth/reset-password",
        json={
            "token": raw_token,
            "new_password": "NewPassword456",
            "captcha_token": "dummy_token",
        },
    )
    assert expired_resp.status_code == 400

    # Restore valid expiry and reset password
    user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    await db.commit()

    reset_resp = await async_client.post(
        "/auth/reset-password",
        json={
            "token": raw_token,
            "new_password": "NewPassword456",
            "captcha_token": "dummy_token",
        },
    )
    assert reset_resp.status_code == 200

    # 6. Token replay fails, lockout is cleared, and old sessions are invalidated
    replay_resp = await async_client.post(
        "/auth/reset-password",
        json={
            "token": raw_token,
            "new_password": "AnotherPassword789",
            "captcha_token": "dummy_token",
        },
    )
    assert replay_resp.status_code == 400

    await db.refresh(user)
    assert user.failed_login_attempts == 0
    assert user.locked_until is None

    old_me = await async_client.get("/auth/me", cookies={"access_token": old_access})
    assert old_me.status_code == 401
    old_refresh_resp = await async_client.post(
        "/auth/refresh", cookies={"refresh_token": old_refresh}
    )
    assert old_refresh_resp.status_code == 401

    new_login = await async_client.post(
        "/auth/login",
        json={"email": "resetuser@example.com", "password": "NewPassword456"},
    )
    assert new_login.status_code == 200


async def test_forgot_password_rate_limit(async_client: AsyncClient):
    limiter.reset()
    limiter.enabled = True
    try:
        for _ in range(3):
            resp = await async_client.post(
                "/auth/forgot-password",
                json={"email": "rate@example.com", "captcha_token": "dummy_token"},
            )
            assert resp.status_code == 200
        blocked = await async_client.post(
            "/auth/forgot-password",
            json={"email": "rate@example.com", "captcha_token": "dummy_token"},
        )
        assert blocked.status_code == 429
    finally:
        limiter.reset()
        limiter.enabled = False


async def test_resend_otp_and_login_preserves_otp_counter(
    async_client: AsyncClient, db: AsyncSession
):
    signup_data = {
        "full_name": "OTP User",
        "email": "otpuser@example.com",
        "password": "Password123",
        "captcha_token": "dummy_token",
    }
    with patch("app.routers.auth.send_verification_email", new_callable=AsyncMock):
        resp = await async_client.post("/auth/signup", json=signup_data)
    assert resp.status_code == 201

    # Fail OTP twice
    for _ in range(2):
        bad_otp = await async_client.post(
            "/auth/verify-otp", json={"email": signup_data["email"], "otp": "000000"}
        )
        assert bad_otp.status_code == 400

    # Login before verification must NOT reset failed_login_attempts
    unverified_login = await async_client.post(
        "/auth/login",
        json={"email": signup_data["email"], "password": signup_data["password"]},
    )
    assert unverified_login.status_code == 401

    user = (
        await db.execute(select(User).where(User.email == signup_data["email"]))
    ).scalar_one()
    assert user.failed_login_attempts == 2

    # Resend OTP issues a new code and resets the OTP attempt counter
    with patch("app.routers.auth.send_verification_email", new_callable=AsyncMock) as mock_resend:
        resend_resp = await async_client.post(
            "/auth/resend-otp", json={"email": signup_data["email"]}
        )
        unknown_resp = await async_client.post(
            "/auth/resend-otp", json={"email": "nobody@example.com"}
        )
    assert resend_resp.status_code == 200
    assert unknown_resp.status_code == 200
    assert resend_resp.json() == unknown_resp.json()
    assert mock_resend.await_count == 1
    new_otp = mock_resend.await_args.args[1]

    await db.refresh(user)
    assert user.failed_login_attempts == 0
    assert user.verification_otp == new_otp

    verify_resp = await async_client.post(
        "/auth/verify-otp", json={"email": signup_data["email"], "otp": new_otp}
    )
    assert verify_resp.status_code == 200
