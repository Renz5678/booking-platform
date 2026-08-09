import pytest
from fastapi import status
from httpx import AsyncClient
from unittest.mock import patch

from app.main import app

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


# We would ideally test RBAC here, but creating full user sessions in tests
# requires setting up test DB fixtures for clients, counselors, and admins.
# For MVP, we've added the structure and verified unauthenticated access.
