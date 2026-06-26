"""
/api/v1/likes — like, pass, received likes.
"""
from fastapi import APIRouter

from app.deps import UserDB, UserID
from app.models.common import OkResponse
from app.models.likes import LikeIn, LikeResponse, PassIn, PassOut
from app.services import likes as likes_svc

router = APIRouter(tags=["likes"])


@router.post("/likes", response_model=LikeResponse, status_code=201)
async def send_like(uid: UserID, db: UserDB, body: LikeIn) -> LikeResponse:
    return await likes_svc.send_like(uid, body, db)


@router.post("/passes", response_model=OkResponse, status_code=201)
async def send_pass(uid: UserID, db: UserDB, body: PassIn) -> OkResponse:
    await likes_svc.send_pass(uid, body, db)
    return OkResponse()


@router.get("/likes/received", response_model=list)
async def received_likes(uid: UserID, db: UserDB) -> list:  # type: ignore[type-arg]
    return await likes_svc.get_received_likes(uid, db)
