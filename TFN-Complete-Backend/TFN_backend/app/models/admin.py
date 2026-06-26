"""Admin + moderation models — matches schema.sql column names."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.db.types import ReportReason, ReportStatus


class ReportIn(BaseModel):
    reported_profile_id: UUID
    reason: ReportReason
    details: str | None = Field(None, max_length=1000)


class ReportOut(BaseModel):
    id: UUID
    reporter_id: UUID
    reported_profile_id: UUID
    reason: ReportReason
    details: str | None = None
    status: ReportStatus
    resolution_notes: str | None = None
    resolved_by: UUID | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReportUpdateIn(BaseModel):
    status: ReportStatus
    resolution_notes: str | None = Field(None, max_length=2000)


class SuspendProfileIn(BaseModel):
    reason: str = Field(..., max_length=500)


class BlockIn(BaseModel):
    blocked_id: UUID  # matches schema: blocked_id


class BlockOut(BaseModel):
    blocker_id: UUID
    blocked_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}
