"""Worker job: verify GitHub/LinkedIn profile links."""
import structlog
import httpx

from app.db.client import get_admin_client

log = structlog.get_logger()


async def verify_github_link(ctx: dict, payload: dict) -> None:  # type: ignore[type-arg]
    link_id = payload.get("link_id")
    platform = payload.get("platform", "").lower()
    if not link_id:
        return

    admin = get_admin_client()
    result = admin.table("profile_links").select("url").eq("id", link_id).execute()
    if not result.data:
        return

    url = result.data[0]["url"]
    verified = False

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            if platform == "github":
                # Check GitHub username exists
                username = url.rstrip("/").split("/")[-1]
                resp = await client.get(f"https://api.github.com/users/{username}")
                verified = resp.status_code == 200
            elif platform == "linkedin":
                # LinkedIn doesn't support public API — mark as pending for manual review
                verified = False
        except httpx.HTTPError:
            verified = False

    if verified:
        from datetime import datetime, timezone
        admin.table("profile_links").update({
            "is_verified": True,
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", link_id).execute()
        log.info("verify_github_link.verified", link_id=link_id, platform=platform)
