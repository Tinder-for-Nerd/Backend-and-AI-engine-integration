"""Discovery feed + feedback models."""
from uuid import UUID

from pydantic import BaseModel, Field

from app.db.types import FeedbackEventType, IntentType
from app.models.profiles import ProfileOut


class DiscoveryFilters(BaseModel):
    looking_for: list[IntentType] = Field(default_factory=list)
    city: str | None = None


class FeedItem(BaseModel):
    profile: ProfileOut
    score: float
    shared_interests: list[str] = Field(default_factory=list)


class DiscoveryFeed(BaseModel):
    items: list[FeedItem]
    next_cursor: str | None = None
    has_more: bool = False


class FeedbackIn(BaseModel):
    target_profile_id: UUID | None = None
    target_match_id: UUID | None = None
    event_type: FeedbackEventType
    value: dict = Field(default_factory=dict)  # type: ignore[type-arg]
