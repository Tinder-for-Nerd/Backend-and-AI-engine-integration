"""
/api/v1/profiles — public profile view, projects, links, interests.
"""
from uuid import UUID

from fastapi import APIRouter

from app.deps import UserDB, UserID
from app.models.common import OkResponse
from app.models.profiles import (
    BadgeOut,
    InterestOut,
    ProfileLinkIn,
    ProfileLinkOut,
    ProfileOut,
    ProjectIn,
    ProjectOut,
)
from app.services import profiles as profile_svc

router = APIRouter(tags=["profiles"])


@router.get("/profiles/{username}", response_model=ProfileOut)
async def get_profile(username: str, uid: UserID, db: UserDB) -> ProfileOut:
    return await profile_svc.get_profile_by_username(username, db)


# ── Projects ────────────────────────────────────────────────

@router.get("/profiles/{profile_id}/projects", response_model=list[ProjectOut])
async def list_projects(profile_id: UUID, uid: UserID, db: UserDB) -> list[ProjectOut]:
    return await profile_svc.list_projects(profile_id, db)


@router.post("/me/projects", response_model=ProjectOut, status_code=201)
async def create_project(uid: UserID, db: UserDB, body: ProjectIn) -> ProjectOut:
    return await profile_svc.create_project(uid, body, db)


@router.patch("/me/projects/{project_id}", response_model=ProjectOut)
async def update_project(project_id: UUID, uid: UserID, db: UserDB, body: ProjectIn) -> ProjectOut:
    return await profile_svc.update_project(uid, project_id, body, db)


@router.delete("/me/projects/{project_id}", response_model=OkResponse)
async def delete_project(project_id: UUID, uid: UserID, db: UserDB) -> OkResponse:
    await profile_svc.delete_project(uid, project_id, db)
    return OkResponse()


# ── Links ────────────────────────────────────────────────────

@router.get("/profiles/{profile_id}/links", response_model=list[ProfileLinkOut])
async def list_links(profile_id: UUID, uid: UserID, db: UserDB) -> list[ProfileLinkOut]:
    return await profile_svc.list_links(profile_id, db)


@router.post("/me/links", response_model=ProfileLinkOut, status_code=201)
async def add_link(uid: UserID, db: UserDB, body: ProfileLinkIn) -> ProfileLinkOut:
    return await profile_svc.add_link(uid, body, db)


@router.delete("/me/links/{link_id}", response_model=OkResponse)
async def delete_link(link_id: UUID, uid: UserID, db: UserDB) -> OkResponse:
    await profile_svc.delete_link(uid, link_id, db)
    return OkResponse()


# ── Interests ────────────────────────────────────────────────

@router.get("/interests", response_model=list[InterestOut])
async def list_all_interests(db: UserDB) -> list[InterestOut]:
    return await profile_svc.list_interests(db)


@router.put("/me/interests", response_model=OkResponse)
async def set_my_interests(uid: UserID, db: UserDB, interest_ids: list[UUID]) -> OkResponse:
    await profile_svc.set_interests(uid, interest_ids, db)
    return OkResponse()


# ── Badges ────────────────────────────────────────────────────

@router.get("/profiles/{profile_id}/badges", response_model=list[BadgeOut])
async def list_badges(profile_id: UUID, uid: UserID, db: UserDB) -> list[BadgeOut]:
    return await profile_svc.list_badges(profile_id, db)
