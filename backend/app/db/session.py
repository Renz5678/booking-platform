from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

_engine_kwargs: dict = {"echo": False}
if not _is_sqlite:
    # Keep per-process pool small to stay well under Supabase Session Mode's
    # 15-client limit across FastAPI, Celery workers, and reloads.
    _engine_kwargs.update(
        pool_size=3,
        max_overflow=2,
        pool_timeout=15,
        pool_recycle=300,
        pool_pre_ping=True,
    )
    if ":6543" in settings.DATABASE_URL:
        # Disable asyncpg prepared statement cache for PgBouncer transaction mode.
        _engine_kwargs["connect_args"] = {"statement_cache_size": 0}

engine = create_async_engine(settings.DATABASE_URL, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
