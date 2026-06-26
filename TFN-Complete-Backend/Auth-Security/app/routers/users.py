from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import UserRole
from app.database import get_db
from app.dependencies.auth import get_current_user, require_roles, user_to_response
from app.models.user import User, UserRoleEnum
from app.schemas.auth import MessageResponse, RoleUpdateRequest, UserResponse

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/profile", response_model=UserResponse)
async def profile(user: User = Depends(get_current_user)):
    return user_to_response(user)


@router.get("/student-only", response_model=MessageResponse)
async def student_only(user: User = Depends(require_roles(UserRole.STUDENT))):
    return MessageResponse(message=f"Hello student {user.email}")


@router.get("/professional-only", response_model=MessageResponse)
async def professional_only(user: User = Depends(require_roles(UserRole.PROFESSIONAL))):
    return MessageResponse(message=f"Hello professional {user.email}")


@router.get("/admin-only", response_model=MessageResponse)
async def admin_only(user: User = Depends(require_roles(UserRole.ADMIN))):
    return MessageResponse(message=f"Hello admin {user.email}")


@router.patch("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    body: RoleUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.role = UserRoleEnum(body.role.value)
    await db.commit()
    await db.refresh(user)
    return user_to_response(user)


@router.get("/", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    result = await db.execute(select(User))
    users = result.scalars().all()
    return [user_to_response(u) for u in users]
