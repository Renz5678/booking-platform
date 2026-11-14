"""
Adversarial and Empirical Challenge Suite for Rate Limiting (Milestone 1 / Requirement R1)

Tests:
1. Malformed headers: repeated commas, empty segments, whitespace, tabs, newlines.
2. Empty and missing header values, None client, empty client host.
3. Multi-header lines in ASGI scope (multiple X-Forwarded-For occurrences).
4. IPv6 variants: full hex, compressed, loopback, IPv4-mapped, bracketed, bracketed with port.
5. Case-insensitivity across realistic HTTP request boundaries.
6. Spoofed prefix rotation attacks behind proxy (TRUST_PROXY_HEADERS=True).
7. Delimiter injection and evasion attempts.
8. Rate limiting bypass attempts when proxy headers are untrusted (TRUST_PROXY_HEADERS=False).
9. Non-standard request.headers objects (e.g. dicts lacking getlist).
10. Concurrency and stress: independent IP bucket isolation under rapid concurrent requests.
"""

import asyncio
import pytest
from httpx import AsyncClient, ASGITransport
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from fastapi import FastAPI
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.core.rate_limit import get_client_ip, limiter


def _make_scope_request(
    headers: list[tuple[bytes, bytes]] | None = None,
    client: tuple[str, int] | None = ("10.0.0.1", 12345),
) -> Request:
    """Helper to build a Starlette Request with specific raw ASGI scope."""
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/auth/signup",
        "headers": headers or [],
        "client": client,
    }
    return Request(scope)


# ============================================================================
# 1. MALFORMED HEADERS & DELIMITER EDGE CASES
# ============================================================================


@pytest.mark.parametrize(
    "header_value,expected_ip",
    [
        (b",,,,,1.2.3.4,,,,,", "1.2.3.4"),
        (b"  ,  ,  1.1.1.1  ,  ,  2.2.2.2  ,  ", "2.2.2.2"),
        (b",,,10.0.0.1,,,20.0.0.2,,,30.0.0.3,,,", "30.0.0.3"),
        (b"1.1.1.1, 2.2.2.2,", "2.2.2.2"),
        (b", 1.1.1.1, 2.2.2.2", "2.2.2.2"),
        (b"1.1.1.1,\t2.2.2.2\n", "2.2.2.2"),
        (b"1.1.1.1\r,  \t 2.2.2.2 \r\n", "2.2.2.2"),
        ("\u00a0 1.1.1.1 , \u00a0 2.2.2.2 \u00a0".encode("latin-1"), "2.2.2.2"),
    ],
)
def test_get_client_ip_malformed_delimiters(monkeypatch, header_value, expected_ip):
    """Verify robust extraction when X-Forwarded-For contains erratic delimiters and whitespace."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req = _make_scope_request(headers=[(b"x-forwarded-for", header_value)])
    assert get_client_ip(req) == expected_ip


@pytest.mark.parametrize(
    "header_value",
    [
        b"",
        b"   ",
        b",",
        b",,,,,",
        b"  ,  ,   ,  ",
        b"\t\n\r",
    ],
)
def test_get_client_ip_empty_or_delimiter_only(monkeypatch, header_value):
    """When X-Forwarded-For is empty or contains only delimiters, must fall back to client.host."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req = _make_scope_request(
        headers=[(b"x-forwarded-for", header_value)],
        client=("192.168.1.100", 50000),
    )
    assert get_client_ip(req) == "192.168.1.100"


def test_get_client_ip_fallback_empty_client_host(monkeypatch):
    """When request.client is present but host is empty string, return '127.0.0.1'."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req = _make_scope_request(headers=[], client=("", 0))
    assert get_client_ip(req) == "127.0.0.1"


# ============================================================================
# 2. MULTIPLE X-FORWARDED-FOR HEADERS
# ============================================================================


def test_get_client_ip_multiple_headers_variations(monkeypatch):
    """Verify rightmost extraction across multiple X-Forwarded-For lines."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)

    # Three headers with multiple IPs each
    req1 = _make_scope_request(
        headers=[
            (b"x-forwarded-for", b"1.1.1.1, 2.2.2.2"),
            (b"x-forwarded-for", b"3.3.3.3"),
            (b"x-forwarded-for", b"4.4.4.4, 203.0.113.195"),
        ]
    )
    assert get_client_ip(req1) == "203.0.113.195"

    # Last header is empty or whitespace
    req2 = _make_scope_request(
        headers=[
            (b"x-forwarded-for", b"1.1.1.1, 203.0.113.195"),
            (b"x-forwarded-for", b"   ,  "),
        ]
    )
    assert get_client_ip(req2) == "203.0.113.195"

    # Middle header empty
    req3 = _make_scope_request(
        headers=[
            (b"x-forwarded-for", b"1.1.1.1"),
            (b"x-forwarded-for", b""),
            (b"x-forwarded-for", b"203.0.113.195"),
        ]
    )
    assert get_client_ip(req3) == "203.0.113.195"


# ============================================================================
# 3. IPV6 ADDRESS HANDLING
# ============================================================================


@pytest.mark.parametrize(
    "ipv6_str",
    [
        "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
        "2001:db8:85a3::8a2e:370:7334",
        "::1",
        "::ffff:192.0.2.128",
        "[2001:db8::1]",
        "[2001:db8::1]:8080",
        "fe80::1%eth0",
    ],
)
def test_get_client_ip_ipv6_variants(monkeypatch, ipv6_str):
    """Ensure all standard and non-standard IPv6 formats are extracted cleanly."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req = _make_scope_request(
        headers=[(b"x-forwarded-for", f"1.1.1.1, {ipv6_str}".encode("latin-1"))]
    )
    assert get_client_ip(req) == ipv6_str


def test_get_client_ip_ipv6_fallback(monkeypatch):
    """When headers are absent and client is IPv6, returns client.host."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    req = _make_scope_request(headers=[], client=("2001:db8::1", 54321))
    assert get_client_ip(req) == "2001:db8::1"


# ============================================================================
# 4. HTTP REQUEST INTEGRATION & CASE INSENSITIVITY
# ============================================================================


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "header_name",
    [
        "X-Forwarded-For",
        "x-forwarded-for",
        "X-FORWARDED-FOR",
        "X-FoRwArDeD-fOr",
    ],
)
async def test_case_insensitive_http_header_resolution(header_name, monkeypatch):
    """Verify that case variations in real HTTP headers resolve to the correct IP."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)

    async def endpoint(request: Request):
        return PlainTextResponse(get_client_ip(request))

    test_app = FastAPI()
    test_app.add_route("/probe", endpoint)

    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        resp = await client.get("/probe", headers={header_name: "10.0.0.1, 203.0.113.195"})
        assert resp.status_code == 200
        assert resp.text == "203.0.113.195"


# ============================================================================
# 5. DICT-BASED HEADERS (FALLBACK WHEN HASATTR GETLIST IS FALSE)
# ============================================================================


def test_get_client_ip_headers_without_getlist(monkeypatch):
    """When request.headers is a plain dict or lacks getlist, cleanly fallback to .get()."""
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)

    class CustomRequest:
        headers = {"x-forwarded-for": "1.1.1.1, 203.0.113.195"}
        client = None

    req = CustomRequest()
    assert get_client_ip(req) == "203.0.113.195"

    class EmptyCustomRequest:
        headers = {}
        client = None

    assert get_client_ip(EmptyCustomRequest()) == "127.0.0.1"


# ============================================================================
# 6. ADVERSARIAL ATTACKS: PREFIX ROTATION BEHIND PROXY
# ============================================================================


@pytest.mark.asyncio
async def test_adversarial_spoofed_prefix_rotation(monkeypatch):
    """
    An attacker attempts to bypass a rate limit of 3 req/min by rotating
    the spoofed prefix in X-Forwarded-For on every request.
    Because the proxy appends the real IP at the end, all requests must be counted
    against the same real IP bucket, and the 4th request must be rejected (429).
    """
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)

    test_limiter = Limiter(key_func=get_client_ip, storage_uri="memory://")
    test_app = FastAPI()
    test_app.state.limiter = test_limiter

    @test_app.exception_handler(RateLimitExceeded)
    def _rate_handler(request: Request, exc: RateLimitExceeded):
        return PlainTextResponse("Rate limit exceeded", status_code=429)

    @test_app.get("/guarded")
    @test_limiter.limit("3/minute")
    def guarded(request: Request):
        return PlainTextResponse("granted")

    real_ip = "203.0.113.77"

    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        # Requests 1 to 3 with different prefixes must succeed
        for i in range(3):
            spoofed_prefix = f"192.168.1.{i}, 10.0.0.{i}"
            resp = await client.get(
                "/guarded",
                headers={"X-Forwarded-For": f"{spoofed_prefix}, {real_ip}"},
            )
            assert resp.status_code == 200
            assert resp.text == "granted"

        # Request 4 with yet another spoofed prefix must be blocked
        resp_blocked = await client.get(
            "/guarded",
            headers={"X-Forwarded-For": f"8.8.8.8, {real_ip}"},
        )
        assert resp_blocked.status_code == 429
        assert resp_blocked.text == "Rate limit exceeded"

        # Another client with a DIFFERENT real IP must NOT be blocked
        other_real_ip = "198.51.100.99"
        resp_other = await client.get(
            "/guarded",
            headers={"X-Forwarded-For": f"8.8.8.8, {other_real_ip}"},
        )
        assert resp_other.status_code == 200


# ============================================================================
# 7. ADVERSARIAL ATTACKS: BYPASS WHEN PROXY HEADERS UNTRUSTED
# ============================================================================


@pytest.mark.asyncio
async def test_adversarial_bypass_attempt_when_proxy_untrusted(monkeypatch):
    """
    When TRUST_PROXY_HEADERS=False, an attacker attempts to evade rate limiting
    by sending fake X-Forwarded-For headers.
    Because the proxy is untrusted, X-Forwarded-For MUST BE IGNORED.
    All requests from the same connection/client.host must be pooled into the same bucket.
    """
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", False)

    test_limiter = Limiter(key_func=get_client_ip, storage_uri="memory://")
    test_app = FastAPI()
    test_app.state.limiter = test_limiter

    @test_app.exception_handler(RateLimitExceeded)
    def _rate_handler(request: Request, exc: RateLimitExceeded):
        return PlainTextResponse("Rate limit exceeded", status_code=429)

    @test_app.get("/guarded")
    @test_limiter.limit("2/minute")
    def guarded(request: Request):
        return PlainTextResponse("granted")

    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        # Request 1: sends fake IP 1.1.1.1
        r1 = await client.get("/guarded", headers={"X-Forwarded-For": "1.1.1.1"})
        assert r1.status_code == 200

        # Request 2: sends fake IP 2.2.2.2
        r2 = await client.get("/guarded", headers={"X-Forwarded-For": "2.2.2.2"})
        assert r2.status_code == 200

        # Request 3: sends fake IP 3.3.3.3 — should hit 429 because host IP is shared!
        r3 = await client.get("/guarded", headers={"X-Forwarded-For": "3.3.3.3"})
        assert r3.status_code == 429


# ============================================================================
# 8. CONCURRENCY & STRESS TEST
# ============================================================================


@pytest.mark.asyncio
async def test_rate_limiter_concurrent_isolation(monkeypatch):
    """
    Concurrently fire 30 requests:
    - 20 requests from Client A (rate limit is 10/min -> 10 succeed, 10 blocked)
    - 10 requests from Client B (10 succeed)
    Verify no cross-talk or race conditions corrupting the rate limit buckets.
    """
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)

    test_limiter = Limiter(key_func=get_client_ip, storage_uri="memory://")
    test_app = FastAPI()
    test_app.state.limiter = test_limiter

    @test_app.exception_handler(RateLimitExceeded)
    def _rate_handler(request: Request, exc: RateLimitExceeded):
        return PlainTextResponse("Rate limit exceeded", status_code=429)

    @test_app.get("/burst")
    @test_limiter.limit("10/minute")
    def burst(request: Request):
        return PlainTextResponse("ok")

    ip_a = "203.0.113.10"
    ip_b = "198.51.100.20"

    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        tasks_a = [
            client.get("/burst", headers={"X-Forwarded-For": f"10.0.0.{i}, {ip_a}"})
            for i in range(20)
        ]
        tasks_b = [
            client.get("/burst", headers={"X-Forwarded-For": f"10.0.0.{i}, {ip_b}"})
            for i in range(10)
        ]

        responses_a = await asyncio.gather(*tasks_a)
        responses_b = await asyncio.gather(*tasks_b)

        codes_a = [r.status_code for r in responses_a]
        codes_b = [r.status_code for r in responses_b]

        # For Client A: exactly 10 requests should succeed (200), exactly 10 blocked (429)
        assert codes_a.count(200) == 10
        assert codes_a.count(429) == 10

        # For Client B: all 10 requests should succeed (200)
        assert codes_b.count(200) == 10
        assert codes_b.count(429) == 0
