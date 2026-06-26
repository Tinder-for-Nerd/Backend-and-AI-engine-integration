"""
JWT verification for Supabase-issued tokens.
Algorithm: HS256, audience: authenticated.
"""
from typing import Any

from jose import ExpiredSignatureError, JWTError, jwt

from app.config import settings

_ALGORITHM = "HS256"
_AUDIENCE = "authenticated"


def verify_jwt(token: str) -> dict[str, Any]:
    """
    Decode and verify a Supabase JWT.
    Raises ValueError on any failure (expired, invalid sig, wrong aud).
    Returns the full claims dict on success.
    """
    try:
        claims = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=[_ALGORITHM],
            audience=_AUDIENCE,
            options={"verify_exp": True},
        )
        return claims  # type: ignore[return-value]
    except ExpiredSignatureError:
        raise ValueError("token_expired")
    except JWTError as exc:
        raise ValueError(f"token_invalid: {exc}") from exc


def extract_user_id(token: str) -> str:
    claims = verify_jwt(token)
    uid = claims.get("sub")
    if not uid:
        raise ValueError("token_missing_sub")
    return str(uid)


def extract_role(token: str) -> str:
    claims = verify_jwt(token)
    app_meta = claims.get("app_metadata", {})
    return str(app_meta.get("role", "user"))


def is_admin_token(token: str) -> bool:
    return extract_role(token) == "admin"
