"""AI endpoint request/response models."""
from uuid import UUID

from pydantic import BaseModel, Field


class StarterResponse(BaseModel):
    match_id: UUID
    starter: str
    tags: list[str] = Field(default_factory=list)
    cached: bool = False


class BioRewriteRequest(BaseModel):
    current_bio: str = Field(..., max_length=2000)
    tone: str | None = Field(None, max_length=40)  # e.g. "professional", "casual"


class BioRewriteResponse(BaseModel):
    rewritten_bio: str


class InterestSuggestRequest(BaseModel):
    bio: str = Field(..., max_length=2000)


class InterestSuggestResponse(BaseModel):
    suggested_interests: list[str]
