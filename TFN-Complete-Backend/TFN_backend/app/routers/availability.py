"""
/api/v1/availability — CRUD + expanded slots for next 14 days.
"""
from uuid import UUID

from fastapi import APIRouter

from app.deps import UserDB, UserID
from app.models.bookings import AvailabilitySlotIn, AvailabilitySlotOut
from app.models.common import OkResponse
from app.services import availability as avail_svc

router = APIRouter(tags=["availability"])


@router.get("/me/availability", response_model=list[AvailabilitySlotOut])
async def list_my_slots(uid: UserID, db: UserDB) -> list[AvailabilitySlotOut]:
    return await avail_svc.list_slots(uid, db)


@router.post("/me/availability", response_model=AvailabilitySlotOut, status_code=201)
async def create_slot(uid: UserID, db: UserDB, body: AvailabilitySlotIn) -> AvailabilitySlotOut:
    return await avail_svc.create_slot(uid, body, db)


@router.patch("/me/availability/{slot_id}", response_model=AvailabilitySlotOut)
async def update_slot(slot_id: UUID, uid: UserID, db: UserDB, body: AvailabilitySlotIn) -> AvailabilitySlotOut:
    return await avail_svc.update_slot(uid, slot_id, body, db)


@router.delete("/me/availability/{slot_id}", response_model=OkResponse)
async def delete_slot(slot_id: UUID, uid: UserID, db: UserDB) -> OkResponse:
    await avail_svc.delete_slot(uid, slot_id, db)
    return OkResponse()


@router.get("/profiles/{profile_id}/availability", response_model=list[dict])
async def get_expanded_availability(profile_id: UUID, uid: UserID, db: UserDB) -> list[dict]:  # type: ignore[type-arg]
    """Returns concrete time windows for the next 14 days."""
    return await avail_svc.expand_slots(profile_id, db)
