"""
/api/v1/events — CRUD, RSVP, attendees.
"""
from uuid import UUID

from fastapi import APIRouter, Query

from app.deps import UserDB, UserID
from app.models.common import OkResponse
from app.models.events import AttendeeOut, EventIn, EventOut, EventUpdate
from app.services import events as event_svc

router = APIRouter(tags=["events"])


@router.get("/events", response_model=list[EventOut])
async def list_events(
    uid: UserID,
    db: UserDB,
    cursor: str | None = Query(None),
    limit: int = Query(20, le=50),
) -> list[EventOut]:
    return await event_svc.list_events(db, cursor=cursor, limit=limit)


@router.get("/events/{event_id}", response_model=EventOut)
async def get_event(event_id: UUID, uid: UserID, db: UserDB) -> EventOut:
    return await event_svc.get_event(event_id, db)


@router.post("/events", response_model=EventOut, status_code=201)
async def create_event(uid: UserID, db: UserDB, body: EventIn) -> EventOut:
    return await event_svc.create_event(uid, body, db)


@router.patch("/events/{event_id}", response_model=EventOut)
async def update_event(event_id: UUID, uid: UserID, db: UserDB, body: EventUpdate) -> EventOut:
    return await event_svc.update_event(event_id, uid, body, db)


@router.delete("/events/{event_id}", response_model=OkResponse)
async def cancel_event(event_id: UUID, uid: UserID, db: UserDB) -> OkResponse:
    await event_svc.cancel_event(event_id, uid, db)
    return OkResponse()


@router.post("/events/{event_id}/rsvp", response_model=AttendeeOut, status_code=201)
async def rsvp(event_id: UUID, uid: UserID, db: UserDB) -> AttendeeOut:
    return await event_svc.rsvp(event_id, uid, db)


@router.delete("/events/{event_id}/rsvp", response_model=OkResponse)
async def cancel_rsvp(event_id: UUID, uid: UserID, db: UserDB) -> OkResponse:
    await event_svc.cancel_rsvp(event_id, uid, db)
    return OkResponse()


@router.get("/events/{event_id}/attendees", response_model=list[AttendeeOut])
async def list_attendees(event_id: UUID, uid: UserID, db: UserDB) -> list[AttendeeOut]:
    return await event_svc.list_attendees(event_id, uid, db)
