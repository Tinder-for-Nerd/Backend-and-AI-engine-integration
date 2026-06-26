import secrets
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from redis.asyncio import Redis

from app.config import settings

ALGORITHM = "HS256"
REFRESH_PREFIX = "refresh:"

_memory_refresh: dict[str, tuple[str, float]] = {}


def create_access_token(*, user_id: str, email: str, role: str) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


async def store_refresh_token(redis: Redis | None, user_id: str, refresh_token: str) -> None:
    if redis is not None:
        ttl = settings.refresh_token_expire_days * 24 * 60 * 60
        await redis.setex(f"{REFRESH_PREFIX}{refresh_token}", ttl, user_id)
        return
    import time

    expires = time.time() + settings.refresh_token_expire_days * 24 * 60 * 60
    _memory_refresh[refresh_token] = (user_id, expires)


async def get_refresh_user_id(redis: Redis | None, refresh_token: str) -> str | None:
    if redis is not None:
        user_id = await redis.get(f"{REFRESH_PREFIX}{refresh_token}")
        if user_id is None:
            return None
        return user_id.decode() if isinstance(user_id, bytes) else user_id

    import time

    entry = _memory_refresh.get(refresh_token)
    if not entry:
        return None
    user_id, expires = entry
    if time.time() > expires:
        _memory_refresh.pop(refresh_token, None)
        return None
    return user_id


async def revoke_refresh_token(redis: Redis | None, refresh_token: str) -> None:
    if redis is not None:
        await redis.delete(f"{REFRESH_PREFIX}{refresh_token}")
        return
    _memory_refresh.pop(refresh_token, None)


async def revoke_all_refresh_tokens(redis: Redis | None, user_id: str) -> None:
    if redis is not None:
        cursor = 0
        while True:
            cursor, keys = await redis.scan(cursor, match=f"{REFRESH_PREFIX}*", count=100)
            for key in keys:
                stored_user_id = await redis.get(key)
                if stored_user_id:
                    stored = stored_user_id.decode() if isinstance(stored_user_id, bytes) else stored_user_id
                    if stored == user_id:
                        await redis.delete(key)
            if cursor == 0:
                break
        return
    to_delete = [token for token, (uid, _) in _memory_refresh.items() if uid == user_id]
    for token in to_delete:
        _memory_refresh.pop(token, None)
