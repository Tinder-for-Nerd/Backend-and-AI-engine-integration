"""
/api/v1/moderation — reports and blocks.
"""
from fastapi import APIRouter

from app.deps import UserDB, UserID
from app.models.admin import BlockIn, BlockOut, ReportIn, ReportOut
from app.models.common import OkResponse
from app.services import moderation as mod_svc

router = APIRouter(tags=["moderation"])


@router.post("/reports", response_model=ReportOut, status_code=201)
async def file_report(uid: UserID, db: UserDB, body: ReportIn) -> ReportOut:
    return await mod_svc.file_report(uid, body, db)


@router.post("/blocks", response_model=BlockOut, status_code=201)
async def block_user(uid: UserID, db: UserDB, body: BlockIn) -> BlockOut:
    return await mod_svc.block_user(uid, body, db)


@router.get("/blocks", response_model=list[BlockOut])
async def list_blocks(uid: UserID, db: UserDB) -> list[BlockOut]:
    return await mod_svc.list_blocks(uid, db)


@router.delete("/blocks/{blocked_profile_id}", response_model=OkResponse)
async def unblock_user(blocked_profile_id: str, uid: UserID, db: UserDB) -> OkResponse:
    await mod_svc.unblock_user(uid, blocked_profile_id, db)
    return OkResponse()
