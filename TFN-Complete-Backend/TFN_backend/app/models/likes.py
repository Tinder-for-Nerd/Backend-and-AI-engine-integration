"""Like / pass models — column names match schema.sql (liker_id, likee_id)."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.db.types import IntentType
from app.models.matches import MatchOut


class LikeIn(BaseModel):
    likee_id: UUID  # target profile
    intents: list[IntentType] = Field(..., min_length=1)
    note: str | None = Field(None, max_length=280)


class LikeOut(BaseModel):
    id: UUID
    liker_id: UUID
    likee_id: UUID
    intents: list[IntentType]
    note: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class LikeResponse(BaseModel):
    like: LikeOut
    match: MatchOut | None = None


class PassIn(BaseModel):
    likee_id: UUID  # profile being passed


class PassOut(BaseModel):
    liker_id: UUID
    likee_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}
