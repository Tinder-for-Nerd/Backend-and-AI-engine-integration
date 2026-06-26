"""
/api/v1/ai — starter message, bio rewrite, interest suggestions.
"""
from uuid import UUID

from fastapi import APIRouter

from app.deps import Redis, UserDB, UserID
from app.models.ai import (
    BioRewriteRequest,
    BioRewriteResponse,
    InterestSuggestRequest,
    InterestSuggestResponse,
    StarterResponse,
)
from app.services import starter_gen, embeddings as embed_svc

router = APIRouter(tags=["ai"])


@router.get("/ai/starter/{match_id}", response_model=StarterResponse)
async def get_starter(match_id: UUID, uid: UserID, db: UserDB, redis: Redis) -> StarterResponse:
    return await starter_gen.get_starter(match_id, uid, db, redis)


@router.post("/ai/bio/rewrite", response_model=BioRewriteResponse)
async def rewrite_bio(uid: UserID, body: BioRewriteRequest) -> BioRewriteResponse:
    return await embed_svc.rewrite_bio(body)


@router.post("/ai/interests/suggest", response_model=InterestSuggestResponse)
async def suggest_interests(uid: UserID, body: InterestSuggestRequest) -> InterestSuggestResponse:
    return await embed_svc.suggest_interests(body)
