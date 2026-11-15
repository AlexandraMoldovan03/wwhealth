"""
Account security status for the app's Settings → Security screen and step-up prompts.

GET /security/status → assurance level, whether TOTP is enrolled, age of the last real sign-in and the
policies the server enforces. No secrets, tokens or medical data. Works for an aal1 session of an MFA
account (that is how the app learns it must ask for the TOTP code).
"""
import time

from fastapi import APIRouter, Depends, Response

from app.core.config import settings
from app.core import security
from app.core.security import CurrentUser, get_token_user
from app.schemas.base import CamelModel

router = APIRouter(prefix="/security", tags=["security"])


class SecurityStatus(CamelModel):
    aal: str | None
    mfa_enrolled: bool
    mfa_satisfied: bool
    auth_age_seconds: int | None
    recent_auth: bool
    reauth_max_age_seconds: int
    doctor_mfa_required: bool


@router.get("/status", response_model=SecurityStatus)
def status(response: Response, user: CurrentUser = Depends(get_token_user)) -> SecurityStatus:
    response.headers["Cache-Control"] = "no-store, private"
    max_age = max(0, settings.sensitive_reauth_max_age_minutes) * 60
    if not settings.supabase_enabled:
        return SecurityStatus(aal=None, mfa_enrolled=False, mfa_satisfied=True, auth_age_seconds=None,
                              recent_auth=True, reauth_max_age_seconds=max_age, doctor_mfa_required=False)
    enrolled = security.has_verified_factor(user)
    age = int(time.time() - user.auth_time) if user.auth_time else None
    recent = max_age == 0 or (age is not None and age <= max_age)
    return SecurityStatus(aal=user.aal, mfa_enrolled=enrolled, mfa_satisfied=(not enrolled) or user.aal == "aal2",
                          auth_age_seconds=age, recent_auth=recent, reauth_max_age_seconds=max_age,
                          doctor_mfa_required=settings.doctor_mfa_required)
