from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings


def get_client_ip(request: Request) -> str:
    # Prefer trusted proxy headers set at the edge (Cloudflare / Render)
    for header in ("cf-connecting-ip", "true-client-ip", "x-real-ip"):
        val = request.headers.get(header)
        if val and val.strip():
            return val.strip()

    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # Take the rightmost IP added by our immediate reverse proxy, not the
        # leftmost client-supplied value which can be spoofed to bypass limits.
        return forwarded_for.split(",")[-1].strip()
    return get_remote_address(request)


limiter = Limiter(
    key_func=get_client_ip,
    default_limits=["120/minute"],
    storage_uri=settings.REDIS_URL if settings.ENVIRONMENT == "production" else None,
)
