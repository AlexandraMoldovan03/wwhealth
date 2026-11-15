"""Authentication with Supabase Auth.

- Supabase configured (SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY): every request needs
  `Authorization: Bearer <Supabase access token>`. The JWT is verified with the project's public
  JWKS (asymmetric keys: issuer, audience "authenticated", expiry). The token is kept on the user so
  data calls run under the user's identity and Postgres RLS applies.
- Not configured: demo mode — everyone is the demo patient (tests, MOCK development).
"""
import threading
import time
from functools import lru_cache
from typing import Literal

import httpx
import jwt
from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.demo_data import DEMO_PATIENT_ID

Role = Literal["patient", "doctor"]
JWT_ALGORITHMS = ["ES256", "RS256", "EdDSA"]


class CurrentUser(BaseModel):
    id: str
    role: Role
    # Email from the token (informational; Postgres checks the confirmed email in auth.users itself).
    email: str | None = None
    # Supabase access token of this request (None in demo mode). Never logged or returned.
    access_token: str | None = Field(default=None, repr=False, exclude=True)
    # Authenticator assurance level of this session ("aal1" password/OAuth, "aal2" after TOTP).
    aal: str | None = None
    # Unix time of the newest sign-in step of this session (from the `amr` claim). A token refresh does
    # NOT change it, and a local Face ID unlock never reaches the server, so it is a real re-authentication.
    auth_time: int | None = None


STEP_UP_HEADER = "X-WWHealth-Step-Up"
MFA_REQUIRED = "Two-factor verification required"
DOCTOR_MFA_REQUIRED = "Two-factor authentication required for doctor accounts"
REAUTH_REQUIRED = "Recent sign-in required"


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"})


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    base = settings.supabase_url.rstrip("/")
    return jwt.PyJWKClient(f"{base}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600)


def verify_supabase_token(token: str) -> dict:
    """Claims of a valid Supabase access token, else 401."""
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=JWT_ALGORITHMS,
            audience="authenticated",
            issuer=f"{settings.supabase_url.rstrip('/')}/auth/v1",
            options={"require": ["exp", "sub", "aud", "iss"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorized("Session expired") from exc
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        raise _unauthorized("Invalid token") from exc


def _bearer(authorization: str | None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized()
    return token.strip()


def auth_time_from_claims(claims: dict) -> int | None:
    amr = claims.get("amr")
    if not isinstance(amr, list):
        return None
    stamps = [int(e["timestamp"]) for e in amr
              if isinstance(e, dict) and isinstance(e.get("timestamp"), (int, float)) and not isinstance(e.get("timestamp"), bool)]
    return max(stamps) if stamps else None


def get_token_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    """Valid token → user, WITHOUT the MFA gate (only for the security status endpoint)."""
    if not settings.supabase_enabled:
        return CurrentUser(id=DEMO_PATIENT_ID, role="patient", aal="aal1")
    token = _bearer(authorization)
    claims = verify_supabase_token(token)
    # Informational only (user_metadata is client-editable); authoritative role checks read public.profiles.
    meta_role = (claims.get("user_metadata") or {}).get("role")
    aal = claims.get("aal") if claims.get("aal") in ("aal1", "aal2") else None
    return CurrentUser(id=claims["sub"], role="doctor" if meta_role == "doctor" else "patient",
                       email=claims.get("email"), access_token=token, aal=aal, auth_time=auth_time_from_claims(claims))


# ─────────────────────────────────────────────────────────── MFA (Supabase TOTP)

FACTOR_CACHE_SECONDS = 60
_factor_cache: dict[str, tuple[float, bool]] = {}
_factor_lock = threading.Lock()


def invalidate_factor_cache(user_id: str | None = None) -> None:
    with _factor_lock:
        if user_id is None:
            _factor_cache.clear()
        else:
            _factor_cache.pop(user_id, None)


def has_verified_factor(user: CurrentUser) -> bool:
    """Whether the account has a verified MFA factor (read from Supabase Auth with the user's own token).

    Fails closed: if Supabase Auth cannot answer, the request is refused instead of skipping MFA.
    """
    now = time.monotonic()
    with _factor_lock:
        cached = _factor_cache.get(user.id)
    if cached and now - cached[0] < FACTOR_CACHE_SECONDS:
        return cached[1]
    try:
        res = httpx.get(f"{settings.supabase_url.rstrip('/')}/auth/v1/user", timeout=httpx.Timeout(8.0, connect=4.0),
                        headers={"apikey": settings.supabase_publishable_key, "Authorization": f"Bearer {user.access_token}"})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Authentication service unavailable") from exc
    if res.status_code in (401, 403):
        raise _unauthorized("Session expired")
    if res.status_code != 200:
        raise HTTPException(status_code=503, detail="Authentication service unavailable")
    factors = (res.json() or {}).get("factors") or []
    verified = any(isinstance(f, dict) and f.get("status") == "verified" and f.get("factor_type") != "recovery_code"
                   for f in factors)
    with _factor_lock:
        _factor_cache[user.id] = (now, verified)
    return verified


def _step_up(detail: str, kind: str) -> HTTPException:
    return HTTPException(status_code=403, detail=detail, headers={STEP_UP_HEADER: kind})


def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    user = get_token_user(authorization)
    # Accounts with MFA must finish the TOTP step: a stolen password alone (aal1) opens nothing here.
    if settings.supabase_enabled and user.aal != "aal2" and has_verified_factor(user):
        raise _step_up(MFA_REQUIRED, "mfa")
    return user


def require_recent_auth(user: CurrentUser) -> CurrentUser:
    """High-risk actions need a real sign-in no older than `sensitive_reauth_max_age_minutes`."""
    max_age = settings.sensitive_reauth_max_age_minutes
    if not settings.supabase_enabled or max_age <= 0:
        return user
    if user.auth_time is None or time.time() - user.auth_time > max_age * 60:
        raise _step_up(REAUTH_REQUIRED, "reauth")
    return user


def get_sensitive_user(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return require_recent_auth(user)


def get_current_doctor(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not settings.supabase_enabled:
        return CurrentUser(id="doc_demo_001", role="doctor")
    user = get_current_user(authorization)
    from app.services import supabase_repo  # local import: avoids an import cycle

    if supabase_repo.get_role(user) != "doctor":
        raise HTTPException(status_code=403, detail="Doctor account required")
    # Optional policy: doctors must have TOTP enabled (an enrolled doctor at aal1 is already stopped above).
    if settings.doctor_mfa_required and user.aal != "aal2":
        raise _step_up(DOCTOR_MFA_REQUIRED, "mfa-enroll")
    return user.model_copy(update={"role": "doctor"})


def get_sensitive_doctor(doctor: CurrentUser = Depends(get_current_doctor)) -> CurrentUser:
    return require_recent_auth(doctor)
