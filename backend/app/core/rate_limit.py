from starlette.requests import Request
from slowapi import Limiter
from app.config import settings


def get_client_ip(request: Request) -> str:
    """Extract client IP safely across reverse proxies.

    When TRUST_PROXY_HEADERS is enabled (production/staging), extracts the
    rightmost hop from X-Forwarded-For, which is appended by the trusted
    ingress reverse proxy (e.g. Render). Any client-spoofed prefix IPs
    are safely ignored.

    When TRUST_PROXY_HEADERS is False or headers are missing/empty, falls back
    to request.client.host (or '127.0.0.1' if client is None).
    """
    fallback = (
        request.client.host
        if (request.client and request.client.host)
        else "127.0.0.1"
    )

    trust_proxy = getattr(settings, "TRUST_PROXY_HEADERS", None)
    if trust_proxy is None:
        trust_proxy = getattr(settings, "trust_proxy_headers", False)

    if trust_proxy:
        if hasattr(request.headers, "getlist"):
            xff_list = request.headers.getlist("x-forwarded-for")
            raw_xff = ", ".join(xff_list) if xff_list else None
        else:
            raw_xff = request.headers.get("x-forwarded-for")

        if raw_xff:
            parts = [p.strip() for p in raw_xff.split(",") if p.strip()]
            if parts:
                return parts[-1]

    return fallback


limiter = Limiter(
    key_func=get_client_ip,
    storage_uri=settings.REDIS_URL if settings.ENVIRONMENT in {"staging", "production"} else "memory://",
    default_limits=["120/minute"],
    swallow_errors=False,
)

__all__ = ["limiter", "get_client_ip"]
