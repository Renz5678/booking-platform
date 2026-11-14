from fastapi import FastAPI, Request
import sentry_sdk
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.core.telemetry import scrub_event
from app.core.exceptions import AlagaException, alaga_exception_handler
from app.core.rate_limit import limiter
from app.middleware.logging import AuditLoggingMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routers import admin, auth, availability, bookings, calendar, contact, counselors, payments

app = FastAPI(
    title="Alaga API",
    description="Backend API for the Alaga counseling platform",
    version="1.0.0",
)

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.SENTRY_ENVIRONMENT or settings.ENVIRONMENT,
        send_default_pii=False,
        before_send=scrub_event,
        include_local_variables=False,
        traces_sample_rate=0.1,
        profiles_sample_rate=1.0,
    )

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_exception_handler(AlagaException, alaga_exception_handler)

from app.middleware.launch_gate import LaunchGateMiddleware
app.add_middleware(LaunchGateMiddleware)
from app.middleware.csrf import CSRFMiddleware
app.add_middleware(CSRFMiddleware)
from slowapi.middleware import SlowAPIMiddleware
app.add_middleware(SlowAPIMiddleware)
from app.middleware.body_limit import BodyLimitMiddleware
app.add_middleware(BodyLimitMiddleware)
app.add_middleware(AuditLoggingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
from app.routers import recovery
app.include_router(recovery.router)
from app.routers import mfa
app.include_router(mfa.router)
from app.routers import payment_review
app.include_router(payment_review.router)
app.include_router(counselors.router)
app.include_router(availability.router)
app.include_router(calendar.router)
app.include_router(bookings.router)
# Legacy automated payments are intentionally unavailable in the manual GCash release.
if settings.ENVIRONMENT in {"development", "test"}:
    app.include_router(payments.router)
app.include_router(contact.router)
app.include_router(admin.router)


@app.get("/health")
async def health_check():
    """Health check endpoint to verify the API is running."""
    return {"status": "ok"}


@app.on_event("startup")
async def validate_production_config():
    from urllib.parse import urlparse
    if settings.ENVIRONMENT not in {"development", "test", "staging", "production"}:
        raise RuntimeError("Invalid ENVIRONMENT")
    if settings.ENVIRONMENT in {"production", "staging"}:
        required = (settings.JWT_SECRET, settings.ENCRYPTION_KEY)
        if any(len(value) < 32 or value.lower() in {"supersecret", "changeme"} for value in required):
            raise RuntimeError("Strong independent signing and encryption keys are required")
        if settings.JWT_SECRET == settings.ENCRYPTION_KEY:
            raise RuntimeError("Signing and encryption keys must be independent")
        if any(urlparse(url).scheme != "https" for url in (settings.FRONTEND_URL, settings.BACKEND_URL)):
            raise RuntimeError("HTTPS frontend and backend URLs are required")
        if not all((settings.RECAPTCHA_SECRET_KEY, settings.RECAPTCHA_SITE_KEY, settings.GCASH_NUMBER, settings.GCASH_NAME)):
            raise RuntimeError("CAPTCHA and GCash configuration are required")
        if settings.COOKIE_SAMESITE != "lax":
            raise RuntimeError("Same-site domains with SameSite=Lax cookies are required")
        from redis.asyncio import Redis
        redis = Redis.from_url(settings.REDIS_URL)
        try:
            await redis.ping()
        finally:
            await redis.aclose()


@app.get("/auth/csrf")
async def get_csrf_token(request: Request):
    from app.middleware.csrf import csrf_bootstrap
    return await csrf_bootstrap(request)


from sqlalchemy.exc import IntegrityError
from fastapi.responses import JSONResponse

@app.exception_handler(IntegrityError)
async def integrity_conflict_handler(request: Request, exc: IntegrityError):
    # The failed request's dependency closes/rolls back its transaction.
    return JSONResponse({"detail": "A concurrent request conflicts with this operation; refresh and retry"}, status_code=409)

from app.routers import operations
app.include_router(operations.router)


@app.get("/health/ready")
async def readiness():
    from sqlalchemy import text
    from app.db.session import AsyncSessionLocal
    import redis.asyncio as redis
    from fastapi.responses import JSONResponse
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        client = redis.from_url(settings.REDIS_URL, socket_connect_timeout=2, socket_timeout=2)
        try:
            await client.ping()
        finally:
            await client.aclose()
    except Exception:
        return JSONResponse({"status": "unavailable"}, status_code=503)
    return {"status": "ready"}



