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

    # Supabase (Auth + Postgres + Storage). Empty URL/key = demo mode: in-memory data, demo user.
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    # Backend-only, never sent to the app or logged. Not needed for user requests (they run under RLS).
    supabase_secret_key: str = ""
    supabase_documents_bucket: str = "medical-documents"

    gemini_api_key: str = ""
    # AI Medical Intelligence (Google Gen AI SDK). Any text model the key can use; override in backend/.env.
    gemini_summary_model: str = "gemini-3.5-flash-lite"
    gemini_timeout_seconds: float = 30.0
    ai_summary_per_user_per_hour: int = 6
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""

    use_ai_model: bool = False
    # LungVision checkpoint (never shipped in the Expo app). Relative paths are resolved from backend/.
    lungvision_weights_path: Path = BACKEND_DIR / "models" / "lungvision_best.pth"
    # Private document storage (never served statically). Relative paths are resolved from backend/.
    documents_storage_dir: Path = BACKEND_DIR / "storage" / "documents"
    access_token_max_ttl_minutes: int = 240

    @property
    def supabase_enabled(self) -> bool:
        return bool(self.supabase_url and self.supabase_publishable_key)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
