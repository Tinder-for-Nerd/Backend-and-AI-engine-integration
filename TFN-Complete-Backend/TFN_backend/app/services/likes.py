"""Like and pass service — uses liker_id/likee_id per schema.sql."""
from fastapi import HTTPException, status
from supabase import Client

from app.db.client import get_admin_client
from app.models.likes import LikeIn, LikeOut, LikeResponse, PassIn
from app.models.matches import MatchOut


async def send_like(liker_id: str, body: LikeIn, db: Client) -> LikeResponse:
    likee_id = str(body.likee_id)

    if liker_id == likee_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "self_like", "message": "Cannot like yourself"},
        )

    # Guard: already liked (DB unique constraint also enforces this)
    existing = db.table("likes").select("id").eq("liker_id", liker_id).eq("likee_id", likee_id).execute()
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "already_liked", "message": "You already liked this user"},
        )

    row = {
        "liker_id": liker_id,
        "likee_id": likee_id,
        "intents": [i.value for i in body.intents],
        "note": body.note,
    }
    result = db.table("likes").insert(row).execute()
    like_out = LikeOut(**result.data[0])

    # Check if trigger created a match
    admin = get_admin_client()
    match_result = admin.table("matches").select("*").or_(
        f"and(user_a_id.eq.{liker_id},user_b_id.eq.{likee_id}),"
        f"and(user_a_id.eq.{likee_id},user_b_id.eq.{liker_id})"
    ).order("created_at", desc=True).limit(1).execute()

    match_out: MatchOut | None = None
    if match_result.data:
        match_out = MatchOut(**match_result.data[0])

    return LikeResponse(like=like_out, match=match_out)


async def send_pass(passer_id: str, body: PassIn, db: Client) -> None:
    likee_id = str(body.likee_id)
    row = {"liker_id": passer_id, "likee_id": likee_id}
    db.table("passes").upsert(row, on_conflict="liker_id,likee_id").execute()


async def get_received_likes(profile_id: str, db: Client) -> list[dict]:  # type: ignore[type-arg]
    result = (
        db.table("likes")
        .select("*, liker:profiles!liker_id(id,display_name,username,avatar_url,headline)")
        .eq("likee_id", profile_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data  # type: ignore[return-value]
