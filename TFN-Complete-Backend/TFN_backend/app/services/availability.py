"""Availability service — matches schema.sql (starts_at/ends_at/is_recurring/rrule)."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from dateutil.rrule import rrulestr
from fastapi import HTTPException
from supabase import Client

from app.models.bookings import AvailabilitySlotIn, AvailabilitySlotOut


async def list_slots(profile_id: str, db: Client) -> list[AvailabilitySlotOut]:
    result = db.table("availability_slots").select("*").eq("profile_id", profile_id).execute()
    return [AvailabilitySlotOut(**r) for r in result.data]


async def create_slot(profile_id: str, body: AvailabilitySlotIn, db: Client) -> AvailabilitySlotOut:
    row = {
        **body.model_dump(),
        "profile_id": profile_id,
        "starts_at": body.starts_at.isoformat(),
        "ends_at": body.ends_at.isoformat(),
    }
    result = db.table("availability_slots").insert(row).execute()
    return AvailabilitySlotOut(**result.data[0])


async def update_slot(profile_id: str, slot_id: UUID, body: AvailabilitySlotIn, db: Client) -> AvailabilitySlotOut:
    row = {
        **body.model_dump(),
        "starts_at": body.starts_at.isoformat(),
        "ends_at": body.ends_at.isoformat(),
    }
    result = (
        db.table("availability_slots")
        .update(row)
        .eq("id", str(slot_id))
        .eq("profile_id", profile_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, detail={"code": "slot_not_found", "message": "Slot not found"})
    return AvailabilitySlotOut(**result.data[0])


async def delete_slot(profile_id: str, slot_id: UUID, db: Client) -> None:
    db.table("availability_slots").delete().eq("id", str(slot_id)).eq("profile_id", profile_id).execute()


async def expand_slots(profile_id: UUID, db: Client) -> list[dict]:  # type: ignore[type-arg]
    """Return concrete start/end windows for the next 14 days."""
    result = (
        db.table("availability_slots")
        .select("*")
        .eq("profile_id", str(profile_id))
        .eq("is_available", True)
        .execute()
    )
    windows: list[dict] = []  # type: ignore[type-arg]
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=14)

    for slot in result.data:
        starts_at = datetime.fromisoformat(slot["starts_at"].replace("Z", "+00:00"))
        ends_at = datetime.fromisoformat(slot["ends_at"].replace("Z", "+00:00"))

        if slot.get("is_recurring") and slot.get("rrule"):
            try:
                rule = rrulestr(slot["rrule"], dtstart=starts_at)
                duration = ends_at - starts_at
                for occ in rule.between(now, horizon, inc=True):
                    windows.append({
                        "starts_at": occ.isoformat(),
                        "ends_at": (occ + duration).isoformat(),
                    })
            except Exception:
                pass
        elif now <= starts_at <= horizon:
            windows.append({
                "starts_at": slot["starts_at"],
                "ends_at": slot["ends_at"],
            })

    windows.sort(key=lambda w: w["starts_at"])
    return windows
