import base64
from app.services.mfa import totp, verify_totp, recovery_codes, recovery_hash


def test_rfc6238_sha1_vector_and_replay():
    secret = base64.b32encode(b"12345678901234567890").decode()
    assert totp(secret, 1) == "287082"
    assert verify_totp(secret, "287082", -1, now=59) == 1
    assert verify_totp(secret, "287082", 1, now=59) is None
    assert verify_totp(secret, "287082", -1, now=150) is None
    assert verify_totp(secret, "１２３４５６", -1, now=59) is None


def test_recovery_codes_are_independent_and_hashed():
    codes, hashes = recovery_codes()
    assert len(set(codes)) == 10
    assert all(recovery_hash(code) == digest for code, digest in zip(codes, hashes))
    assert not set(codes).intersection(hashes)

import pytest
from types import SimpleNamespace
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from starlette.requests import Request
from app.core.security import get_current_user
from app.models.user import RoleEnum
from app.services.auth_service import create_access_token


@pytest.mark.asyncio
@pytest.mark.parametrize("role,path,verified,expected", [
    (RoleEnum.admin, "/admin/bookings", False, 403),
    (RoleEnum.admin, "/auth/mfa/verify", False, 200),
    (RoleEnum.admin, "/admin/bookings", True, 200),
    (RoleEnum.client, "/bookings/me", True, 200),
])
async def test_staff_mfa_enforced_on_server(role, path, verified, expected):
    user = SimpleNamespace(id="user", role=role, is_verified=True, is_active=True)
    session = SimpleNamespace(user_id="user", mfa_verified=verified,
                              mfa_deadline=datetime.now(timezone.utc) + timedelta(minutes=5))
    db = AsyncMock()
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=lambda: user)
    request = Request({"type": "http", "path": path, "headers": []})
    token = create_access_token({"sub": "user", "sid": "session"})
    with patch("app.services.sessions.load_session", AsyncMock(return_value=session)):
        if expected == 200:
            assert await get_current_user(request, token, db) is user
        else:
            with pytest.raises(HTTPException) as error:
                await get_current_user(request, token, db)
            assert error.value.status_code == expected


@pytest.mark.asyncio
async def test_disabled_account_blocked_even_with_session():
    user = SimpleNamespace(id="user", role=RoleEnum.admin, is_verified=True, is_active=False)
    db = AsyncMock()
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=lambda: user)
    request = Request({"type": "http", "path": "/admin/bookings", "headers": []})
    with patch("app.services.sessions.load_session", AsyncMock(return_value=SimpleNamespace(user_id="user"))):
        with pytest.raises(HTTPException) as error:
            await get_current_user(request, create_access_token({"sub": "user", "sid": "session"}), db)
        assert error.value.status_code == 401
