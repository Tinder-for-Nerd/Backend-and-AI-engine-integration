"""Worker job: send booking reminders at 1h and 15min before starts_at."""
from datetime import datetime, timezone, timedelta

import structlog

from app.db.client import get_admin_client
from app.services.notifications import send_notification_to

log = structlog.get_logger()


async def booking_reminder(ctx: dict, payload: dict) -> None:  # type: ignore[type-arg]
    booking_id = payload.get("booking_id")
    if not booking_id:
        return
    admin = get_admin_client()
    result = admin.table("bookings").select("*").eq("id", booking_id).execute()
    if not result.data:
        return
    b = result.data[0]
    if b["status"] != "confirmed":
        return

    starts_at = datetime.fromisoformat(b["starts_at"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    delta = starts_at - now

    if timedelta(minutes=10) <= delta <= timedelta(hours=1, minutes=5):
        for pid in (b["host_id"], b["guest_id"]):   # schema col names: host_id / guest_id
            await send_notification_to(pid, "booking_reminder", {
                "booking_id": booking_id,
                "starts_at": b["starts_at"],
                "minutes_until": int(delta.total_seconds() / 60),
            })
        log.info("booking_reminder.sent", booking_id=booking_id)
