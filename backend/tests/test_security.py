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
