from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings
from app.services.lockout import check_rate_limit
from app.services.redis_client import get_redis, memory_rate_limit

SKIP_PATHS = {"/health", "/"}


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path.startswith("/static") or path in SKIP_PATHS:
            return await call_next(request)

        ip = _client_ip(request)
        is_auth = path.startswith("/api/auth")
        limit = settings.auth_rate_limit if is_auth else settings.api_rate_limit
        bucket = "auth" if is_auth else "api"
        key = f"rate:{bucket}:{ip}"

        redis = await get_redis()
        if redis is not None:
            allowed, remaining, retry_after = await check_rate_limit(
                redis, key, limit, settings.rate_limit_window_seconds
            )
        else:
            allowed, remaining, retry_after = await memory_rate_limit(
                key, limit, settings.rate_limit_window_seconds
            )

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again later."},
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
