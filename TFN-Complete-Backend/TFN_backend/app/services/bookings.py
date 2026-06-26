"""Booking service — uses host_id/guest_id per schema.sql."""
import hashlib
import hmac
from uuid import UUID

from fastapi import HTTPException, status
from supabase import Client

from app.config import settings
from app.db.client import get_admin_client
from app.db.types import BookingStatus
from app.models.bookings import BookingIn, BookingOut, BookingStatusUpdate
from app.services.notifications import send_notification_to

# Valid transitions: (current_status, actor_role) → allowed next statuses
_TRANSITIONS: dict[tuple[str, str], set[str]] = {
    ("pending", "host"): {"confirmed", "cancelled_by_host"},
    ("pending", "guest"): {"cancelled_by_guest"},
    ("confirmed", "host"): {"cancelled_by_host", "completed", "no_show"},
    ("confirmed", "guest"): {"cancelled_by_guest"},
}


def _gen_meet_url(booking_id: str) -> str:
    if settings.jitsi_app_secret:
        sig = hmac.new(settings.jitsi_app_secret.encode(), booking_id.encode(), hashlib.sha256).hexdigest()[:12]
    else:
        sig = booking_id[:12]
    return f"https://meet.jit.si/promatch-{sig}"


async def list_bookings(profile_id: str, db: Client) -> list[BookingOut]:
    result = (
        db.table("bookings")
        .select("*")
        .or_(f"host_id.eq.{profile_id},guest_id.eq.{profile_id}")
        .order("starts_at")
        .execute()
    )
    return [BookingOut(**r) for r in result.data]


async def get_booking(booking_id: UUID, profile_id: str, db: Client) -> BookingOut:
    result = db.table("bookings").select("*").eq("id", str(booking_id)).execute()
    if not result.data:
        raise HTTPException(404, detail={"code": "booking_not_found", "message": "Booking not found"})
    b = result.data[0]
    if profile_id not in (b["host_id"], b["guest_id"]):
        raise HTTPException(403, detail={"code": "not_participant", "message": "Not a booking participant"})
    return BookingOut(**b)


async def create_booking(guest_id: str, body: BookingIn, db: Client) -> BookingOut:
    host_id = str(body.host_id)
    if guest_id == host_id:
        raise HTTPException(400, detail={"code": "self_booking", "message": "Cannot book yourself"})
    row = {
        "guest_id": guest_id,
        "host_id": host_id,
        "starts_at": body.starts_at.isoformat(),
        "ends_at": body.ends_at.isoformat(),
        "kind": body.kind.value,
        "notes": body.notes,
        "status": BookingStatus.pending.value,
        "is_paid": body.is_paid,
        "price_cents": body.price_cents,
        "currency": body.currency,
    }
    result = db.table("bookings").insert(row).execute()
    booking = BookingOut(**result.data[0])
    await send_notification_to(host_id, "booking_request", {"booking_id": str(booking.id)})
    return booking


async def update_status(booking_id: UUID, profile_id: str, body: BookingStatusUpdate, db: Client) -> BookingOut:
    booking = await get_booking(booking_id, profile_id, db)
    role = "host" if str(booking.host_id) == profile_id else "guest"
    allowed = _TRANSITIONS.get((booking.status.value, role), set())
    if body.status.value not in allowed:
        raise HTTPException(
            400,
            detail={"code": "invalid_transition", "message": f"Cannot move from {booking.status} as {role}"},
        )

    update: dict = {"status": body.status.value}  # type: ignore[type-arg]
    if body.notes:
        update["notes"] = body.notes
    if body.status == BookingStatus.confirmed:
        update["meeting_url"] = _gen_meet_url(str(booking_id))

    admin = get_admin_client()
    result = admin.table("bookings").update(update).eq("id", str(booking_id)).execute()
    updated = BookingOut(**result.data[0])

    other_id = str(booking.guest_id) if role == "host" else str(booking.host_id)
    if body.status == BookingStatus.confirmed:
        await send_notification_to(other_id, "booking_confirmed", {"booking_id": str(booking_id)})
        from app.worker import enqueue
        await enqueue("booking_reminder", {"booking_id": str(booking_id)})
    elif body.status in (BookingStatus.cancelled_by_host, BookingStatus.cancelled_by_guest):
        await send_notification_to(other_id, "booking_cancelled", {"booking_id": str(booking_id)})

    return updated
