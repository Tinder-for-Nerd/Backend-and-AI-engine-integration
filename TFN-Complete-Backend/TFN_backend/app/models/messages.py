"""Message models — column names match schema.sql (sender_id, kind)."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.db.types import MessageKind


class MessageIn(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)
    kind: MessageKind = MessageKind.text
    attachments: list[dict] = Field(default_factory=list)  # type: ignore[type-arg]


class MessageEdit(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class MessageOut(BaseModel):
    id: UUID
    match_id: UUID
    sender_id: UUID
    kind: MessageKind
    content: str | None = None
    attachments: list[dict] = Field(default_factory=list)  # type: ignore[type-arg]
    is_read: bool = False
    is_deleted: bool = False
    edited_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReadReceiptIn(BaseModel):
    message_ids: list[UUID]
