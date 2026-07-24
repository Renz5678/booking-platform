from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.core.rate_limit import limiter
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routers import auth, availability, bookings, counselors, payments

app = FastAPI(
    title="Alaga API",
    description="Backend API for the Alaga counseling platform",
    version="1.0.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
app.include_router(bookings.router)
app.include_router(payments.router)


@app.get("/health")
async def health_check():
    """Health check endpoint to verify the API is running."""
    return {"status": "ok"}
