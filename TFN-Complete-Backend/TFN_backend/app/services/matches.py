"""Match service — uses user_a_id/user_b_id per schema.sql."""
from uuid import UUID

from fastapi import HTTPException, status
from supabase import Client

from app.db.types import MatchStatus
from app.models.matches import MatchOut, MatchStatusUpdate


async def list_matches(profile_id: str, db: Client) -> list[MatchOut]:
    result = (
        db.table("matches")
        .select("*")
        .or_(f"user_a_id.eq.{profile_id},user_b_id.eq.{profile_id}")
        .neq("status", MatchStatus.archived)
        .order("last_message_at", desc=True, nullsfirst=False)
        .execute()
    )
    return [MatchOut(**r) for r in result.data]


async def get_match(match_id: UUID, profile_id: str, db: Client) -> MatchOut:
    result = db.table("matches").select("*").eq("id", str(match_id)).execute()
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "match_not_found", "message": "Match not found"},
        )
    match = MatchOut(**result.data[0])
    if str(match.user_a_id) != profile_id and str(match.user_b_id) != profile_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "not_participant", "message": "Not a participant in this match"},
        )
    return match


async def update_status(match_id: UUID, profile_id: str, body: MatchStatusUpdate, db: Client) -> MatchOut:
    match = await get_match(match_id, profile_id, db)

    allowed = {MatchStatus.closed_by_a, MatchStatus.closed_by_b}
    if body.status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_status", "message": "Only closed_by_a or closed_by_b allowed"},
        )

    if body.status == MatchStatus.closed_by_a and str(match.user_a_id) != profile_id:
        raise HTTPException(403, detail={"code": "wrong_side", "message": "Use closed_by_b for your side"})
    if body.status == MatchStatus.closed_by_b and str(match.user_b_id) != profile_id:
        raise HTTPException(403, detail={"code": "wrong_side", "message": "Use closed_by_a for your side"})

    result = db.table("matches").update({"status": body.status.value}).eq("id", str(match_id)).execute()
    return MatchOut(**result.data[0])
