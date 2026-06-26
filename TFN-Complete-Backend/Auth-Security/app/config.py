import json
from enum import Enum
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class UserRole(str, Enum):
    STUDENT = "student"
    PROFESSIONAL = "professional"
    ADMIN = "admin"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Auth-Security"
    debug: bool = True
    secret_key: str = "change-me-to-a-long-random-string-at-least-32-chars"

    database_url: str = "sqlite+aiosqlite:///./auth.db"
    redis_url: str = "redis://localhost:6379/0"

    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    cookie_secure: bool = False
    cookie_same_site: str = "strict"
    access_cookie_name: str = "access_token"
    refresh_cookie_name: str = "refresh_token"

    api_rate_limit: int = 100
    auth_rate_limit: int = 5
    rate_limit_window_seconds: int = 60

    max_login_attempts: int = 5
    lockout_duration_minutes: int = 15

    google_credentials_file: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"

    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""
    linkedin_redirect_uri: str = "http://localhost:8000/api/auth/linkedin/callback"

    oauth_success_redirect: str = "http://localhost:8000/"


def _load_google_credentials(settings: Settings) -> None:
    if not settings.google_credentials_file:
        return

    path = Path(settings.google_credentials_file)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    if not path.exists():
        return

    data = json.loads(path.read_text(encoding="utf-8"))
    web = data.get("web") or data.get("installed") or {}
    settings.google_client_id = web.get("client_id", settings.google_client_id)
    settings.google_client_secret = web.get("client_secret", settings.google_client_secret)


settings = Settings()
_load_google_credentials(settings)
