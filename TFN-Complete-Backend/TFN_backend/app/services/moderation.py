"""Moderation service — uses blocker_id/blocked_id, reporter_id per schema.sql."""
from fastapi import HTTPException
from supabase import Client

from app.models.admin import BlockIn, BlockOut, ReportIn, ReportOut
from app.db.types import ReportStatus


async def file_report(reporter_id: str, body: ReportIn, db: Client) -> ReportOut:
    row = {
        "reporter_id": reporter_id,
        "reported_profile_id": str(body.reported_profile_id),
        "reason": body.reason.value,
        "details": body.details,
        "status": ReportStatus.open.value,
    }
    result = db.table("reports").insert(row).execute()
    return ReportOut(**result.data[0])


async def block_user(blocker_id: str, body: BlockIn, db: Client) -> BlockOut:
    blocked_id = str(body.blocked_id)
    if blocker_id == blocked_id:
        raise HTTPException(400, detail={"code": "self_block", "message": "Cannot block yourself"})
    row = {"blocker_id": blocker_id, "blocked_id": blocked_id}
    try:
        result = db.table("blocks").insert(row).execute()
    except Exception:
        raise HTTPException(409, detail={"code": "already_blocked", "message": "Already blocked"})
    return BlockOut(**result.data[0])


async def list_blocks(profile_id: str, db: Client) -> list[BlockOut]:
    result = db.table("blocks").select("*").eq("blocker_id", profile_id).execute()
    return [BlockOut(**r) for r in result.data]


async def unblock_user(blocker_id: str, blocked_id: str, db: Client) -> None:
    db.table("blocks").delete().eq("blocker_id", blocker_id).eq("blocked_id", blocked_id).execute()
