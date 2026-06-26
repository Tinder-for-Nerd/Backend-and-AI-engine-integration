from pydantic import BaseModel, EmailStr, Field

from app.config import UserRole


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)
    role: UserRole = UserRole.STUDENT


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserResponse"


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None
    role: UserRole
    is_verified: bool
    oauth_provider: str | None = None

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    message: str


class RoleUpdateRequest(BaseModel):
    role: UserRole
