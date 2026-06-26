"""Match models — column names match schema.sql (user_a_id, user_b_id)."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.db.types import IntentType, MatchStatus


class MatchOut(BaseModel):
    id: UUID
    user_a_id: UUID
    user_b_id: UUID
    status: MatchStatus
    shared_intents: list[IntentType]
    last_message_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class MatchStatusUpdate(BaseModel):
    status: MatchStatus  # only closed_by_a or closed_by_b from client
