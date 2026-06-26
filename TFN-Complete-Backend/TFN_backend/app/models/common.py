"""Shared Pydantic primitives."""
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class OkResponse(BaseModel):
    ok: bool = True


class CursorPage(BaseModel):
    items: list[Any]
    next_cursor: str | None = None
    has_more: bool = False


class ErrorDetail(BaseModel):
    code: str
    message: str


def utcnow() -> datetime:
    from datetime import timezone
    return datetime.now(timezone.utc)
