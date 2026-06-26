import time
from collections import defaultdict

from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError

from app.config import settings

redis_client: Redis | None = None
_use_memory_fallback = False

_memory_counters: dict[str, tuple[int, float]] = defaultdict(lambda: (0, 0.0))


async def get_redis() -> Redis | None:
    global redis_client, _use_memory_fallback
    if _use_memory_fallback:
        return None
    if redis_client is None:
        try:
            client = Redis.from_url(settings.redis_url, decode_responses=True)
            await client.ping()
            redis_client = client
        except (RedisConnectionError, OSError):
            if settings.debug:
                _use_memory_fallback = True
                return None
            raise
    return redis_client


async def close_redis() -> None:
    global redis_client
    if redis_client is not None:
        await redis_client.close()
        redis_client = None


async def memory_rate_limit(key: str, limit: int, window: int) -> tuple[bool, int, int]:
    now = time.time()
    count, expires = _memory_counters[key]
    if now > expires:
        count, expires = 0, now + window
    count += 1
    _memory_counters[key] = (count, expires)
    ttl = max(int(expires - now), 1)
    if count > limit:
        return False, 0, ttl
    return True, max(limit - count, 0), ttl
