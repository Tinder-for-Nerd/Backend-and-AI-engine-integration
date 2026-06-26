"""
AI starter message generator.
- Loads both profiles in a match
- Calls GPT-4o-mini with structured output
- 24h Redis cache keyed starter:{match_id}
- Keyword blocklist post-filter
- Template fallback on any failure
"""
import json
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import HTTPException, status
from openai import AsyncOpenAI
from supabase import Client
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings
from app.db.client import get_admin_client
from app.models.ai import StarterResponse

_client = AsyncOpenAI(api_key=settings.openai_api_key)
_CACHE_TTL = 86_400  # 24h

_BLOCKLIST = {"hate", "violence", "porn", "nude", "kill"}

_TEMPLATES = {
    "collaboration": "I saw your project work — would love to explore building something together!",
    "mentorship": "Your background is really impressive. Would you be open to sharing some insights?",
    "networking": "Hi! Your profile really stood out. Always great to connect with sharp people.",
    "research": "Your research interests align closely with mine — keen to compare notes sometime!",
    "default": "Hi! Your profile caught my eye — would love to connect!",
}


def _blocklist_check(text: str) -> bool:
    lower = text.lower()
    return any(bad in lower for bad in _BLOCKLIST)


def _fallback(intents: list[str]) -> str:
    for i in intents:
        if i in _TEMPLATES:
            return _TEMPLATES[i]
    return _TEMPLATES["default"]


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=4))
async def _call_gpt(me: dict, other: dict, intents: list[str]) -> dict:  # type: ignore[type-arg]
    prompt = (
        f"My profile: {json.dumps({'headline': me.get('headline'), 'bio': me.get('bio'), 'looking_for': me.get('looking_for')})}\n"
        f"Their profile: {json.dumps({'headline': other.get('headline'), 'bio': other.get('bio'), 'looking_for': other.get('looking_for')})}\n"
        f"Shared intents: {intents}\n"
        "Write a warm, personalised opening message I could send. "
        "Return JSON: {\"starter\": \"...\", \"tags\": [\"...\"]}"
    )
    resp = await _client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You generate warm, genuine first messages for a professional networking platform. "
                    "Never be creepy or generic. Reference specifics from both profiles. "
                    "Max 3 sentences."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        max_tokens=256,
    )
    return json.loads(resp.choices[0].message.content or "{}")


async def get_starter(match_id: UUID, profile_id: str, db: Client, redis: aioredis.Redis) -> StarterResponse:  # type: ignore[type-arg]
    cache_key = f"starter:{match_id}"

    # Cache check
    cached = await redis.get(cache_key)
    if cached:
        data = json.loads(cached)
        return StarterResponse(**data, cached=True)

    admin = get_admin_client()

    # Load match
    m_res = admin.table("matches").select("*").eq("id", str(match_id)).execute()
    if not m_res.data:
        raise HTTPException(404, detail={"code": "match_not_found", "message": "Match not found"})
    match = m_res.data[0]

    a_id, b_id = match["profile_a_id"], match["profile_b_id"]
    if profile_id not in (a_id, b_id):
        raise HTTPException(403, detail={"code": "not_participant", "message": "Not in this match"})

    other_id = b_id if profile_id == a_id else a_id

    me_res = admin.table("profiles").select("*").eq("id", profile_id).execute()
    other_res = admin.table("profiles").select("*").eq("id", other_id).execute()
    me = me_res.data[0] if me_res.data else {}
    other = other_res.data[0] if other_res.data else {}
    intents = match.get("shared_intents", [])

    try:
        result = await _call_gpt(me, other, intents)
        starter = result.get("starter", "")
        tags = result.get("tags", [])
        if not starter or _blocklist_check(starter):
            raise ValueError("blocklist")
    except Exception:
        starter = _fallback(intents)
        tags = intents

    payload = {"match_id": str(match_id), "starter": starter, "tags": tags}
    await redis.setex(cache_key, _CACHE_TTL, json.dumps(payload))

    return StarterResponse(**payload, cached=False)
