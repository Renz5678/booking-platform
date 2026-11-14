"""Shared per-account controls, hashed keys and no hosted fail-open."""
import hashlib
import time
from fastapi import HTTPException
from app.config import settings
_local = {}


async def account_limit(operation, identity, maximum, seconds):
    key = "account:" + operation + ":" + hashlib.sha256(identity.strip().lower().encode()).hexdigest()
    if settings.ENVIRONMENT in {"staging", "production"}:
        import redis.asyncio as redis
        client = redis.from_url(settings.REDIS_URL)
        try:
            count = await client.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, key, seconds)
        except Exception:
            raise HTTPException(503, "Security verification unavailable") from None
        finally:
            await client.aclose()
    else:
        count, deadline = _local.get(key, (0, 0))
        if deadline <= time.monotonic():
            count, deadline = 0, time.monotonic() + seconds
        count += 1
        _local[key] = count, deadline
    if count > maximum:
        raise HTTPException(429, "Please try again later")
