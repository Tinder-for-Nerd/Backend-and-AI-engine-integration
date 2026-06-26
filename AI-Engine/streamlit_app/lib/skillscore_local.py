"""Direct Python integration with skillscore algorithm (no API required)."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from lib.config import EVENT_ALGORITHM

# Add event-algorithm to path for direct imports
if str(EVENT_ALGORITHM) not in sys.path:
    sys.path.insert(0, str(EVENT_ALGORITHM))


def score_resume_local(
    content: bytes,
    filename: str,
    *,
    role_months: float = 12.0,
    months_since_use: float = 1.0,
    seniority_level: str = "used",
    endorsement_count: int = 0,
    self_reported_level: str | float = "Intermediate",
) -> dict[str, Any]:
    """Score a resume using skillscore_algorithm directly (offline mode)."""
    from skillscore_algorithm.core import (  # noqa: WPS433
        Event,
        ScoringConfig,
        SkillEvidence,
        SkillTaxonomyEntry,
        extract_exact_skill_mentions,
        rank_events_from_scored_skills,
        score_skill,
    )

    try:
        import io

        import PyPDF2
    except ImportError:
        PyPDF2 = None  # type: ignore[assignment,misc]

    fname = filename.lower()
    if fname.endswith(".pdf") and PyPDF2 is not None:
        reader = PyPDF2.PdfReader(io.BytesIO(content))
        text = "\n".join(p.extract_text() or "" for p in reader.pages)
    else:
        text = content.decode("utf-8", errors="ignore")

    taxonomy_path = EVENT_ALGORITHM / "data" / "master_taxonomy.json"
    events_path = EVENT_ALGORITHM / "data" / "sample_events.json"

    taxonomy_raw = json.loads(taxonomy_path.read_text(encoding="utf-8"))
    events_raw = json.loads(events_path.read_text(encoding="utf-8"))

    taxonomy_entries = [
        SkillTaxonomyEntry(
            canonical_name=item.get("canonical_name") or item.get("name"),
            domain=item.get("domain") or item.get("canonical_name") or item.get("name"),
            aliases=tuple(item.get("aliases", [])),
        )
        for item in taxonomy_raw
        if item.get("canonical_name") or item.get("name")
    ]

    extracted = extract_exact_skill_mentions(text, taxonomy_entries)
    config = ScoringConfig()
    results = []
    scored_skills = []

    for ex in extracted:
        evidence = SkillEvidence(
            name=ex.canonical_name,
            domain=ex.domain,
            months_since_use=months_since_use,
            role_months=role_months,
            seniority_level=seniority_level,
            endorsement_count=endorsement_count,
            self_reported_level=self_reported_level,
        )
        scored = score_skill(evidence, config)
        scored_skills.append(scored)
        results.append({"extracted": ex.__dict__, "score": scored.__dict__})

    event_objects = [
        Event(
            id=item["id"],
            title=item["title"],
            required_skills=item["required_skills"],
            start_time=item.get("start_time"),
            popularity=item.get("popularity", 0.5),
        )
        for item in events_raw
        if item.get("id") and item.get("title") and item.get("required_skills")
    ]

    profile, ranked_events = rank_events_from_scored_skills(scored_skills, event_objects, config)

    return {
        "mode": "local",
        "file": filename,
        "skill_score_results": results,
        "domain_scores": profile.domain_scores,
        "top_domain": profile.top_domain,
        "total_skill_score": profile.total_skill_score,
        "ranked_events": ranked_events,
    }
