from urllib.parse import urlparse

from fastapi import APIRouter

from app.core.config import settings
from app.schemas.common import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    project = urlparse(settings.supabase_url).hostname.split(".")[0] if settings.supabase_enabled else None
    return HealthResponse(version=settings.version, data_mode="supabase" if settings.supabase_enabled else "demo",
                          supabase_project=project)
