"""Authentication with Supabase Auth.

- Supabase configured (SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY): every request needs
  `Authorization: Bearer <Supabase access token>`. The JWT is verified with the project's public
  JWKS (asymmetric keys: issuer, audience "authenticated", expiry). The token is kept on the user so
  data calls run under the user's identity and Postgres RLS applies.
- Not configured: demo mode — everyone is the demo patient (tests, MOCK development).
"""
from functools import lru_cache
from typing import Literal

import jwt
from fastapi import Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.demo_data import DEMO_PATIENT_ID

Role = Literal["patient", "doctor"]
JWT_ALGORITHMS = ["ES256", "RS256", "EdDSA"]


class CurrentUser(BaseModel):
    id: str
    role: Role
    # Supabase access token of this request (None in demo mode). Never logged or returned.
    access_token: str | None = Field(default=None, repr=False, exclude=True)


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


def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not settings.supabase_enabled:
        return CurrentUser(id=DEMO_PATIENT_ID, role="patient")
    token = _bearer(authorization)
    claims = verify_supabase_token(token)
    # Informational only (user_metadata is client-editable); authoritative role checks read public.profiles.
    meta_role = (claims.get("user_metadata") or {}).get("role")
    return CurrentUser(id=claims["sub"], role="doctor" if meta_role == "doctor" else "patient", access_token=token)


def get_current_doctor(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not settings.supabase_enabled:
        return CurrentUser(id="doc_demo_001", role="doctor")
    user = get_current_user(authorization)
    from app.services import supabase_repo  # local import: avoids an import cycle

    if supabase_repo.get_role(user) != "doctor":
        raise HTTPException(status_code=403, detail="Doctor account required")
    return user.model_copy(update={"role": "doctor"})
