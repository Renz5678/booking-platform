"""
Tests for Proxy-Safe Client IP Rate Limiting (Milestone 1 / Requirement R1)

Covers:
- get_client_ip unit tests (rightmost hop, multi-hop chains, prefix spoofing prevention,
  whitespace handling, multiple header entries, fallback to client.host / 127.0.0.1,
  and behavior under TRUST_PROXY_HEADERS True vs False).
- Settings TRUST_PROXY_HEADERS model validator and default behavior across environments.
- Router rate limit integration tests with independent IP buckets behind reverse proxy,
  prevention of spoofed prefix bypass, and shared buckets when proxy headers are untrusted.
"""

import pytest
from httpx import AsyncClient
from starlette.requests import Request

from app.config import Settings, settings
from app.core.rate_limit import get_client_ip, limiter


def _make_request(
    headers: list[tuple[bytes, bytes]] | None = None,
    client: tuple[str, int] | None = ("10.0.0.1", 12345),
) -> Request:
    """Helper to build a Starlette Request with specific ASGI scope headers and client."""
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/auth/signup",
        "headers": headers or [],
        "client": client,
    }
    return Request(scope)


# ============================================================================
# 1. UNIT TESTS: get_client_ip & Settings configuration
# ============================================================================


def test_get_client_ip_rightmost_hop_single_ip(monkeypatch):
    """When X-Forwarded-For contains a single IP, extract that IP when proxy headers are trusted."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req = _make_request(headers=[(b"x-forwarded-for", b"203.0.113.195")])
    assert get_client_ip(req) == "203.0.113.195"


def test_get_client_ip_rightmost_hop_multi_hop_chain(monkeypatch):
    """When X-Forwarded-For contains multiple proxies/hops, extract the rightmost hop appended by the proxy."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req = _make_request(
        headers=[(b"x-forwarded-for", b"198.51.100.1, 10.0.0.1, 203.0.113.195")]
    )
    assert get_client_ip(req) == "203.0.113.195"


def test_get_client_ip_prefix_spoofing_prevention(monkeypatch):
    """
    Client prepends arbitrary spoofed IPs to X-Forwarded-For.
    The trusted reverse proxy appends the true remote address at the end.
    get_client_ip must strictly take the rightmost hop and ignore the spoofed prefix.
    """
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    # Attacker attempts to spoof 1.2.3.4
    req1 = _make_request(headers=[(b"x-forwarded-for", b"1.2.3.4, 203.0.113.195")])
    assert get_client_ip(req1) == "203.0.113.195"

    # Attacker attempts to rotate spoofed prefix to 5.6.7.8, 9.9.9.9
    req2 = _make_request(
        headers=[(b"x-forwarded-for", b"5.6.7.8, 9.9.9.9, 203.0.113.195")]
    )
    assert get_client_ip(req2) == "203.0.113.195"


def test_get_client_ip_multiple_header_lines(monkeypatch):
    """When multiple X-Forwarded-For header lines exist in ASGI scope, extract the rightmost hop."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req = _make_request(
        headers=[
            (b"x-forwarded-for", b"1.1.1.1, 2.2.2.2"),
            (b"x-forwarded-for", b"203.0.113.195"),
        ]
    )
    assert get_client_ip(req) == "203.0.113.195"


def test_get_client_ip_whitespace_and_empty_entries(monkeypatch):
    """Handle irregular whitespace and trailing commas in X-Forwarded-For gracefully."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req1 = _make_request(
        headers=[(b"x-forwarded-for", b"  1.1.1.1  ,   203.0.113.195   ")]
    )
    assert get_client_ip(req1) == "203.0.113.195"

    # Trailing comma with empty segment
    req2 = _make_request(headers=[(b"x-forwarded-for", b"1.1.1.1, 203.0.113.195,  ")])
    assert get_client_ip(req2) == "203.0.113.195"


def test_get_client_ip_fallback_to_client_host_when_header_absent(monkeypatch):
    """When X-Forwarded-For is missing or empty, fall back to request.client.host."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req1 = _make_request(headers=[], client=("192.168.1.55", 50000))
    assert get_client_ip(req1) == "192.168.1.55"

    # Header with only whitespace and commas
    req2 = _make_request(
        headers=[(b"x-forwarded-for", b"   ,   ")], client=("192.168.1.55", 50000)
    )
    assert get_client_ip(req2) == "192.168.1.55"


def test_get_client_ip_fallback_when_client_is_none(monkeypatch):
    """When request.client is None and no header is present, safely return 127.0.0.1."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req = _make_request(headers=[], client=None)
    assert get_client_ip(req) == "127.0.0.1"


def test_get_client_ip_untrusted_proxy_headers(monkeypatch):
    """
    When TRUST_PROXY_HEADERS is False (development/test environment):
    X-Forwarded-For headers MUST BE IGNORED to prevent client IP spoofing locally.
    Must return request.client.host.
    """
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", False)
    req = _make_request(
        headers=[(b"x-forwarded-for", b"203.0.113.195")],
        client=("127.0.0.1", 54321),
    )
    assert get_client_ip(req) == "127.0.0.1"


def test_settings_trust_proxy_headers_environment_resolution():
    """Verify Settings model validator properly resolves TRUST_PROXY_HEADERS default per environment."""
    base_kwargs = {
        "DATABASE_URL": "sqlite+aiosqlite:///:memory:",
        "JWT_SECRET": "test_jwt_secret",
        "GOOGLE_CLIENT_ID": "test_cid",
        "GOOGLE_CLIENT_SECRET": "test_csec",
        "ENCRYPTION_KEY": "test_enc_key_32_bytes_long_12345=",
        "FRONTEND_URL": "http://localhost:3000",
    }

    s_prod = Settings(**base_kwargs, ENVIRONMENT="production")
    assert s_prod.TRUST_PROXY_HEADERS is True
    assert s_prod.trust_proxy_headers is True

    s_staging = Settings(**base_kwargs, ENVIRONMENT="staging")
    assert s_staging.TRUST_PROXY_HEADERS is True
    assert s_staging.trust_proxy_headers is True

    s_dev = Settings(**base_kwargs, ENVIRONMENT="development")
    assert s_dev.TRUST_PROXY_HEADERS is False
    assert s_dev.trust_proxy_headers is False

    s_test = Settings(**base_kwargs, ENVIRONMENT="test")
    assert s_test.TRUST_PROXY_HEADERS is False
    assert s_test.trust_proxy_headers is False

    # Explicit override takes precedence over environment
    s_override_true = Settings(**base_kwargs, ENVIRONMENT="development", TRUST_PROXY_HEADERS=True)
    assert s_override_true.TRUST_PROXY_HEADERS is True
    assert s_override_true.trust_proxy_headers is True

    s_override_false = Settings(**base_kwargs, ENVIRONMENT="production", TRUST_PROXY_HEADERS=False)
    assert s_override_false.TRUST_PROXY_HEADERS is False
    assert s_override_false.trust_proxy_headers is False


# ============================================================================
# 2. INTEGRATION TESTS: Router Rate Limiting with Proxy Isolation
# ============================================================================


@pytest.mark.asyncio
async def test_router_rate_limiting_proxy_ip_isolation(async_client: AsyncClient, monkeypatch):
    """
    Integration test showing two requests with different rightmost IPs receive independent limits:
    - Client A exhausts its limit (5 requests / 15 min on /auth/signup).
    - Client A's 6th request is blocked with HTTP 429.
    - Client B with a different rightmost IP receives HTTP 201 (independent limit).
    - Client A attempting to spoof a different prefix is STILL blocked with HTTP 429.
    """
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    limiter.enabled = True
    limiter.reset()

    try:
        client_a_ip = "203.0.113.195"
        client_b_ip = "198.51.100.22"

        # Client A data (uses website honeypot to return 201 fast)
        signup_a = {
            "full_name": "Client A",
            "email": "client_a@example.com",
            "password": "Password123",
            "website": "http://honeypot.fast",
            "captcha_token": "dummy",
        }

        # Client A sends 5 requests with spoofed prefix + real IP
        for _ in range(5):
            resp = await async_client.post(
                "/auth/signup",
                json=signup_a,
                headers={"X-Forwarded-For": f"1.1.1.1, {client_a_ip}"},
            )
            assert resp.status_code == 201

        # Client A's 6th request should hit rate limit (429)
        resp_a_blocked = await async_client.post(
            "/auth/signup",
            json=signup_a,
            headers={"X-Forwarded-For": f"1.1.1.1, {client_a_ip}"},
        )
        assert resp_a_blocked.status_code == 429
        assert "Rate limit exceeded" in resp_a_blocked.json().get(
            "detail", resp_a_blocked.json().get("error", "")
        )

        # Client B sends a request with the SAME spoofed prefix but DIFFERENT rightmost IP
        signup_b = {
            "full_name": "Client B",
            "email": "client_b@example.com",
            "password": "Password123",
            "website": "http://honeypot.fast",
            "captcha_token": "dummy",
        }
        resp_b = await async_client.post(
            "/auth/signup",
            json=signup_b,
            headers={"X-Forwarded-For": f"1.1.1.1, {client_b_ip}"},
        )
        # Client B must NOT be rate limited
        assert resp_b.status_code == 201

        # Client A attempts to bypass rate limit by rotating spoofed prefix
        resp_a_bypass_attempt = await async_client.post(
            "/auth/signup",
            json=signup_a,
            headers={"X-Forwarded-For": f"9.9.9.9, {client_a_ip}"},
        )
        # Must STILL be blocked because rightmost IP matches Client A's exhausted bucket
        assert resp_a_bypass_attempt.status_code == 429

    finally:
        limiter.enabled = False
        limiter.reset()


@pytest.mark.asyncio
async def test_router_rate_limiting_untrusted_headers_share_client_bucket(
    async_client: AsyncClient, monkeypatch
):
    """
    When TRUST_PROXY_HEADERS is False, X-Forwarded-For headers are ignored.
    Requests with different X-Forwarded-For headers share the local client host bucket.
    """
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", False)
    limiter.enabled = True
    limiter.reset()

    try:
        signup_data = {
            "full_name": "Untrusted Proxy User",
            "email": "untrusted@example.com",
            "password": "Password123",
            "website": "http://honeypot.fast",
            "captcha_token": "dummy",
        }

        # Send 5 requests alternating fake XFF headers
        for i in range(5):
            resp = await async_client.post(
                "/auth/signup",
                json=signup_data,
                headers={"X-Forwarded-For": f"10.0.0.{i}"},
            )
            assert resp.status_code == 201

        # 6th request with yet another XFF header should STILL hit 429 because host IP is shared
        resp_blocked = await async_client.post(
            "/auth/signup",
            json=signup_data,
            headers={"X-Forwarded-For": "10.0.0.99"},
        )
        assert resp_blocked.status_code == 429

    finally:
        limiter.enabled = False
        limiter.reset()
