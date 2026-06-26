"""Pydantic models for auth-layer payloads."""
from pydantic import BaseModel


class TokenClaims(BaseModel):
    sub: str
    email: str | None = None
    role: str = "authenticated"
    app_metadata: dict = {}  # type: ignore[type-arg]
    user_metadata: dict = {}  # type: ignore[type-arg]
