"""Integration tests for likes/passes."""
import pytest
import httpx


def test_send_like(client_a, client_b, user_b):
    r = client_a.post("/api/v1/likes", json={
        "liked_profile_id": user_b["id"],
        "intents": ["collaboration"],
    })
    assert r.status_code == 201
    data = r.json()
    assert data["like"]["liked_profile_id"] == user_b["id"]


def test_duplicate_like_409(client_a, user_b):
    client_a.post("/api/v1/likes", json={
        "liked_profile_id": user_b["id"],
        "intents": ["collaboration"],
    })
    r = client_a.post("/api/v1/likes", json={
        "liked_profile_id": user_b["id"],
        "intents": ["collaboration"],
    })
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "already_liked"


def test_mutual_like_creates_match(client_a, client_b, user_a, user_b):
    # A likes B
    client_a.post("/api/v1/likes", json={"liked_profile_id": user_b["id"], "intents": ["networking"]})
    # B likes A — should produce match
    r = client_b.post("/api/v1/likes", json={"liked_profile_id": user_a["id"], "intents": ["networking"]})
    assert r.status_code == 201
    assert r.json().get("match") is not None


def test_no_auth_401():
    with httpx.Client(base_url="http://localhost:8000") as c:
        r = c.post("/api/v1/likes", json={"liked_profile_id": "x", "intents": []})
    assert r.status_code == 401
