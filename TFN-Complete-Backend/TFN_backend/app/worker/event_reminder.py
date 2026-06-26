"""Worker job: send event reminders to RSVPd attendees."""
import structlog

from app.db.client import get_admin_client
from app.services.notifications import send_notification_to

log = structlog.get_logger()


async def event_reminder(ctx: dict, payload: dict) -> None:  # type: ignore[type-arg]
    event_id = payload.get("event_id")
    if not event_id:
        return
    admin = get_admin_client()
    attendees = admin.table("event_attendees").select("profile_id").eq("event_id", event_id).execute()
    for row in attendees.data:
        await send_notification_to(row["profile_id"], "event_reminder", {"event_id": event_id})
    log.info("event_reminder.sent", event_id=event_id, count=len(attendees.data))
