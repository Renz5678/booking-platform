import asyncio
from app.celery_app import celery_app


@celery_app.task(name="app.tasks.operations.dispatch")
def dispatch_operations():
    async def run():
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from app.config import settings
        from app.services.outbox import dispatch
        # Each synchronous Celery task owns its event loop and connections.
        engine = create_async_engine(settings.DATABASE_URL)
        try:
            await dispatch(async_sessionmaker(engine, expire_on_commit=False))
            import redis.asyncio as redis
            cache = redis.from_url(settings.REDIS_URL)
            try:
                await cache.set("alaga:worker:heartbeat", "alive", ex=300)
            finally:
                await cache.aclose()
        finally:
            await engine.dispose()
    asyncio.run(run())
