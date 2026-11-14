"""Signed, browser-bound CSRF tokens; authentication remains a separate check."""
import hashlib
import hmac
import secrets
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.config import settings


def sign_token(nonce: str, session: str, issued: int) -> str:
    payload = f"{nonce}:{hashlib.sha256(session.encode()).hexdigest()}:{issued}"
    return f"{issued}." + hmac.new(settings.JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def valid_token(token: str, nonce: str, session: str) -> bool:
    try:
        issued = int(token.split(".", 1)[0])
        return 0 <= time.time() - issued <= 1800 and hmac.compare_digest(token, sign_token(nonce, session, issued))
    except (ValueError, TypeError):
        return False


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.method in {"POST", "PUT", "PATCH", "DELETE"} and settings.ENVIRONMENT in {"production", "staging"}:
            if request.headers.get("origin") != settings.FRONTEND_URL or not valid_token(
                request.headers.get("x-csrf-token", ""), request.cookies.get("csrf_nonce", ""),
                request.cookies.get("refresh_token", "")):
                return JSONResponse({"detail": "CSRF validation failed"}, status_code=403)
        return await call_next(request)


async def csrf_bootstrap(request):
    from fastapi.responses import JSONResponse
    nonce = request.cookies.get("csrf_nonce") or secrets.token_urlsafe(32)
    token = sign_token(nonce, request.cookies.get("refresh_token", ""), int(time.time()))
    response = JSONResponse({"csrf_token": token})
    response.headers["Cache-Control"] = "no-store"
    response.set_cookie("csrf_nonce", nonce, httponly=True, secure=settings.ENVIRONMENT in {"production", "staging"}, samesite="lax", max_age=1800)
    return response
