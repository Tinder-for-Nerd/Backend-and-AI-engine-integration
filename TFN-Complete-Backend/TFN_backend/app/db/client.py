"""
Supabase client factories.

- get_admin_client()  → service-role client for cross-user/system ops
- get_user_client(token) → user-scoped client; RLS enforced
"""
from functools import lru_cache

from fastapi import Request
from supabase import Client, create_client

from app.config import settings


@lru_cache(maxsize=1)
def get_admin_client() -> Client:
    """Service-role client. Use only for system/cross-user operations."""
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def get_user_client(request: Request) -> Client:
    """
    Per-request client initialised with the caller's JWT.
    RLS policies enforce row-level access automatically.
    """
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    client.postgrest.auth(token)
    return client
