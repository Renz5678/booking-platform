import time
from unittest.mock import patch
import pytest
import jwt
from app.config import settings
from app.services.auth_service import create_access_token, create_refresh_token, decode_refresh_token, verify_captcha
from app.middleware.csrf import sign_token, valid_token
from app.core.encryption import encrypt_token, decrypt_token
from app.schemas.counselor import PublicCounselorUser


def test_token_purposes():
    access = create_access_token({"sub": "user", "sid": "session"})
    assert jwt.decode(access, settings.JWT_SECRET, algorithms=["HS256"], audience="alaga-web")["type"] == "access"
    assert decode_refresh_token(access) is None
    assert decode_refresh_token(create_refresh_token({"sub": "user"})) == "user"


def test_csrf_browser_session_and_expiry():
    issued = int(time.time())
    token = sign_token("browser", "session", issued)
    assert valid_token(token, "browser", "session")
    assert not valid_token(token, "attacker", "session")
    assert not valid_token(token, "browser", "other")
    assert not valid_token(sign_token("browser", "session", issued - 1900), "browser", "session")


def test_authenticated_encryption():
    assert decrypt_token(encrypt_token("sensitive")) == "sensitive"
    with pytest.raises(ValueError):
        decrypt_token("legacy plaintext")


def test_public_profile_has_no_email():
    assert PublicCounselorUser(full_name="Counselor", email="private@example.com").model_dump() == {"full_name": "Counselor"}


@pytest.mark.asyncio
async def test_production_captcha_rejects_dummy():
    with patch.object(settings, "ENVIRONMENT", "production"), patch.object(settings, "RECAPTCHA_SECRET_KEY", ""):
        assert not await verify_captcha("dummy_token", "booking")
