"""
Embedding service.
- build_source_text: assemble profile text for embedding
- embed_and_upsert: compute via OpenAI text-embedding-3-small, store in profile_embeddings
- rewrite_bio / suggest_interests: GPT-4o-mini helpers
"""
import asyncio
import hashlib
import json

from openai import AsyncOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings
from app.db.client import get_admin_client
from app.models.ai import (
    BioRewriteRequest,
    BioRewriteResponse,
    InterestSuggestRequest,
    InterestSuggestResponse,
)

_client = AsyncOpenAI(api_key=settings.openai_api_key)
_EMBED_MODEL = "text-embedding-3-small"
_CHAT_MODEL = "gpt-4o-mini"


def build_source_text(profile: dict) -> str:  # type: ignore[type-arg]
    parts = [
        profile.get("headline", "") or "",
        profile.get("bio", "") or "",
        "Looking for: " + ", ".join(profile.get("looking_for", [])),
        "Interests: " + ", ".join(profile.get("interests", [])),
        "Projects: " + " | ".join(p.get("title", "") for p in profile.get("projects", [])),
    ]
    return "\n".join(p for p in parts if p.strip())


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
async def _call_embed(text: str) -> list[float]:
    resp = await _client.embeddings.create(model=_EMBED_MODEL, input=text)
    return resp.data[0].embedding


async def embed_and_upsert(profile_id: str) -> None:
    admin = get_admin_client()

    # Fetch profile with interests + projects
    p_res = admin.table("profiles").select("*").eq("id", profile_id).execute()
    if not p_res.data:
        return
    profile = p_res.data[0]

    # Enrich with interests
    pi_res = admin.table("profile_interests").select("interests(name)").eq("profile_id", profile_id).execute()
    profile["interests"] = [r["interests"]["name"] for r in pi_res.data if r.get("interests")]

    proj_res = admin.table("projects").select("title").eq("profile_id", profile_id).execute()
    profile["projects"] = proj_res.data

    text = build_source_text(profile)
    text_hash = _hash_text(text)

    # Skip if unchanged
    existing = admin.table("profile_embeddings").select("text_hash").eq("profile_id", profile_id).execute()
    if existing.data and existing.data[0].get("text_hash") == text_hash:
        return

    vector = await _call_embed(text)
    row = {
        "profile_id": profile_id,
        "embedding": vector,
        "text_hash": text_hash,
    }
    admin.table("profile_embeddings").upsert(row, on_conflict="profile_id").execute()


# ── GPT helpers ──────────────────────────────────────────────

@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=4))
async def _chat_json(system: str, user: str) -> dict:  # type: ignore[type-arg]
    resp = await _client.chat.completions.create(
        model=_CHAT_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        max_tokens=512,
    )
    import json as _json
    return _json.loads(resp.choices[0].message.content or "{}")


async def rewrite_bio(body: BioRewriteRequest) -> BioRewriteResponse:
    tone = body.tone or "professional"
    system = (
        "You are a profile editor. Rewrite the bio in a "
        f"{tone} tone. Return JSON: {{\"rewritten_bio\": \"...\"}}"
    )
    result = await _chat_json(system, body.current_bio)
    return BioRewriteResponse(rewritten_bio=result.get("rewritten_bio", body.current_bio))


async def suggest_interests(body: InterestSuggestRequest) -> InterestSuggestResponse:
    system = (
        "Extract 5-10 professional interests from the bio. "
        "Return JSON: {\"suggested_interests\": [\"...\"]}"
    )
    result = await _chat_json(system, body.bio)
    return InterestSuggestResponse(suggested_interests=result.get("suggested_interests", []))
