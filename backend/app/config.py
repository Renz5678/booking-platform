from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET: str

    # ---------------------------------------------------------------------------
    # PayMongo — optional while using the manual GCash payment flow.
    # Set PAYMONGO_SECRET_KEY and PAYMONGO_WEBHOOK_SECRET to switch back to
    # automated card/GCash/Maya payments via the PayMongo API.
    # ---------------------------------------------------------------------------
    PAYMONGO_SECRET_KEY: str = ""
    PAYMONGO_PUBLIC_KEY: str | None = None
    PAYMONGO_WEBHOOK_SECRET: str = ""

    # ---------------------------------------------------------------------------
    # GCash Manual Payment — displayed to clients on the booking confirmation.
    # ---------------------------------------------------------------------------
    GCASH_NUMBER: str = ""
    GCASH_NAME: str = ""

    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REFRESH_TOKEN: str | None = None
    ENCRYPTION_KEY: str
    FRONTEND_URL: str
    BACKEND_URL: str = "http://localhost:8000"  # Used for email links to API endpoints (e.g. ICS download)
    ENVIRONMENT: str = "development"  # Set to "production" to disable dev-only endpoints
    TRUST_PROXY_HEADERS: bool | None = None
    REDIS_URL: str = "redis://localhost:6379/0"
    RECAPTCHA_SECRET_KEY: str = ""
    RECAPTCHA_SITE_KEY: str = ""
    ADMIN_EMAIL: str = ""
    CLOUDINARY_URL: str | None = None
    SENTRY_DSN: str | None = None
    SENTRY_ENVIRONMENT: str = "development"
    SESSION_HOURLY_RATE: float = 300.0
    COOKIE_SAMESITE: str = "lax"
    # Keep real-client access closed until every release gate is independently verified.
    PUBLIC_LAUNCH_ENABLED: bool = False
    LEGACY_ENCRYPTION_KEYS: str = ""

    @model_validator(mode="after")
    def _resolve_trust_proxy_headers(self) -> "Settings":
        if self.TRUST_PROXY_HEADERS is None:
            self.TRUST_PROXY_HEADERS = self.ENVIRONMENT in ("production", "staging")
        return self

    @property
    def trust_proxy_headers(self) -> bool:
        if self.TRUST_PROXY_HEADERS is not None:
            return self.TRUST_PROXY_HEADERS
        return self.ENVIRONMENT in ("production", "staging")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
