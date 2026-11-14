from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app.schemas.user import UserCreate
from app.services.calendar_service import check_google_calendar_busy


def test_multibyte_password_limit_is_validation_error():
    with pytest.raises(ValidationError):
        UserCreate(full_name="Valid Name", email="valid@example.com", password="Aa1" + "é" * 36)


@pytest.mark.asyncio
@pytest.mark.parametrize("response", [
    httpx.Response(503, json={}),
    httpx.Response(200, json={"calendars": {"primary": {"errors": [{"reason": "notFound"}]}}}),
    httpx.Response(200, json={}),
])
async def test_calendar_errors_never_report_free(response):
    client = AsyncMock()
    client.post.return_value = response
    context = AsyncMock()
    context.__aenter__.return_value = client
    with patch("app.services.calendar_service.get_google_access_token", return_value="access"), patch("app.services.calendar_service.httpx.AsyncClient", return_value=context):
        now = datetime.now(timezone.utc)
        with pytest.raises(HTTPException):
            await check_google_calendar_busy("refresh", now, now + timedelta(hours=1))
