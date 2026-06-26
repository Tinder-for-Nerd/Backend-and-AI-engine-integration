from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase
    supabase_url: str = Field(..., alias="SUPABASE_URL")
    supabase_anon_key: str = Field(..., alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_jwt_secret: str = Field(..., alias="SUPABASE_JWT_SECRET")

    # OpenAI
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")

    # Redis
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # App
    app_env: str = Field(default="development", alias="APP_ENV")
    allowed_origins: str = Field(default="http://localhost:5173", alias="ALLOWED_ORIGINS")

    # Sentry
    sentry_dsn: str = Field(default="", alias="SENTRY_DSN")

    # Jitsi
    jitsi_app_id: str = Field(default="", alias="JITSI_APP_ID")
    jitsi_app_secret: str = Field(default="", alias="JITSI_APP_SECRET")

    # Ranker weights (sum = 1.0)
    ranker_cosine_weight: float = 0.45
    ranker_jaccard_weight: float = 0.25
    ranker_intent_weight: float = 0.10
    ranker_locality_weight: float = 0.10
    ranker_recency_weight: float = 0.05
    ranker_badge_weight: float = 0.05
    ranker_mmr_lambda: float = 0.70

    # Discovery
    discovery_candidate_limit: int = 200
    discovery_feed_size: int = 20

    # Rate limits (per minute unless noted)
    rate_like_per_day: int = 100
    rate_message_per_minute: int = 30
    rate_ai_per_hour: int = 20

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


settings = Settings()  # type: ignore[call-arg]
