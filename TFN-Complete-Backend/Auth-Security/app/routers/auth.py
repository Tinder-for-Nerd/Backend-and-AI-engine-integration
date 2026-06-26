from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import UserRole, settings
from app.database import get_db, new_user_id
from app.dependencies.auth import get_current_user, require_roles, user_to_response
from app.models.user import User, UserRoleEnum
from app.schemas.auth import LoginRequest, MessageResponse, RegisterRequest, TokenResponse, UserResponse
from app.services.jwt_service import (
    create_access_token,
    generate_refresh_token,
    get_refresh_user_id,
    revoke_refresh_token,
    store_refresh_token,
)
from app.services.lockout import (
    clear_login_attempts,
    get_lockout_ttl,
    is_account_locked,
    record_failed_login,
)
from app.services.oauth import google_configured, linkedin_configured, oauth
from app.services.password import hash_password, verify_password
from app.services.redis_client import get_redis

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key=settings.access_cookie_name,
        value=access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_same_site,
        max_age=int(timedelta(minutes=settings.access_token_expire_minutes).total_seconds()),
        path="/",
    )
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_same_site,
        max_age=int(timedelta(days=settings.refresh_token_expire_days).total_seconds()),
        path="/api/auth",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(settings.access_cookie_name, path="/")
    response.delete_cookie(settings.refresh_cookie_name, path="/api/auth")


async def _issue_tokens(user: User, response: Response) -> TokenResponse:
    redis = await get_redis()
    access_token = create_access_token(user_id=user.id, email=user.email, role=user.role.value)
    refresh_token = generate_refresh_token()
    await store_refresh_token(redis, user.id, refresh_token)
    _set_auth_cookies(response, access_token, refresh_token)
    return TokenResponse(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=user_to_response(user),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        id=new_user_id(),
        email=body.email.lower(),
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=UserRoleEnum(body.role.value),
        is_verified=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return await _issue_tokens(user, response)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    redis = await get_redis()
    email = body.email.lower()

    if await is_account_locked(redis, email):
        ttl = await get_lockout_ttl(redis, email)
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account temporarily locked due to too many failed attempts. Retry in {ttl}s.",
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        attempts = await record_failed_login(redis, email)
        remaining = max(settings.max_login_attempts - attempts, 0)
        if remaining == 0:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=f"Account locked for {settings.lockout_duration_minutes} minutes after too many failed attempts.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid email or password. {remaining} attempt(s) remaining before lockout.",
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    await clear_login_attempts(redis, email)
    return await _issue_tokens(user, response)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(settings.refresh_cookie_name)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing")

    redis = await get_redis()
    user_id = await get_refresh_user_id(redis, token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    await revoke_refresh_token(redis, token)
    return await _issue_tokens(user, response)


@router.post("/logout", response_model=MessageResponse)
async def logout(request: Request, response: Response):
    token = request.cookies.get(settings.refresh_cookie_name)
    if token:
        redis = await get_redis()
        await revoke_refresh_token(redis, token)
    _clear_auth_cookies(response)
    return MessageResponse(message="Logged out successfully")


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return user_to_response(user)


@router.get("/providers")
async def list_providers():
    return {
        "google": google_configured(),
        "linkedin": linkedin_configured(),
        "email_password": True,
    }


@router.get("/google/login")
async def google_login(request: Request):
    if not google_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google OAuth not configured")
    redirect_uri = settings.google_redirect_uri
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    if not google_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google OAuth not configured")

    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo")
    if not userinfo:
        userinfo = await oauth.google.parse_id_token(request, token)

    user = await _upsert_oauth_user(
        db,
        provider="google",
        subject=userinfo["sub"],
        email=userinfo.get("email"),
        full_name=userinfo.get("name"),
        verified=bool(userinfo.get("email_verified")),
    )
    redirect = RedirectResponse(url=settings.oauth_success_redirect, status_code=302)
    access_token = create_access_token(user_id=user.id, email=user.email, role=user.role.value)
    refresh_token = generate_refresh_token()
    redis = await get_redis()
    await store_refresh_token(redis, user.id, refresh_token)
    _set_auth_cookies(redirect, access_token, refresh_token)
    return redirect


@router.get("/linkedin/login")
async def linkedin_login(request: Request):
    if not linkedin_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="LinkedIn OAuth not configured")
    redirect_uri = settings.linkedin_redirect_uri
    return await oauth.linkedin.authorize_redirect(request, redirect_uri)


@router.get("/linkedin/callback")
async def linkedin_callback(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    if not linkedin_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="LinkedIn OAuth not configured")

    token = await oauth.linkedin.authorize_access_token(request)
    userinfo = token.get("userinfo")
    if not userinfo:
        resp = await oauth.linkedin.get("userinfo", token=token)
        userinfo = resp.json()

    user = await _upsert_oauth_user(
        db,
        provider="linkedin",
        subject=userinfo["sub"],
        email=userinfo.get("email"),
        full_name=userinfo.get("name"),
        verified=bool(userinfo.get("email_verified", True)),
    )
    redirect = RedirectResponse(url=settings.oauth_success_redirect, status_code=302)
    access_token = create_access_token(user_id=user.id, email=user.email, role=user.role.value)
    refresh_token = generate_refresh_token()
    redis = await get_redis()
    await store_refresh_token(redis, user.id, refresh_token)
    _set_auth_cookies(redirect, access_token, refresh_token)
    return redirect


async def _upsert_oauth_user(
    db: AsyncSession,
    *,
    provider: str,
    subject: str,
    email: str | None,
    full_name: str | None,
    verified: bool,
) -> User:
    result = await db.execute(
        select(User).where(User.oauth_provider == provider, User.oauth_subject == subject)
    )
    user = result.scalar_one_or_none()
    if user:
        return user

    if email:
        result = await db.execute(select(User).where(User.email == email.lower()))
        existing = result.scalar_one_or_none()
        if existing:
            existing.oauth_provider = provider
            existing.oauth_subject = subject
            existing.is_verified = existing.is_verified or verified
            if full_name and not existing.full_name:
                existing.full_name = full_name
            await db.commit()
            await db.refresh(existing)
            return existing

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{provider.title()} did not return an email address",
        )

    user = User(
        id=new_user_id(),
        email=email.lower(),
        full_name=full_name,
        role=UserRoleEnum.STUDENT,
        is_verified=verified,
        oauth_provider=provider,
        oauth_subject=subject,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
