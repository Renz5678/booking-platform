import pytest
from fastapi import status
from httpx import AsyncClient
from unittest.mock import patch


pytestmark = pytest.mark.asyncio

async def test_simulate_success_blocked_in_production(async_client: AsyncClient):
    """Ensure the dev-only payment simulation endpoint is blocked in production."""
    with patch("app.routers.payments.settings.ENVIRONMENT", "production"):
        response = await async_client.post(
        "/payments/simulate-success/fake-booking-id",
        headers={"Authorization": "Bearer fake_token"}
    )
    
    # In production, it should act like it doesn't exist (404)
    # or block via auth (401/403) depending on how the dependency resolves first
    assert response.status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


async def test_unauthenticated_access_blocked(async_client: AsyncClient):
    """Ensure sensitive endpoints reject requests without a valid token."""
    response = await async_client.get("/bookings/me")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


async def test_refresh_token_rejected_as_access_token(async_client: AsyncClient):
    """Ensure a refresh JWT cannot be used in place of an access_token cookie."""
    from app.services.auth_service import create_refresh_token

    refresh_jwt = create_refresh_token(data={"sub": "00000000-0000-0000-0000-000000000001"})
    async_client.cookies.set("access_token", refresh_jwt)
    try:
        response = await async_client.get("/auth/me")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    finally:
        async_client.cookies.clear()


async def test_availability_rejects_conflicting_day_and_date():
    """Ensure recurring availability rejects a specific_date and vice versa."""
    from datetime import date, time
    from pydantic import ValidationError
    from app.schemas.availability import AvailabilityCreate

    with pytest.raises(ValidationError):
        AvailabilityCreate(
            is_recurring=True,
            day_of_week=1,
            specific_date=date(2026, 11, 15),
            start_time=time(9, 0),
            end_time=time(10, 0),
        )


async def test_verify_captcha_fails_closed_in_production():
    """Ensure missing RECAPTCHA_SECRET_KEY fails closed when ENVIRONMENT is production."""
    from app.services.auth_service import verify_captcha

    with (
        patch("app.services.auth_service.settings.ENVIRONMENT", "production"),
        patch("app.services.auth_service.settings.RECAPTCHA_SECRET_KEY", ""),
    ):
        assert await verify_captcha("dummy_token") is False


async def test_upload_magic_bytes_validation():
    """Ensure spoofed MIME headers without matching magic bytes are rejected."""
    from app.core.security import validate_upload_magic_bytes

    assert validate_upload_magic_bytes(b"%PDF-1.7", "application/pdf") is True
    assert validate_upload_magic_bytes(b"\xff\xd8\xff\xe0", "image/jpeg") is True
    assert validate_upload_magic_bytes(b"\x89PNG\r\n\x1a\n", "image/png") is True
    assert validate_upload_magic_bytes(b"<script>alert(1)</script>", "image/png") is False
    assert validate_upload_magic_bytes(b"%PDF-1.7", "image/jpeg") is False


async def test_disposable_emails_rejected_on_signup_and_contact(async_client: AsyncClient):
    """Ensure disposable/temporary email providers and subdomains are blocked."""
    for bad_email in (
        "throwaway@mailinator.com",
        "bot@sub.yopmail.com",
        "temp@10minutemail.com",
    ):
        resp = await async_client.post(
            "/auth/signup",
            json={
                "full_name": "Temp User",
                "email": bad_email,
                "password": "Password123",
                "captcha_token": "dummy_token",
            },
        )
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

        contact_resp = await async_client.post(
            "/contact/",
            json={
                "name": "Temp User",
                "email": bad_email,
                "message": "Hello there, testing disposable email.",
                "captcha_token": "dummy_token",
            },
        )
        assert contact_resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


async def test_strict_dns_mx_check_in_production():
    """Ensure production email validation rejects domains without MX/A records."""
    from fastapi import HTTPException
    from app.core.email_validation import verify_email_deliverability

    with (
        patch("app.core.email_validation.settings.ENVIRONMENT", "production"),
        patch("app.core.email_validation._has_valid_mail_dns_sync", return_value=False),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await verify_email_deliverability("user@nonexistent-domain-xyz.com")
        assert exc_info.value.status_code == 400

    with (
        patch("app.core.email_validation.settings.ENVIRONMENT", "production"),
        patch("app.core.email_validation._has_valid_mail_dns_sync", return_value=True),
    ):
        await verify_email_deliverability("user@gmail.com")


async def test_verify_otp_no_user_enumeration_and_unverified_jwt_rejected(
    async_client: AsyncClient, db
):
    """verify-otp must not reveal whether an email exists, and unverified users cannot use JWTs."""
    from app.models.user import User
    from app.services.auth_service import create_access_token, get_password_hash

    resp = await async_client.post(
        "/auth/verify-otp",
        json={"email": "unknown-user@gmail.com", "otp": "123456"},
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST

    bad_format = await async_client.post(
        "/auth/verify-otp",
        json={"email": "unknown-user@gmail.com", "otp": "abc"},
    )
    assert bad_format.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    unverified = User(
        email="unverified_jwt@example.com",
        password_hash=get_password_hash("Password123"),
        full_name="Unverified User",
        is_verified=False,
    )
    db.add(unverified)
    await db.commit()
    await db.refresh(unverified)

    token = create_access_token(data={"sub": str(unverified.id)})
    async_client.cookies.set("access_token", token)
    try:
        me_resp = await async_client.get("/auth/me")
        assert me_resp.status_code == status.HTTP_401_UNAUTHORIZED
    finally:
        async_client.cookies.clear()


async def test_client_ip_ignores_spoofed_xff_leftmost():
    """Ensure rate limiter uses rightmost proxy-appended IP, not spoofed leftmost XFF."""
    from starlette.requests import Request
    from app.core.rate_limit import get_client_ip

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"x-forwarded-for", b"1.2.3.4, 203.0.113.99")],
    }
    req = Request(scope)
    assert get_client_ip(req) == "203.0.113.99"


async def test_captcha_rejects_action_mismatch():
    """Ensure reCAPTCHA v3 tokens from another action cannot be replayed."""
    from unittest.mock import AsyncMock, MagicMock
    from app.services.auth_service import verify_captcha

    mock_response = MagicMock()
    mock_response.json.return_value = {
        "success": True,
        "score": 0.9,
        "action": "contact",
    }

    with (
        patch("app.services.auth_service.settings.RECAPTCHA_SECRET_KEY", "secret"),
        patch("httpx.AsyncClient.post", new=AsyncMock(return_value=mock_response)),
    ):
        assert await verify_captcha("valid-token", expected_action="signup") is False
        assert await verify_captcha("valid-token", expected_action="contact") is True


async def test_strict_schedule_window_validation():
    """Ensure schedule validation rejects unaligned, sub-30m, cross-midnight, and >90d slots."""
    from datetime import datetime, timedelta
    from fastapi import HTTPException
    from app.routers.bookings import _validate_schedule_window
    from app.services.calendar_service import MANILA_TZ

    now = datetime(2026, 11, 14, 10, 0, tzinfo=MANILA_TZ)

    # Valid 60-min aligned slot
    _validate_schedule_window(
        datetime(2026, 11, 15, 10, 0, tzinfo=MANILA_TZ),
        datetime(2026, 11, 15, 11, 0, tzinfo=MANILA_TZ),
        now,
    )

    # Unaligned start minute
    with pytest.raises(HTTPException):
        _validate_schedule_window(
            datetime(2026, 11, 15, 10, 5, tzinfo=MANILA_TZ),
            datetime(2026, 11, 15, 11, 5, tzinfo=MANILA_TZ),
            now,
        )

    # Too short (< 30 min)
    with pytest.raises(HTTPException):
        _validate_schedule_window(
            datetime(2026, 11, 15, 10, 0, tzinfo=MANILA_TZ),
            datetime(2026, 11, 15, 10, 15, tzinfo=MANILA_TZ),
            now,
        )

    # Cross-midnight
    with pytest.raises(HTTPException):
        _validate_schedule_window(
            datetime(2026, 11, 15, 23, 30, tzinfo=MANILA_TZ),
            datetime(2026, 11, 16, 0, 30, tzinfo=MANILA_TZ),
            now,
        )

    # More than 90 days in advance
    far_start = now + timedelta(days=95)
    far_start = far_start.replace(minute=0, second=0, microsecond=0)
    with pytest.raises(HTTPException):
        _validate_schedule_window(far_start, far_start + timedelta(hours=1), now)
