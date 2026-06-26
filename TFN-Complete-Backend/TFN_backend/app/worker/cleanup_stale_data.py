"""Worker job: periodic cleanup of stale/orphaned data."""
from datetime import datetime, timedelta, timezone

import structlog

from app.db.client import get_admin_client

log = structlog.get_logger()


async def cleanup_stale_data(ctx: dict, payload: dict) -> None:  # type: ignore[type-arg]
    """
    Idempotent cleanup tasks:
    - Delete notifications older than 90 days
    - Delete feedback older than 180 days
    """
    admin = get_admin_client()
    now = datetime.now(timezone.utc)

    cutoff_90 = (now - timedelta(days=90)).isoformat()
    result = admin.table("notifications").delete().lt("created_at", cutoff_90).execute()
    log.info("cleanup.notifications", deleted=len(result.data))

    cutoff_180 = (now - timedelta(days=180)).isoformat()
    result2 = admin.table("feedback").delete().lt("created_at", cutoff_180).execute()
    log.info("cleanup.feedback", deleted=len(result2.data))
