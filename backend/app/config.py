from pathlib import Path

from pydantic_settings import BaseSettings

_ENV_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    app_name: str = "RecycleRegulations"
    debug: bool = False

    google_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    browserbase_api_key: str = ""
    browserbase_project_id: str = ""

    # Yelp Fusion (junk-hauler search)
    yelp_api_key: str = ""

    geoip_url: str = "http://ip-api.com/json"
    geo_max_match_km: float = 150.0  # closest-campus match only within this radius
    rag_top_k: int = 5

    # Redis cache-aside
    redis_enabled: bool = True
    redis_url: str = "redis://localhost:6379/0"
    cache_ttl_ip: int = 604800  # 7 days
    cache_ttl_municipal_rules: int = 86400  # 24 hours
    cache_ttl_disposal_options: int = 43200  # 12 hours

    # Vector search
    embedding_model: str = "gemini-embedding-001"
    embedding_dim: int = 3072
    vector_distance_threshold: float = 0.35

    # Browserbase research
    browserbase_search_num_results: int = 3

    # RRR mobile app integration
    supabase_url: str = ""
    supabase_anon_key: str = ""
    allowed_origins: str = ""
    auth_required: bool = False

    # Sentry error monitoring — captures silent failures behind graceful fallbacks
    sentry_dsn: str = ""
    sentry_environment: str = "local"
    sentry_traces_sample_rate: float = 1.0

    # Arize Phoenix (OSS) observability
    phoenix_enabled: bool = True
    phoenix_collector_endpoint: str = ""
    phoenix_api_key: str = ""
    phoenix_project: str = "rrr-backend"

    # Prompt A/B switch for the eval before/after loop: "baseline" | "v2"
    prompt_variant: str = "baseline"

    @property
    def cors_origins(self) -> list[str]:
        if not self.allowed_origins.strip():
            return ["*"]
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    class Config:
        env_file = (_ENV_DIR / ".env", _ENV_DIR.parent / ".env")


settings = Settings()
