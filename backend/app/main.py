from fastapi import FastAPI
import sentry_sdk
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
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
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_exception_handler(AlagaException, alaga_exception_handler)

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
app.include_router(counselors.router)
app.include_router(availability.router)
app.include_router(calendar.router)
app.include_router(bookings.router)
app.include_router(payments.router)
app.include_router(contact.router)
app.include_router(admin.router)


@app.get("/health")
async def health_check():
    """Health check endpoint to verify the API is running."""
    return {"status": "ok"}


@app.on_event("startup")
async def validate_production_config():
    """
    On startup, warn loudly if the app is running in production mode with
    known-weak or missing secrets. This is a last-resort safety net — real
    secret management should be handled via the deployment environment variables.
    """
    import logging as _logging
    _startup_logger = _logging.getLogger("startup.security")

    if settings.ENVIRONMENT == "production":
        weak_jwt_defaults = {"supersecret", "secret", "changeme", "your-secret-key"}
        if not settings.JWT_SECRET or settings.JWT_SECRET in weak_jwt_defaults:
            _startup_logger.critical(
                "SECURITY WARNING: JWT_SECRET is using a known weak default value in "
                "production! All JWTs can be forged. Rotate the secret immediately."
            )

        if not settings.RECAPTCHA_SECRET_KEY:
            _startup_logger.critical(
                "SECURITY WARNING: RECAPTCHA_SECRET_KEY is not set in production! "
                "Bot protection on signup, booking, and contact forms is DISABLED."
            )

        if settings.ENCRYPTION_KEY and settings.ENCRYPTION_KEY[:4].isdigit():
            _startup_logger.critical(
                "SECURITY WARNING: ENCRYPTION_KEY appears to use a sequential numeric "
                "default in production. Google OAuth refresh tokens are NOT securely "
                "encrypted. Rotate the key immediately."
            )

        if settings.PAYMONGO_SECRET_KEY.startswith("sk_test_"):
            _startup_logger.warning(
                "WARNING: PAYMONGO_SECRET_KEY is a test key in production mode. "
                "Real payments will NOT be processed."
            )
