"""Worker job: compute and store profile embedding."""
import structlog

log = structlog.get_logger()


async def embed_profile(ctx: dict, payload: dict) -> None:  # type: ignore[type-arg]
    profile_id = payload.get("profile_id")
    if not profile_id:
        log.warning("embed_profile: missing profile_id")
        return
    log.info("embed_profile.start", profile_id=profile_id)
    from app.services.embeddings import embed_and_upsert
    await embed_and_upsert(profile_id)
    log.info("embed_profile.done", profile_id=profile_id)
