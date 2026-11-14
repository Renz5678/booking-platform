from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET: str
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REFRESH_TOKEN: str | None = None
    ENCRYPTION_KEY: str
    FRONTEND_URL: str
    CORS_ORIGINS: str = ""  # Optional comma-separated additional allowed origins
    ENVIRONMENT: str = "development"  # Set to "production" to disable dev-only endpoints
    SESSION_HOURLY_RATE: float = 1500.0
    REDIS_URL: str = "redis://localhost:6379/0"
    RECAPTCHA_SECRET_KEY: str = ""
    RECAPTCHA_SITE_KEY: str = ""
    ADMIN_EMAIL: str = ""
    SENTRY_DSN: str | None = None
    SENTRY_ENVIRONMENT: str = "development"

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
