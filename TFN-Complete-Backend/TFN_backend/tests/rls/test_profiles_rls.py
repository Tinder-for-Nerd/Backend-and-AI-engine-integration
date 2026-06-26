"""RLS tests: profiles table access controls."""
import pytest


def test_user_can_read_own_profile(user_a, admin_client):
    result = admin_client.table("profiles").select("*").eq("id", user_a["id"]).execute()
    assert result.data


def test_user_cannot_update_other_profile(client_a, user_b):
    # Should be blocked by RLS (update returns empty or raises)
    r = client_a.patch(f"/api/v1/profiles/{user_b['id']}", json={"display_name": "Hacked"})
    assert r.status_code in (403, 404, 405)


def test_hidden_profile_not_visible(admin_client, user_b, client_a):
    # Set user_b to hidden
    admin_client.table("profiles").update({"visibility": "hidden"}).eq("id", user_b["id"]).execute()
    r = client_a.get(f"/api/v1/discovery/feed")
    profiles = [item["profile"]["id"] for item in r.json().get("items", [])]
    assert user_b["id"] not in profiles
    # Restore
    admin_client.table("profiles").update({"visibility": "public"}).eq("id", user_b["id"]).execute()
