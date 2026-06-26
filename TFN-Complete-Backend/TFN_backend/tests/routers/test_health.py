import httpx


def test_healthz():
    with httpx.Client(base_url="http://localhost:8000") as c:
        r = c.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_version():
    with httpx.Client(base_url="http://localhost:8000") as c:
        r = c.get("/version")
    assert r.status_code == 200
    assert "git_sha" in r.json()
