from authlib.integrations.starlette_client import OAuth

from app.config import settings

oauth = OAuth()
_oauth_registered = False


def register_oauth_providers() -> None:
    global _oauth_registered
    if _oauth_registered:
        return

    if settings.google_client_id and settings.google_client_secret:
        oauth.register(
            name="google",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )

    if settings.linkedin_client_id and settings.linkedin_client_secret:
        oauth.register(
            name="linkedin",
            client_id=settings.linkedin_client_id,
            client_secret=settings.linkedin_client_secret,
            server_metadata_url="https://www.linkedin.com/oauth/.well-known/openid-configuration",
            client_kwargs={"scope": "openid profile email"},
        )

    _oauth_registered = True


def google_configured() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def linkedin_configured() -> bool:
    return bool(settings.linkedin_client_id and settings.linkedin_client_secret)
