"""
/api/v1/notifications — list, mark read, mark all read.
"""
from fastapi import APIRouter

from app.deps import UserDB, UserID
from app.models.common import OkResponse
from app.models.notifications import NotificationOut, ReadNotificationsIn
from app.services import notifications as notif_svc

router = APIRouter(tags=["notifications"])


@router.get("/notifications", response_model=list[NotificationOut])
async def list_notifications(uid: UserID, db: UserDB, unread_only: bool = False) -> list[NotificationOut]:
    return await notif_svc.list_notifications(uid, db, unread_only=unread_only)


@router.post("/notifications/read", response_model=OkResponse)
async def mark_read(uid: UserID, db: UserDB, body: ReadNotificationsIn) -> OkResponse:
    await notif_svc.mark_read(uid, body.notification_ids, db)
    return OkResponse()


@router.post("/notifications/read_all", response_model=OkResponse)
async def mark_all_read(uid: UserID, db: UserDB) -> OkResponse:
    await notif_svc.mark_all_read(uid, db)
    return OkResponse()
