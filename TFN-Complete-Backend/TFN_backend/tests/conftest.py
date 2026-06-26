"""
Shared test fixtures.
Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET in env.
Run: supabase start && supabase db reset, then pytest.
"""
import os
import time
import uuid
from typing import AsyncGenerator

import httpx
import pytest
import pytest_asyncio
from jose import jwt
from supabase import Client, create_client

# ── Supabase admin client ─────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def admin_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


# ── JWT minter ────────────────────────────────────────────────────────────────

def mint_jwt(user_id: str, role: str = "user") -> str:
    secret = os.environ["SUPABASE_JWT_SECRET"]
    now = int(time.time())
    claims = {
        "sub": user_id,
        "aud": "authenticated",
        "iat": now,
        "exp": now + 3600,
        "role": "authenticated",
        "app_metadata": {"role": role},
    }
    return jwt.encode(claims, secret, algorithm="HS256")


# ── Test users ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def user_a(admin_client: Client) -> dict:  # type: ignore[type-arg]
    uid = str(uuid.uuid4())
    admin_client.table("profiles").insert({
        "id": uid,
        "display_name": "Alice Test",
        "username": f"alice_{uid[:8]}",
        "looking_for": ["collaboration"],
    }).execute()
    return {"id": uid, "token": mint_jwt(uid)}


@pytest.fixture(scope="session")
def user_b(admin_client: Client) -> dict:  # type: ignore[type-arg]
    uid = str(uuid.uuid4())
    admin_client.table("profiles").insert({
        "id": uid,
        "display_name": "Bob Test",
        "username": f"bob_{uid[:8]}",
        "looking_for": ["collaboration", "networking"],
    }).execute()
    return {"id": uid, "token": mint_jwt(uid)}


@pytest.fixture(scope="session")
def admin_user(admin_client: Client) -> dict:  # type: ignore[type-arg]
    uid = str(uuid.uuid4())
    admin_client.table("profiles").insert({
        "id": uid,
        "display_name": "Admin Test",
        "username": f"admin_{uid[:8]}",
    }).execute()
    return {"id": uid, "token": mint_jwt(uid, role="admin")}


# ── HTTP client factory ───────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def base_url() -> str:
    return os.getenv("TEST_API_URL", "http://localhost:8000")


def auth_client(user: dict, base_url: str) -> httpx.Client:  # type: ignore[type-arg]
    """Return an httpx.Client with Bearer token set for the given user."""
    return httpx.Client(
        base_url=base_url,
        headers={"Authorization": f"Bearer {user['token']}"},
        timeout=10,
    )


@pytest.fixture
def client_a(user_a: dict, base_url: str) -> httpx.Client:
    with auth_client(user_a, base_url) as c:
        yield c


@pytest.fixture
def client_b(user_b: dict, base_url: str) -> httpx.Client:
    with auth_client(user_b, base_url) as c:
        yield c


@pytest.fixture
def client_admin(admin_user: dict, base_url: str) -> httpx.Client:
    with auth_client(admin_user, base_url) as c:
        yield c
