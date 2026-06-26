"""
/api/v1/matches/{id}/messages — send, edit, delete, read receipts, AI starter.
"""
from uuid import UUID

from fastapi import APIRouter

from app.deps import UserDB, UserID
from app.models.common import OkResponse
from app.models.messages import MessageEdit, MessageIn, MessageOut, ReadReceiptIn
from app.services import messages as msg_svc

router = APIRouter(tags=["messages"])


@router.get("/matches/{match_id}/messages", response_model=list[MessageOut])
async def list_messages(
    match_id: UUID,
    uid: UserID,
    db: UserDB,
    before: str | None = None,
    limit: int = 50,
) -> list[MessageOut]:
    return await msg_svc.list_messages(match_id, uid, db, before=before, limit=limit)


@router.post("/matches/{match_id}/messages", response_model=MessageOut, status_code=201)
async def send_message(match_id: UUID, uid: UserID, db: UserDB, body: MessageIn) -> MessageOut:
    return await msg_svc.send_message(match_id, uid, body, db)


@router.patch("/messages/{message_id}", response_model=MessageOut)
async def edit_message(message_id: UUID, uid: UserID, db: UserDB, body: MessageEdit) -> MessageOut:
    return await msg_svc.edit_message(message_id, uid, body, db)


@router.delete("/messages/{message_id}", response_model=OkResponse)
async def delete_message(message_id: UUID, uid: UserID, db: UserDB) -> OkResponse:
    await msg_svc.delete_message(message_id, uid, db)
    return OkResponse()


@router.post("/matches/{match_id}/read", response_model=OkResponse)
async def mark_read(match_id: UUID, uid: UserID, db: UserDB, body: ReadReceiptIn) -> OkResponse:
    await msg_svc.mark_read(match_id, uid, body, db)
    return OkResponse()
