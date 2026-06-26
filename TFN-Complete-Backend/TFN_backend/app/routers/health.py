"""Health, readiness, and version endpoints."""
import os

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.db.client import get_admin_client
from app.deps import get_redis

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz() -> dict:  # type: ignore[type-arg]
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> JSONResponse:
    checks: dict[str, str] = {}  # type: ignore[type-arg]

    # DB ping
    try:
        get_admin_client().table("profiles").select("id").limit(1).execute()
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "error"

    # Redis ping
    try:
        redis = await get_redis()
        await redis.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"

    all_ok = all(v == "ok" for v in checks.values())
    return JSONResponse(
        status_code=200 if all_ok else 503,
        content={"status": "ok" if all_ok else "degraded", "checks": checks},
    )


@router.get("/version")
async def version() -> dict:  # type: ignore[type-arg]
    return {"git_sha": os.getenv("GIT_SHA", "dev")}
