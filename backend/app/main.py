from contextlib import asynccontextmanager

from fastapi import FastAPI
import sentry_sdk
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.core.exceptions import AlagaException, alaga_exception_handler
from app.core.rate_limit import limiter
from app.db.session import engine
from app.middleware.logging import AuditLoggingMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routers import admin, auth, availability, bookings, calendar, contact, counselors, payments


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await engine.dispose()


is_production_env = settings.ENVIRONMENT == "production"

app = FastAPI(
    title="Alaga API",
    description="Backend API for the Alaga counseling platform",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if is_production_env else "/docs",
    redoc_url=None if is_production_env else "/redoc",
    openapi_url=None if is_production_env else "/openapi.json",
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

allowed_origins = [settings.FRONTEND_URL.rstrip("/")]
if settings.CORS_ORIGINS:
    for origin in settings.CORS_ORIGINS.split(","):
        cleaned = origin.strip().rstrip("/")
        if cleaned and cleaned not in allowed_origins:
            allowed_origins.append(cleaned)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
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
