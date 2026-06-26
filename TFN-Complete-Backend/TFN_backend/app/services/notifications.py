"""Notification service — insert rows and enqueue push (future)."""
from uuid import UUID

from supabase import Client

from app.db.client import get_admin_client


async def send_notification_to(profile_id: str, notif_type: str, payload: dict) -> None:  # type: ignore[type-arg]
    admin = get_admin_client()
    row = {
        "profile_id": profile_id,
        "type": notif_type,
        "payload": payload,
        "is_read": False,
    }
    admin.table("notifications").insert(row).execute()


async def list_notifications(profile_id: str, db: Client, *, unread_only: bool) -> list[dict]:  # type: ignore[type-arg]
    q = db.table("notifications").select("*").eq("profile_id", profile_id).order("created_at", desc=True)
    if unread_only:
        q = q.eq("is_read", False)
    result = q.limit(50).execute()
    return result.data  # type: ignore[return-value]


async def mark_read(profile_id: str, notification_ids: list[UUID], db: Client) -> None:
    ids = [str(nid) for nid in notification_ids]
    if ids:
        db.table("notifications").update({"is_read": True}).in_("id", ids).eq("profile_id", profile_id).execute()


async def mark_all_read(profile_id: str, db: Client) -> None:
    db.table("notifications").update({"is_read": True}).eq("profile_id", profile_id).eq("is_read", False).execute()
