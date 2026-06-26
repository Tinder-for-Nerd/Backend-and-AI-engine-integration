"""Profile, project, link, badge, interest models — matches schema.sql exactly."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.db.types import (
    IntentType,
    LinkKind,
    SeniorityLevel,
    UserRole,
    VerificationKind,
    VisibilityType,
)


class ProfileBase(BaseModel):
    display_name: str | None = Field(None, max_length=200)
    username: str | None = Field(None, max_length=60)
    headline: str | None = Field(None, max_length=120)
    bio: str | None = Field(None, max_length=800)
    avatar_url: str | None = None
    cover_url: str | None = None
    role: UserRole = UserRole.other
    seniority: SeniorityLevel = SeniorityLevel.unspecified
    institution_or_company: str | None = None
    location_city: str | None = None
    location_country: str | None = None
    visibility: VisibilityType = VisibilityType.public
    looking_for: list[IntentType] = Field(default_factory=list)


class ProfileUpdate(ProfileBase):
    pass


class ProfileOut(ProfileBase):
    id: UUID
    is_verified: bool = False
    is_active: bool = True
    last_active_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectIn(BaseModel):
    title: str = Field(..., max_length=120)
    description: str | None = Field(None, max_length=1000)
    url: str | None = None
    repo_url: str | None = None
    tags: list[str] = Field(default_factory=list)
    media_urls: list[str] = Field(default_factory=list)
    is_seeking_collab: bool = False


class ProjectOut(ProjectIn):
    id: UUID
    profile_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProfileLinkIn(BaseModel):
    kind: LinkKind
    url: str
    display_label: str | None = None


class ProfileLinkOut(ProfileLinkIn):
    id: UUID
    profile_id: UUID
    is_verified: bool = False
    verification_metadata: dict | None = None  # type: ignore[type-arg]
    created_at: datetime

    model_config = {"from_attributes": True}


class BadgeOut(BaseModel):
    profile_id: UUID
    kind: VerificationKind
    verified_at: datetime
    metadata: dict | None = None  # type: ignore[type-arg]

    model_config = {"from_attributes": True}


class InterestOut(BaseModel):
    id: UUID
    slug: str
    name: str
    category: str
    synonyms: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AvatarUploadResponse(BaseModel):
    avatar_url: str
