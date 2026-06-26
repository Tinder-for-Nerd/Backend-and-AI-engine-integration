"""Event service — uses approval_status, host_type per schema.sql."""
from uuid import UUID

from fastapi import HTTPException
from supabase import Client

from app.db.types import EventApprovalStatus, EventAttendeeStatus
from app.models.events import AttendeeOut, EventIn, EventOut, EventReviewIn, EventUpdate


async def list_events(db: Client, *, cursor: str | None, limit: int) -> list[EventOut]:
    q = (
        db.table("events")
        .select("*")
        .eq("approval_status", EventApprovalStatus.approved)
        .order("starts_at")
        .limit(limit)
    )
    if cursor:
        q = q.gt("starts_at", cursor)
    result = q.execute()
    return [EventOut(**r) for r in result.data]


async def get_event(event_id: UUID, db: Client) -> EventOut:
    result = db.table("events").select("*").eq("id", str(event_id)).execute()
    if not result.data:
        raise HTTPException(404, detail={"code": "event_not_found", "message": "Event not found"})
    return EventOut(**result.data[0])


async def create_event(host_id: str, body: EventIn, db: Client) -> EventOut:
    row = {
        **body.model_dump(exclude={"starts_at", "ends_at"}),
        "host_profile_id": host_id,
        "approval_status": EventApprovalStatus.pending_review.value,
        "starts_at": body.starts_at.isoformat(),
        "ends_at": body.ends_at.isoformat(),
    }
    result = db.table("events").insert(row).execute()
    return EventOut(**result.data[0])


async def update_event(event_id: UUID, host_id: str, body: EventUpdate, db: Client) -> EventOut:
    result = db.table("events").select("host_profile_id,approval_status").eq("id", str(event_id)).execute()
    if not result.data:
        raise HTTPException(404, detail={"code": "event_not_found", "message": "Event not found"})
    ev = result.data[0]
    if ev["host_profile_id"] != host_id:
        raise HTTPException(403, detail={"code": "not_host", "message": "Only host can edit"})
    if ev["approval_status"] == EventApprovalStatus.rejected:
        raise HTTPException(409, detail={"code": "event_rejected", "message": "Cannot edit a rejected event"})
    update = {
        **body.model_dump(exclude={"starts_at", "ends_at"}),
        "starts_at": body.starts_at.isoformat(),
        "ends_at": body.ends_at.isoformat(),
    }
    res = db.table("events").update(update).eq("id", str(event_id)).execute()
    return EventOut(**res.data[0])


async def cancel_event(event_id: UUID, host_id: str, db: Client) -> None:
    result = db.table("events").select("host_profile_id").eq("id", str(event_id)).execute()
    if not result.data:
        raise HTTPException(404, detail={"code": "event_not_found", "message": "Event not found"})
    if result.data[0]["host_profile_id"] != host_id:
        raise HTTPException(403, detail={"code": "not_host", "message": "Only host can cancel"})
    db.table("events").update({"approval_status": EventApprovalStatus.rejected.value}).eq("id", str(event_id)).execute()


async def rsvp(event_id: UUID, profile_id: str, db: Client) -> AttendeeOut:
    ev_res = db.table("events").select("approval_status,capacity,attendee_count").eq("id", str(event_id)).execute()
    if not ev_res.data:
        raise HTTPException(404, detail={"code": "event_not_found", "message": "Event not found"})
    ev = ev_res.data[0]
    if ev["approval_status"] != EventApprovalStatus.approved:
        raise HTTPException(409, detail={"code": "event_not_approved", "message": "Cannot RSVP to unapproved event"})
    if ev["capacity"] and ev["attendee_count"] >= ev["capacity"]:
        raise HTTPException(409, detail={"code": "event_full", "message": "Event is at capacity"})
    row = {
        "event_id": str(event_id),
        "profile_id": profile_id,
        "status": EventAttendeeStatus.rsvp_going.value,
    }
    try:
        result = db.table("event_attendees").insert(row).execute()
    except Exception:
        raise HTTPException(409, detail={"code": "already_rsvped", "message": "Already RSVP'd"})
    return AttendeeOut(**result.data[0])


async def cancel_rsvp(event_id: UUID, profile_id: str, db: Client) -> None:
    db.table("event_attendees").delete().eq("event_id", str(event_id)).eq("profile_id", profile_id).execute()


async def list_attendees(event_id: UUID, profile_id: str, db: Client) -> list[AttendeeOut]:
    ev_res = db.table("events").select("host_profile_id").eq("id", str(event_id)).execute()
    if not ev_res.data:
        raise HTTPException(404, detail={"code": "event_not_found", "message": "Event not found"})
    host_id = ev_res.data[0]["host_profile_id"]
    if host_id != profile_id:
        rsvp_res = (
            db.table("event_attendees")
            .select("event_id")
            .eq("event_id", str(event_id))
            .eq("profile_id", profile_id)
            .execute()
        )
        if not rsvp_res.data:
            raise HTTPException(403, detail={"code": "not_rsvped", "message": "RSVP to see attendees"})
    result = db.table("event_attendees").select("*").eq("event_id", str(event_id)).execute()
    return [AttendeeOut(**r) for r in result.data]
