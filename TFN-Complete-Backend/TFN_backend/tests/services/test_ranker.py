"""Unit tests for discovery ranker scoring helpers."""
from app.services.discovery_ranker import _jaccard, _intent_overlap, _locality_score, _recency_score


def test_jaccard_identical():
    assert _jaccard(["a", "b"], ["a", "b"]) == 1.0


def test_jaccard_disjoint():
    assert _jaccard(["a"], ["b"]) == 0.0


def test_jaccard_partial():
    result = _jaccard(["a", "b"], ["b", "c"])
    assert abs(result - 1 / 3) < 0.01


def test_intent_overlap_match():
    assert _intent_overlap(["collaboration"], ["collaboration", "networking"]) == 1.0


def test_intent_overlap_none():
    assert _intent_overlap(["mentorship"], ["networking"]) == 0.0


def test_locality_match():
    assert _locality_score("London", "london") == 1.0


def test_locality_mismatch():
    assert _locality_score("London", "Paris") == 0.0


def test_recency_recent():
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    score = _recency_score(now)
    assert score > 0.9


def test_recency_old():
    score = _recency_score("2020-01-01T00:00:00Z")
    assert score < 0.01
