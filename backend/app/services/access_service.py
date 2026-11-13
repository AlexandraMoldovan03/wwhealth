"""QR Medical Passport tokens.

DEMO: tokens live in memory (lost on restart).
TODO(backend): store a HASH of the token in PostgreSQL (patient_id, scopes, expires_at, redeemed_by, revoked).
"""
import secrets
import string
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.schemas.access import AccessScope

ALPHABET = string.ascii_uppercase + string.digits


@dataclass
class Grant:
    patient_id: str
    scopes: list[AccessScope]
    expires_at: datetime


_grants: dict[str, Grant] = {}


def _new_token() -> str:
    part = lambda: "".join(secrets.choice(ALPHABET) for _ in range(4))  # noqa: E731
    return f"WWH-{part()}-{part()}"


def create_grant(patient_id: str, scopes: list[AccessScope], ttl_minutes: int) -> tuple[str, Grant]:
    ttl = min(ttl_minutes, settings.access_token_max_ttl_minutes)
    token = _new_token()
    grant = Grant(patient_id=patient_id, scopes=scopes, expires_at=datetime.now(UTC) + timedelta(minutes=ttl))
    _grants[token] = grant
    return token, grant


def redeem(token: str) -> tuple[str, Grant] | None:
    """Returns (access_id, grant) or None if unknown/expired."""
    token = token.strip().upper().removeprefix("WWHEALTH://ACCESS/")
    grant = _grants.get(token)
    if not grant or grant.expires_at < datetime.now(UTC):
        return None
    return f"acc_{uuid.uuid4().hex[:10]}", grant
