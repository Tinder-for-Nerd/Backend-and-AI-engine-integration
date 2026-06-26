"""Notification models — matches schema.sql (kind field, not type)."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.db.types import NotificationKind


class NotificationOut(BaseModel):
    id: UUID
    profile_id: UUID
    kind: NotificationKind
    payload: dict  # type: ignore[type-arg]
    is_read: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class ReadNotificationsIn(BaseModel):
    notification_ids: list[UUID]
