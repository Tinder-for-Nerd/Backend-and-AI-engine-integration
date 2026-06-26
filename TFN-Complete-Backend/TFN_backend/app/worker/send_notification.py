"""Worker job: send push notification (stub — extend with FCM/APNS)."""
import structlog

log = structlog.get_logger()


async def send_notification(ctx: dict, payload: dict) -> None:  # type: ignore[type-arg]
    profile_id = payload.get("profile_id")
    notif_type = payload.get("type")
    log.info("send_notification", profile_id=profile_id, type=notif_type)
    # Future: FCM/APNS push here
