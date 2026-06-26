"""Event + attendee models — matches schema.sql exactly."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.db.types import (
    EventApprovalStatus,
    EventAttendeeStatus,
    EventHostType,
    EventKind,
    EventMode,
)


class EventIn(BaseModel):
    title: str = Field(..., min_length=3, max_length=160)
    description: str | None = None
    host_type: EventHostType = EventHostType.user
    kind: EventKind = EventKind.meetup
    mode: EventMode = EventMode.offline
    venue_name: str | None = None
    venue_address: str | None = None
    city: str | None = None
    meeting_url: str | None = None
    starts_at: datetime
    ends_at: datetime
    capacity: int | None = None
    cover_url: str | None = None
    tags: list[str] = Field(default_factory=list)
    is_paid: bool = False
    price_cents: int | None = None
    currency: str = "INR"


class EventUpdate(EventIn):
    pass


class EventOut(EventIn):
    id: UUID
    host_profile_id: UUID | None = None
    approval_status: EventApprovalStatus = EventApprovalStatus.draft
    attendee_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EventReviewIn(BaseModel):
    approve: bool
    review_notes: str | None = None


class AttendeeOut(BaseModel):
    event_id: UUID
    profile_id: UUID
    status: EventAttendeeStatus
    created_at: datetime

    model_config = {"from_attributes": True}
