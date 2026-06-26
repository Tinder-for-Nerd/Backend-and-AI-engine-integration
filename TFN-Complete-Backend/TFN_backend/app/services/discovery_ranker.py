"""
Discovery ranker service.
Scoring weights: cosine(0.45) + jaccard(0.25) + intent(0.10) + locality(0.10) + recency(0.05) + badge(0.05)
MMR diversification: λ=0.70
Column names match schema.sql exactly.
"""
import base64
import math
from datetime import datetime, timezone

from supabase import Client

from app.config import settings
from app.models.discovery import DiscoveryFeed, FeedItem, FeedbackIn
from app.models.profiles import ProfileOut


def _jaccard(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _intent_overlap(a: list[str], b: list[str]) -> float:
    return 1.0 if set(a) & set(b) else 0.0


def _locality_score(a: str | None, b: str | None) -> float:
    if not a or not b:
        return 0.0
    return 1.0 if a.strip().lower() == b.strip().lower() else 0.0


def _recency_score(updated_at: str | None) -> float:
    if not updated_at:
        return 0.0
    try:
        dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        days = (datetime.now(timezone.utc) - dt).days
        return math.exp(-days / 30)
    except ValueError:
        return 0.0


def _badge_score(badges: list[dict]) -> float:  # type: ignore[type-arg]
    return min(len(badges) * 0.33, 1.0)


def _score(me: dict, candidate: dict, cosine: float) -> float:  # type: ignore[type-arg]
    w = settings
    me_interests = [r.get("interest_id", "") for r in me.get("profile_interests", [])]
    cand_interests = [r.get("interest_id", "") for r in candidate.get("profile_interests", [])]
    return (
        w.ranker_cosine_weight * cosine
        + w.ranker_jaccard_weight * _jaccard(me_interests, cand_interests)
        + w.ranker_intent_weight * _intent_overlap(
            me.get("looking_for", []), candidate.get("looking_for", [])
        )
        + w.ranker_locality_weight * _locality_score(
            me.get("location_city"), candidate.get("location_city")
        )
        + w.ranker_recency_weight * _recency_score(candidate.get("updated_at"))
        + w.ranker_badge_weight * _badge_score(candidate.get("verification_badges", []))
    )


def _mmr(scored: list[tuple[dict, float]], λ: float, k: int) -> list[tuple[dict, float]]:  # type: ignore[type-arg]
    selected: list[tuple[dict, float]] = []
    remaining = list(scored)
    while remaining and len(selected) < k:
        best = max(
            remaining,
            key=lambda x: λ * x[1] - (1 - λ) * max(
                (_jaccard(
                    [r.get("interest_id", "") for r in x[0].get("profile_interests", [])],
                    [r.get("interest_id", "") for r in s[0].get("profile_interests", [])],
                ) for s in selected),
                default=0.0,
            ),
        )
        selected.append(best)
        remaining.remove(best)
    return selected


def _encode_cursor(profile_id: str) -> str:
    return base64.urlsafe_b64encode(profile_id.encode()).decode()


async def get_feed(
    profile_id: str,
    db: Client,
    *,
    cursor: str | None,
    looking_for: list[str],
    location: str | None,
) -> DiscoveryFeed:
    # Fetch my profile + interests
    me_result = db.table("profiles").select("*, profile_interests(interest_id)").eq("id", profile_id).execute()
    if not me_result.data:
        return DiscoveryFeed(items=[], has_more=False)
    me = me_result.data[0]

    # Build exclusion set
    likes_r = db.table("likes").select("likee_id").eq("liker_id", profile_id).execute()
    passes_r = db.table("passes").select("likee_id").eq("liker_id", profile_id).execute()
    blocks_r = db.table("blocks").select("blocker_id,blocked_id").or_(
        f"blocker_id.eq.{profile_id},blocked_id.eq.{profile_id}"
    ).execute()

    seen = {profile_id}
    seen |= {r["likee_id"] for r in likes_r.data}
    seen |= {r["likee_id"] for r in passes_r.data}
    for b in blocks_r.data:
        seen.add(b["blocker_id"])
        seen.add(b["blocked_id"])

    # Pull candidates
    q = (
        db.table("profiles")
        .select("*, verification_badges(*), profile_interests(interest_id)")
        .eq("visibility", "public")
        .eq("is_active", True)
        .not_.in_("id", list(seen))
        .limit(settings.discovery_candidate_limit)
    )
    if looking_for:
        q = q.contains("looking_for", looking_for)
    if location:
        q = q.eq("location_city", location)

    cands_result = q.execute()

    # Score
    scored: list[tuple[dict, float]] = []
    for c in cands_result.data:
        s = _score(me, c, cosine=0.0)  # cosine added in W4
        scored.append((c, s))

    scored.sort(key=lambda x: x[1], reverse=True)

    page_size = settings.discovery_feed_size
    mmr_results = _mmr(scored, settings.ranker_mmr_lambda, page_size + 1)
    has_more = len(mmr_results) > page_size
    page = mmr_results[:page_size]

    # Shared interests: intersection of interest_ids
    my_iids = {r["interest_id"] for r in me.get("profile_interests", [])}
    items = []
    for (c, score) in page:
        cand_iids = {r["interest_id"] for r in c.get("profile_interests", [])}
        shared = list(my_iids & cand_iids)
        items.append(FeedItem(profile=ProfileOut(**c), score=round(score, 4), shared_interests=shared))

    next_cursor = _encode_cursor(str(page[-1][0]["id"])) if has_more and page else None
    return DiscoveryFeed(items=items, next_cursor=next_cursor, has_more=has_more)


async def record_feedback(profile_id: str, body: FeedbackIn, db: Client) -> None:
    row = {
        "profile_id": profile_id,
        "target_profile_id": str(body.target_profile_id) if body.target_profile_id else None,
        "target_match_id": str(body.target_match_id) if body.target_match_id else None,
        "event_type": body.event_type.value,
        "value": body.value,
    }
    db.table("feedback").insert(row).execute()
