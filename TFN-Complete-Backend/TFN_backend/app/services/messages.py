"""Message service — uses sender_id, kind, edited_at per schema.sql."""
from datetime import datetime, timezone, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from supabase import Client

from app.models.messages import MessageEdit, MessageIn, MessageOut, ReadReceiptIn

_EDIT_WINDOW = timedelta(minutes=15)


async def _assert_participant(match_id: str, profile_id: str, db: Client) -> None:
    result = db.table("matches").select("user_a_id,user_b_id,status").eq("id", match_id).execute()
    if not result.data:
        raise HTTPException(404, detail={"code": "match_not_found", "message": "Match not found"})
    m = result.data[0]
    if profile_id not in (m["user_a_id"], m["user_b_id"]):
        raise HTTPException(403, detail={"code": "not_participant", "message": "Not in this match"})
    if m["status"] in ("closed_by_a", "closed_by_b", "archived"):
        raise HTTPException(403, detail={"code": "match_closed", "message": "Match is closed"})


async def list_messages(
    match_id: UUID, profile_id: str, db: Client, *, before: str | None, limit: int
) -> list[MessageOut]:
    await _assert_participant(str(match_id), profile_id, db)
    q = (
        db.table("messages")
        .select("*")
        .eq("match_id", str(match_id))
        .eq("is_deleted", False)
        .order("created_at", desc=True)
        .limit(min(limit, 100))
    )
    if before:
        q = q.lt("created_at", before)
    result = q.execute()
    return [MessageOut(**r) for r in result.data]


async def send_message(match_id: UUID, sender_id: str, body: MessageIn, db: Client) -> MessageOut:
    await _assert_participant(str(match_id), sender_id, db)
    row = {
        "match_id": str(match_id),
        "sender_id": sender_id,
        "content": body.content,
        "kind": body.kind.value,
        "attachments": body.attachments,
    }
    result = db.table("messages").insert(row).execute()
    return MessageOut(**result.data[0])


async def edit_message(message_id: UUID, editor_id: str, body: MessageEdit, db: Client) -> MessageOut:
    result = db.table("messages").select("*").eq("id", str(message_id)).execute()
    if not result.data:
        raise HTTPException(404, detail={"code": "message_not_found", "message": "Message not found"})
    msg = result.data[0]
    if msg["sender_id"] != editor_id:
        raise HTTPException(403, detail={"code": "not_sender", "message": "Only sender can edit"})
    created = datetime.fromisoformat(msg["created_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) - created > _EDIT_WINDOW:
        raise HTTPException(
            409,
            detail={"code": "edit_window_expired", "message": "15-minute edit window has passed"},
        )
    now_iso = datetime.now(timezone.utc).isoformat()
    result2 = (
        db.table("messages")
        .update({"content": body.content, "edited_at": now_iso})
        .eq("id", str(message_id))
        .execute()
    )
    return MessageOut(**result2.data[0])


async def delete_message(message_id: UUID, deleter_id: str, db: Client) -> None:
    result = db.table("messages").select("sender_id").eq("id", str(message_id)).execute()
    if not result.data:
        raise HTTPException(404, detail={"code": "message_not_found", "message": "Message not found"})
    if result.data[0]["sender_id"] != deleter_id:
        raise HTTPException(403, detail={"code": "not_sender", "message": "Only sender can delete"})
    db.table("messages").update({"is_deleted": True, "content": None}).eq("id", str(message_id)).execute()


async def mark_read(match_id: UUID, profile_id: str, body: ReadReceiptIn, db: Client) -> None:
    await _assert_participant(str(match_id), profile_id, db)
    ids = [str(mid) for mid in body.message_ids]
    if ids:
        db.table("messages").update({"is_read": True}).in_("id", ids).neq("sender_id", profile_id).execute()
