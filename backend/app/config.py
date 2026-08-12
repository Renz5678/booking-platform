from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET: str
    PAYMONGO_SECRET_KEY: str
    PAYMONGO_PUBLIC_KEY: str | None = None
    PAYMONGO_WEBHOOK_SECRET: str
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REFRESH_TOKEN: str | None = None
    ENCRYPTION_KEY: str
    FRONTEND_URL: str
    ENVIRONMENT: str = "development"  # Set to "production" to disable dev-only endpoints
    REDIS_URL: str = "redis://localhost:6379/0"
    RECAPTCHA_SECRET_KEY: str = ""
    RECAPTCHA_SITE_KEY: str = ""
    ADMIN_EMAIL: str = ""
    SENTRY_DSN: str | None = None
    SENTRY_ENVIRONMENT: str = "development"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
