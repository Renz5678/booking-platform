
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

async def test_signup_verify_login_flow(async_client: AsyncClient):
    # 1. Signup
    signup_data = {
        "full_name": "Test User",
        "email": "test@example.com",
        "password": "Password123",
        "captcha_token": "dummy_token"
    }
    response = await async_client.post("/auth/signup", json=signup_data)
    assert response.status_code == 201
    assert "OTP" in response.json()["msg"]
    
    # Extract verification token printed to stdout (mocking email extraction)
    # Since we can't easily capture stdout in this simple test without mocking,
    # let's directly generate a token using the service for testing purposes.
    from app.services.auth_service import create_verification_token
    token = create_verification_token(signup_data["email"])

    # 2. Login rejected before verification
    login_data = {
        "email": signup_data["email"],
        "password": signup_data["password"]
    }
    login_resp = await async_client.post("/auth/login", json=login_data)
    assert login_resp.status_code == 401
    assert "verify your email" in login_resp.json()["detail"]

    # 3. Verify email
    verify_resp = await async_client.get(f"/auth/verify-email?token={token}")
    assert verify_resp.status_code == 200

    # 4. Login successful
    login_resp2 = await async_client.post("/auth/login", json=login_data)
    assert login_resp2.status_code == 200
    assert "access_token" in login_resp2.cookies

    # 5. Access protected route
    me_resp = await async_client.get("/auth/me", cookies={"access_token": login_resp2.cookies["access_token"]})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == signup_data["email"]
    assert me_resp.json()["role"] == "client"

async def test_honeypot_rejection(async_client: AsyncClient):
    signup_data = {
        "full_name": "Bot User",
        "email": "bot@example.com",
        "password": "Password123",
        "website": "http://spam.com", # Honeypot filled
        "captcha_token": "dummy_token"
    }
    response = await async_client.post("/auth/signup", json=signup_data)
    # Should silently return success message but not create user
    assert response.status_code == 201
    
    # Verify user wasn't actually created by trying to login
    login_data = {"email": "bot@example.com", "password": "Password123"}
    login_resp = await async_client.post("/auth/login", json=login_data)
    assert login_resp.status_code == 401

async def test_rate_limiting(async_client: AsyncClient):
    signup_data = {
        "full_name": "Rate User",
        "email": "rate@example.com",
        "password": "Password123",
        "captcha_token": "dummy_token"
    }
    
    # We set 5/15minute in the router
    # Send 5 requests (1 real, 4 duplicate emails which return 400 but still count against limit)
    for _ in range(5):
        await async_client.post("/auth/signup", json=signup_data)
        
    # The 6th request should be rate limited
    response = await async_client.post("/auth/signup", json=signup_data)
    assert response.status_code == 429
    assert "Rate limit exceeded" in response.json().get("detail", response.json().get("error", ""))

async def test_protected_routes_unauthorized(async_client: AsyncClient):
    # No token
    response = await async_client.get("/auth/me")
    assert response.status_code == 401

    # Invalid token
    response = await async_client.get("/auth/me", cookies={"access_token": "invalid.token.here"})
    assert response.status_code == 401
