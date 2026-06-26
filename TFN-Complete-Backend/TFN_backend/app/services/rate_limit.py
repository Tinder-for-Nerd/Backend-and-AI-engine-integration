"""
Redis sliding-window rate limiter.
Usage in routers:
    await check_rate_limit(redis, f"like:{uid}", limit=100, window=86400)
"""
import time

import redis.asyncio as aioredis
from fastapi import HTTPException, status


async def check_rate_limit(
    redis: aioredis.Redis,  # type: ignore[type-arg]
    key: str,
    limit: int,
    window: int,  # seconds
) -> None:
    """Sliding window using Redis sorted set. Raises 429 if over limit."""
    now = time.time()
    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, 0, now - window)
    pipe.zcard(key)
    pipe.zadd(key, {str(now): now})
    pipe.expire(key, window)
    results = await pipe.execute()
    count = results[1]
    if count >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(window)},
            detail={"code": "rate_limited", "message": "Too many requests — slow down"},
        )
