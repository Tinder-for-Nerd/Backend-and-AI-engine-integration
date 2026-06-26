from redis.asyncio import Redis

from app.config import settings
from app.services.redis_client import get_redis, memory_rate_limit

LOCKOUT_PREFIX = "lockout:"
ATTEMPTS_PREFIX = "login_attempts:"

_memory_lockouts: dict[str, float] = {}
_memory_attempts: dict[str, tuple[int, float]] = {}


async def is_account_locked(redis: Redis | None, email: str) -> bool:
    key = email.lower()
    if redis is not None:
        return bool(await redis.exists(f"{LOCKOUT_PREFIX}{key}"))
    import time

    expiry = _memory_lockouts.get(key)
    if expiry and time.time() < expiry:
        return True
    _memory_lockouts.pop(key, None)
    return False


async def get_lockout_ttl(redis: Redis | None, email: str) -> int:
    key = email.lower()
    if redis is not None:
        ttl = await redis.ttl(f"{LOCKOUT_PREFIX}{key}")
        return max(ttl, 0)
    import time

    expiry = _memory_lockouts.get(key, 0)
    return max(int(expiry - time.time()), 0)


async def record_failed_login(redis: Redis | None, email: str) -> int:
    key = email.lower()
    if redis is not None:
        rkey = f"{ATTEMPTS_PREFIX}{key}"
        attempts = await redis.incr(rkey)
        if attempts == 1:
            await redis.expire(rkey, settings.lockout_duration_minutes * 60)
        if attempts >= settings.max_login_attempts:
            lockout_key = f"{LOCKOUT_PREFIX}{key}"
            await redis.setex(lockout_key, settings.lockout_duration_minutes * 60, "1")
            await redis.delete(rkey)
        return attempts

    import time

    now = time.time()
    attempts, expires = _memory_attempts.get(key, (0, now + settings.lockout_duration_minutes * 60))
    if now > expires:
        attempts = 0
    attempts += 1
    _memory_attempts[key] = (attempts, now + settings.lockout_duration_minutes * 60)
    if attempts >= settings.max_login_attempts:
        _memory_lockouts[key] = now + settings.lockout_duration_minutes * 60
        _memory_attempts.pop(key, None)
    return attempts


async def clear_login_attempts(redis: Redis | None, email: str) -> None:
    key = email.lower()
    if redis is not None:
        await redis.delete(f"{ATTEMPTS_PREFIX}{key}")
        await redis.delete(f"{LOCKOUT_PREFIX}{key}")
        return
    _memory_attempts.pop(key, None)
    _memory_lockouts.pop(key, None)


async def check_rate_limit(redis: Redis, key: str, limit: int, window: int) -> tuple[bool, int, int]:
    """Returns (allowed, remaining, retry_after_seconds)."""
    pipe = redis.pipeline()
    pipe.incr(key)
    pipe.expire(key, window, nx=True)
    pipe.ttl(key)
    count, _, ttl = await pipe.execute()
    count = int(count)
    ttl = int(ttl) if ttl and ttl > 0 else window

    if count > limit:
        return False, 0, ttl
    return True, max(limit - count, 0), ttl
