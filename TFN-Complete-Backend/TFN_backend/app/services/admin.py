"""Admin service — event review, reports, suspension. Writes admin_audit_log."""
from uuid import UUID

from fastapi import HTTPException
from supabase import Client

from app.db.types import EventApprovalStatus, ReportStatus
from app.models.admin import ReportOut, ReportUpdateIn, SuspendProfileIn
from app.models.events import EventOut, EventReviewIn


async def _audit(admin_id: str, action: str, target_type: str, target_id: str, db: Client) -> None:
    row = {
        "admin_id": admin_id,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
    }
    db.table("admin_audit_log").insert(row).execute()


async def review_event(event_id: UUID, admin_id: str, body: EventReviewIn, db: Client) -> EventOut:
    new_status = EventApprovalStatus.approved if body.approve else EventApprovalStatus.rejected
    update = {"approval_status": new_status.value, "reviewed_by": admin_id}
    if body.review_notes:
        update["review_notes"] = body.review_notes
    result = db.table("events").update(update).eq("id", str(event_id)).execute()
    if not result.data:
        raise HTTPException(404, detail={"code": "event_not_found", "message": "Event not found"})
    await _audit(admin_id, "event_review", "event", str(event_id), db)
    return EventOut(**result.data[0])


async def list_reports(db: Client, *, status: str | None) -> list[ReportOut]:
    q = db.table("reports").select("*").order("created_at", desc=True)
    if status:
        q = q.eq("status", status)
    result = q.execute()
    return [ReportOut(**r) for r in result.data]


async def update_report(report_id: UUID, admin_id: str, body: ReportUpdateIn, db: Client) -> ReportOut:
    update: dict = {"status": body.status.value}  # type: ignore[type-arg]
    if body.resolution_notes:
        update["resolution_notes"] = body.resolution_notes
    result = db.table("reports").update(update).eq("id", str(report_id)).execute()
    if not result.data:
        raise HTTPException(404, detail={"code": "report_not_found", "message": "Report not found"})
    await _audit(admin_id, "report_update", "report", str(report_id), db)
    return ReportOut(**result.data[0])


async def suspend_profile(profile_id: UUID, admin_id: str, body: SuspendProfileIn, db: Client) -> None:
    result = db.table("profiles").update({"is_active": False}).eq("id", str(profile_id)).execute()
    if not result.data:
        raise HTTPException(404, detail={"code": "profile_not_found", "message": "Profile not found"})
    await _audit(admin_id, f"suspend:{body.reason}", "profile", str(profile_id), db)
