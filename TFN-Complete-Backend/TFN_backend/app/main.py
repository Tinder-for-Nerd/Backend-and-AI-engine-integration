"""
ProMatch API — application factory.
"""
import time
import uuid

import sentry_sdk
import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import (
    admin,
    ai,
    availability,
    bookings,
    discovery,
    events,
    health,
    likes,
    matches,
    messages,
    moderation,
    notifications,
    profiles,
    users,
)

log = structlog.get_logger()


def create_app() -> FastAPI:
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.app_env,
            traces_sample_rate=0.1,
        )

    app = FastAPI(
        title="ProMatch API",
        version="0.1.0",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url=None,
    )

    # ── CORS ──────────────────────────────────────────────
    # Dev: allow all origins so test_client.html works from any port.
    # Prod: lock to allowed_origins_list.
    # Dev: wildcard + no credentials (test client uses Authorization header, not cookies).
    # Prod: explicit origins + credentials=True.
    if settings.is_production:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allowed_origins_list,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # ── Request ID middleware ─────────────────────────────
    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        with structlog.contextvars.bound_contextvars(request_id=request_id):
            response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    # ── Timing middleware ─────────────────────────────────
    @app.middleware("http")
    async def timing_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
        return response

    # ── Global error handler ──────────────────────────────
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled_exception", exc=str(exc), path=request.url.path)
        return JSONResponse(
            status_code=500,
            content={"code": "internal_error", "message": "An unexpected error occurred"},
        )

    # ── Routers ───────────────────────────────────────────
    prefix = "/api/v1"
    app.include_router(health.router)              # /healthz  /readyz  /version
    app.include_router(users.router, prefix=prefix)
    app.include_router(profiles.router, prefix=prefix)
    app.include_router(discovery.router, prefix=prefix)
    app.include_router(likes.router, prefix=prefix)
    app.include_router(matches.router, prefix=prefix)
    app.include_router(messages.router, prefix=prefix)
    app.include_router(availability.router, prefix=prefix)
    app.include_router(bookings.router, prefix=prefix)
    app.include_router(events.router, prefix=prefix)
    app.include_router(moderation.router, prefix=prefix)
    app.include_router(notifications.router, prefix=prefix)
    app.include_router(ai.router, prefix=prefix)
    app.include_router(admin.router, prefix=prefix)

    return app


app = create_app()
