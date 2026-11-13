"""Settings loaded from environment / backend/.env. Import `settings` anywhere."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    app_name: str = "WWHealth API"
    version: str = "0.1.0"
    app_env: str = "development"
    cors_origins: str = "*"

    database_url: str = ""

    auth0_domain: str = ""
    auth0_audience: str = ""

    gemini_api_key: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""

    use_ai_model: bool = False
    access_token_max_ttl_minutes: int = 240

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
