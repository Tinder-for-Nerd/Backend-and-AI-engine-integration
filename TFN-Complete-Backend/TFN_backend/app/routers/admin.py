"""
/api/v1/admin — event review, report management, profile suspension.
All actions write admin_audit_log.
"""
from uuid import UUID

from fastapi import APIRouter

from app.deps import AdminDB, AdminID
from app.models.admin import ReportOut, ReportUpdateIn, SuspendProfileIn
from app.models.common import OkResponse
from app.models.events import EventOut, EventReviewIn
from app.services import admin as admin_svc

router = APIRouter(tags=["admin"])


@router.post("/admin/events/{event_id}/review", response_model=EventOut)
async def review_event(event_id: UUID, uid: AdminID, db: AdminDB, body: EventReviewIn) -> EventOut:
    return await admin_svc.review_event(event_id, uid, body, db)


@router.get("/admin/reports", response_model=list[ReportOut])
async def list_reports(uid: AdminID, db: AdminDB, status: str | None = None) -> list[ReportOut]:
    return await admin_svc.list_reports(db, status=status)


@router.patch("/admin/reports/{report_id}", response_model=ReportOut)
async def update_report(report_id: UUID, uid: AdminID, db: AdminDB, body: ReportUpdateIn) -> ReportOut:
    return await admin_svc.update_report(report_id, uid, body, db)


@router.post("/admin/profiles/{profile_id}/suspend", response_model=OkResponse)
async def suspend_profile(profile_id: UUID, uid: AdminID, db: AdminDB, body: SuspendProfileIn) -> OkResponse:
    await admin_svc.suspend_profile(profile_id, uid, body, db)
    return OkResponse()
