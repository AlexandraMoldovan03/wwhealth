"""
Emergency Medical Passport — token handling (FastAPI side) + DEMO store.

- The token is `secrets.token_urlsafe(32)` (256 bits). It carries no data; only its SHA-256 is stored.
- Validation happens on the server: the doctor's app sends the scanned token, FastAPI hashes it and
  the database consumes it atomically (Supabase RPC `redeem_emergency_token`, see
  supabase/migrations/20261113000100_emergency_passport.sql). The DEMO store below has the same semantics
  and the same result shape (`{"status": ..., ...}`), so the routes don't care which one runs.
"""
import hashlib
import secrets
import threading
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from pydantic import ValidationError

from app.schemas.emergency import EmergencyAllergy, EmergencyCondition, EmergencyData, EmergencyMedication
from app.services import lab_extraction, patient_service
from app.services.emergency_passport import build_passport

TTL = timedelta(minutes=5)
QR_PREFIX = "wwhealth://emergency/"


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def parse_token(raw: str) -> str:
    """Accepts the raw token or the full QR payload."""
    raw = raw.strip()
    return raw[len(QR_PREFIX):] if raw.lower().startswith(QR_PREFIX) else raw


def _models(raw: object, model: type) -> list:
    out = []
    for item in raw if isinstance(raw, list) else []:
        try:
            out.append(model.model_validate(item))
        except ValidationError:
            continue
    return out


def emergency_data(result: dict) -> EmergencyData:
    """RPC / demo result → only the 4 emergency fields (active conditions and medication)."""
    conditions = [c for c in result.get("conditions") or [] if isinstance(c, dict) and c.get("status") != "resolved"]
    medications = [m for m in result.get("medications") or [] if isinstance(m, dict) and m.get("active", True)]
    return EmergencyData(
        blood_type=result.get("blood_type"),
        allergies=_models(result.get("allergies"), EmergencyAllergy),
        conditions=_models(conditions, EmergencyCondition),
        medications=_models(medications, EmergencyMedication),
        accessed_at=str(result.get("accessed_at")),
        passport=emergency_passport(result),
    )


def emergency_passport(result: dict):
    """Doctor / guardian view: profile + confirmed labs, prioritised; normal labs stay out of the emergency screen."""
    labs = result.get("labs") if isinstance(result.get("labs"), list) else []
    passport = build_passport(result, facts=None, labs=[r for r in labs if isinstance(r, dict)])
    passport.normal_labs = []
    return passport


# ─────────────────────────────────────────────────────────── DEMO store (no Supabase)

@dataclass
class _Token:
    id: str
    patient_id: str
    token_hash: str
    expires_at: datetime
    used_at: datetime | None = None
    revoked_at: datetime | None = None


@dataclass
class _Store:
    tokens: dict[str, _Token] = field(default_factory=dict)  # by hash
    log: list[dict] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)


_store = _Store()


def _log(event: str, token: _Token | None, actor_id: str, reason: str | None = None, actor_name: str | None = None,
         patient_id: str | None = None):
    _store.log.append({
        "id": str(len(_store.log) + 1), "event": event, "reason": reason, "actor_id": actor_id,
        "actor_name": actor_name, "patient_id": token.patient_id if token else patient_id,
        "token_id": token.id if token else None,
        "created_at": datetime.now(UTC).isoformat(),
    })


def demo_create(patient_id: str, token_hash: str, actor_id: str | None = None, actor_name: str | None = None) -> dict:
    """`actor_*` set when an emergency guardian generates the patient's QR (default: the patient)."""
    now = datetime.now(UTC)
    with _store.lock:
        for t in _store.tokens.values():
            if t.patient_id == patient_id and not t.used_at and not t.revoked_at and t.expires_at > now:
                t.revoked_at = now
        token = _Token(id=str(uuid.uuid4()), patient_id=patient_id, token_hash=token_hash, expires_at=now + TTL)
        _store.tokens[token_hash] = token
        _log("created", token, actor_id or patient_id, actor_name=actor_name)
    return {"token_id": token.id, "expires_at": token.expires_at.isoformat()}


def demo_revoke_by_actor(patient_id: str, actor_id: str) -> None:
    """Guardian access withdrawn → their still-unused QR codes for this patient stop working."""
    now = datetime.now(UTC)
    with _store.lock:
        created = {e.get("token_id") for e in _store.log if e["event"] == "created" and e["actor_id"] == actor_id}
        for t in _store.tokens.values():
            if t.patient_id == patient_id and t.id in created and not t.used_at and not t.revoked_at and t.expires_at > now:
                t.revoked_at = now
        _log("revoked", None, actor_id, "guardian_access", patient_id=patient_id)


def demo_revoke(patient_id: str, token_id: str) -> bool:
    with _store.lock:
        for t in _store.tokens.values():
            if t.id == token_id and t.patient_id == patient_id and not t.used_at and not t.revoked_at:
                t.revoked_at = datetime.now(UTC)
                _log("revoked", t, patient_id)
                return True
    return False


def demo_token_status(patient_id: str, token_id: str) -> str:
    now = datetime.now(UTC)
    with _store.lock:
        token = next((item for item in _store.tokens.values() if item.id == token_id and item.patient_id == patient_id), None)
        if token is None:
            return "not_found"
        if token.used_at:
            return "used"
        if token.revoked_at:
            return "revoked"
        if token.expires_at <= now:
            return "expired"
        return "active"


def demo_redeem(doctor_id: str, token_hash: str, doctor_name: str = "Demo Doctor") -> dict:
    now = datetime.now(UTC)
    with _store.lock:
        t = _store.tokens.get(token_hash)
        if t is None:
            _log("denied", None, doctor_id, "not_found", doctor_name)
            return {"status": "not_found"}
        if t.revoked_at or t.used_at or t.expires_at <= now:
            reason = "revoked" if t.revoked_at else "used" if t.used_at else "expired"
            _log("denied", t, doctor_id, reason, doctor_name)
            return {"status": reason}
        t.used_at = now
        _log("viewed", t, doctor_id, None, doctor_name)
    record = patient_service.get_patient(t.patient_id)
    return {
        "status": "ok", "accessed_at": now.isoformat(),
        "blood_type": record.blood_type if record else None,
        "allergies": [a.model_dump() for a in record.allergies] if record else [],
        "conditions": [d.model_dump() for d in record.diagnoses] if record else [],
        "medications": [m.model_dump() for m in record.treatments] if record else [],
        "surgeries": [s.model_dump() for s in record.surgeries] if record else [],
        "labs": lab_extraction.demo_list(t.patient_id),
    }


def demo_log_view(patient_id: str, actor_id: str, actor_name: str | None) -> None:
    """An emergency guardian opened the passport (visible in the patient's audit log)."""
    with _store.lock:
        _log("viewed", None, actor_id, None, actor_name, patient_id=patient_id)


def demo_doctor_accesses(doctor_id: str, limit: int = 50) -> list[dict]:
    rows = [e for e in _store.log if e["actor_id"] == doctor_id and e["event"] in ("viewed", "denied")]
    return list(reversed(rows))[:limit]


def demo_audit(patient_id: str, limit: int = 20) -> list[dict]:
    rows = [e for e in _store.log if e["patient_id"] == patient_id]
    return list(reversed(rows))[:limit]
