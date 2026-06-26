"""
/api/v1/matches — list, detail, close.
"""
from uuid import UUID

from fastapi import APIRouter

from app.deps import UserDB, UserID
from app.models.matches import MatchOut, MatchStatusUpdate
from app.services import matches as match_svc

router = APIRouter(tags=["matches"])


@router.get("/matches", response_model=list[MatchOut])
async def list_matches(uid: UserID, db: UserDB) -> list[MatchOut]:
    return await match_svc.list_matches(uid, db)


@router.get("/matches/{match_id}", response_model=MatchOut)
async def get_match(match_id: UUID, uid: UserID, db: UserDB) -> MatchOut:
    return await match_svc.get_match(match_id, uid, db)


@router.patch("/matches/{match_id}", response_model=MatchOut)
async def update_match_status(
    match_id: UUID, uid: UserID, db: UserDB, body: MatchStatusUpdate
) -> MatchOut:
    return await match_svc.update_status(match_id, uid, body, db)
