from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.config import settings


class LaunchGateMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if (settings.ENVIRONMENT in {"production", "staging"}
                and not settings.PUBLIC_LAUNCH_ENABLED
                and (request.url.path.startswith("/auth/signup")
                     or request.url.path.startswith("/bookings")
                     or request.url.path.startswith("/payments"))):
            return JSONResponse({"detail": "Client booking is not open yet"}, status_code=503)
        return await call_next(request)
