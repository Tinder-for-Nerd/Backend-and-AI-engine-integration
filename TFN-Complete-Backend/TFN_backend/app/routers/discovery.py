"""
/api/v1/discovery — ranked feed + feedback.
"""
from fastapi import APIRouter, Query

from app.deps import UserDB, UserID
from app.models.common import OkResponse
from app.models.discovery import DiscoveryFeed, FeedbackIn
from app.services import discovery_ranker as ranker_svc

router = APIRouter(tags=["discovery"])


@router.get("/discovery/feed", response_model=DiscoveryFeed)
async def get_feed(
    uid: UserID,
    db: UserDB,
    cursor: str | None = Query(None),
    looking_for: list[str] = Query(default=[]),
    location: str | None = Query(None),
) -> DiscoveryFeed:
    return await ranker_svc.get_feed(uid, db, cursor=cursor, looking_for=looking_for, location=location)


@router.post("/discovery/feedback", response_model=OkResponse)
async def submit_feedback(uid: UserID, db: UserDB, body: FeedbackIn) -> OkResponse:
    await ranker_svc.record_feedback(uid, body, db)
    return OkResponse()
