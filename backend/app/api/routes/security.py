"""
Account security status for the app's step-up checks.

GET /security/status → age of the last real sign-in and whether high-risk actions are allowed without
re-authentication. No secrets, tokens or medical data.
"""
import time

from fastapi import APIRouter, Depends, Response

from app.core.config import settings
from app.core.security import CurrentUser, get_current_user
from app.schemas.base import CamelModel

router = APIRouter(prefix="/security", tags=["security"])


class SecurityStatus(CamelModel):
    auth_age_seconds: int | None
    recent_auth: bool
    reauth_max_age_seconds: int


@router.get("/status", response_model=SecurityStatus)
def status(response: Response, user: CurrentUser = Depends(get_current_user)) -> SecurityStatus:
    response.headers["Cache-Control"] = "no-store, private"
    max_age = max(0, settings.sensitive_reauth_max_age_minutes) * 60
    if not settings.supabase_enabled:
        return SecurityStatus(auth_age_seconds=None, recent_auth=True, reauth_max_age_seconds=max_age)
    age = int(time.time() - user.auth_time) if user.auth_time else None
    recent = max_age == 0 or (age is not None and age <= max_age)
    return SecurityStatus(auth_age_seconds=age, recent_auth=recent, reauth_max_age_seconds=max_age)
