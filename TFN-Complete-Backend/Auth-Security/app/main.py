from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.database import init_db
from app.middleware.rate_limit import RateLimitMiddleware
from app.routers import auth, users
from app.services.oauth import register_oauth_providers
from app.services.redis_client import close_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    register_oauth_providers()
    await init_db()
    yield
    await close_redis()


app = FastAPI(
    title=settings.app_name,
    description="Auth & Security API — OAuth, JWT, roles, rate limiting",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)
app.add_middleware(RateLimitMiddleware)

static_dir = Path(__file__).parent.parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

app.include_router(auth.router)
app.include_router(users.router)


@app.get("/", include_in_schema=False)
async def root():
    index = static_dir / "index.html"
    return FileResponse(index)


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.app_name}
