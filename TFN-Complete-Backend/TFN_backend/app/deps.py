"""
FastAPI dependency injection.
All handlers should pull from here; never import from app.worker.
"""
from typing import Annotated

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.jwt import extract_user_id, is_admin_token
from app.config import settings
from app.db.client import get_admin_client, get_user_client
from supabase import Client

_bearer = HTTPBearer(auto_error=False)


def _get_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> str:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "missing_token", "message": "Authorization header required"},
        )
    return credentials.credentials


def current_user_id(token: Annotated[str, Depends(_get_token)]) -> str:
    try:
        return extract_user_id(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": str(exc), "message": "Invalid or expired token"},
        ) from exc


def require_admin(token: Annotated[str, Depends(_get_token)]) -> str:
    try:
        uid = extract_user_id(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": str(exc), "message": "Invalid or expired token"},
        ) from exc
    if not is_admin_token(token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "not_admin", "message": "Admin role required"},
        )
    return uid


def user_supabase(request: Request) -> Client:
    """User-scoped supabase client (RLS active)."""
    return get_user_client(request)


def admin_supabase() -> Client:
    """Service-role supabase client."""
    return get_admin_client()


# Redis pool — shared across requests
_redis_pool: aioredis.Redis | None = None  # type: ignore[type-arg]


async def get_redis() -> aioredis.Redis:  # type: ignore[type-arg]
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = await aioredis.from_url(
            settings.redis_url, encoding="utf-8", decode_responses=True
        )
    return _redis_pool


# Convenience type aliases for router signatures
UserID = Annotated[str, Depends(current_user_id)]
AdminID = Annotated[str, Depends(require_admin)]
UserDB = Annotated[Client, Depends(user_supabase)]
AdminDB = Annotated[Client, Depends(admin_supabase)]
Redis = Annotated[aioredis.Redis, Depends(get_redis)]  # type: ignore[type-arg]
