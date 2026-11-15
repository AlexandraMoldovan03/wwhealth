"""
Emergency guardians: a patient invites a family member's account by email; once that account accepts,
it can open ONLY the patient's emergency data and generate the patient's 5-minute emergency QR.

Supabase: security-definer RPCs (supabase/migrations/20261120000000_emergency_guardians.sql).
Demo (no Supabase): in-memory store with the same rules and result shapes.
"""
import re
import threading
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.core.config import settings
from app.core.security import CurrentUser
from app.schemas.emergency_guardians import (
    GuardianEmergencyView,
    GuardianInvitation,
    GuardianLink,
    GuardianOverview,
    ProtectedPatient,
)
from app.schemas.patient import EmergencyContact
from app.services import emergency_service as es
from app.services import lab_extraction, patient_service, supabase_repo

MAX_GUARDIANS = 5
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class InviteRejected(Exception):
    def __init__(self, status: str):
        super().__init__(status)
        self.status = status


def normalize_email(raw: str) -> str:
    return raw.strip().lower()


# ─────────────────────────────────────────────────────────── DEMO store

@dataclass
class _Link:
    id: str
    patient_id: str
    patient_name: str
    invite_email: str
    relation: str
    status: str = "pending"
    guardian_id: str | None = None
    guardian_name: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    responded_at: str | None = None


@dataclass
class _Store:
    links: list[_Link] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)


_store = _Store()


def reset_demo() -> None:
    global _store
    _store = _Store()


def _name(user_id: str) -> str:
    record = patient_service.get_patient(user_id)
    return record.full_name if record else ""


def _open(link: _Link) -> bool:
    return link.status in ("pending", "active")


def _demo_invite(user: CurrentUser, email: str, relation: str) -> dict:
    with _store.lock:
        if user.email and normalize_email(user.email) == email:
            return {"status": "self"}
        mine = [link for link in _store.links if link.patient_id == user.id and _open(link)]
        if any(link.invite_email == email for link in mine):
            return {"status": "duplicate"}
        if len(mine) >= MAX_GUARDIANS:
            return {"status": "limit"}
        link = _Link(id=str(uuid.uuid4()), patient_id=user.id, patient_name=_name(user.id),
                     invite_email=email, relation=relation)
        _store.links.append(link)
    return {"status": "ok", "id": link.id}


def _demo_revoke(user: CurrentUser, link_id: str) -> bool:
    with _store.lock:
        for link in _store.links:
            if link.id == link_id and link.patient_id == user.id and _open(link):
                was_active, link.status = link.status == "active", "revoked"
                break
        else:
            return False
    if was_active and link.guardian_id:
        es.demo_revoke_by_actor(link.patient_id, link.guardian_id)
    return True


def _demo_respond(user: CurrentUser, link_id: str, accept: bool) -> dict:
    email = normalize_email(user.email) if user.email else None
    now = datetime.now(UTC).isoformat()
    with _store.lock:
        for link in _store.links:
            if link.id != link_id:
                continue
            invited = link.status == "pending" and email is not None and link.invite_email == email
            if accept and invited and link.patient_id != user.id:
                link.status, link.guardian_id, link.responded_at = "active", user.id, now
                link.guardian_name = _name(user.id) or None
                return {"status": "ok"}
            if not accept and (invited or (link.status == "active" and link.guardian_id == user.id)):
                was_active = link.status == "active"
                link.status, link.responded_at = "declined", now
                break
        else:
            return {"status": "not_found"}
    if was_active:
        es.demo_revoke_by_actor(link.patient_id, user.id)
    return {"status": "ok"}


def _latest_declined(link: _Link, links: list[_Link]) -> bool:
    """A declined invitation stays visible to the patient until a newer one is sent to the same email."""
    if link.status != "declined":
        return False
    same = [x for x in links if x.patient_id == link.patient_id and x.invite_email == link.invite_email]
    return same[-1] is link


def _demo_overview(user: CurrentUser) -> dict:
    email = normalize_email(user.email) if user.email else None
    with _store.lock:
        links = list(_store.links)
    return {
        "guardians": [{
            "id": x.id, "email": x.invite_email, "relation": x.relation, "status": x.status,
            "guardian_name": x.guardian_name if x.status == "active" else None,
            "created_at": x.created_at, "responded_at": x.responded_at,
        } for x in reversed(links) if x.patient_id == user.id and (_open(x) or _latest_declined(x, links))],
        "invitations": [{
            "id": x.id, "patient_name": x.patient_name, "relation": x.relation, "created_at": x.created_at,
        } for x in reversed(links)
            if x.status == "pending" and email is not None and x.invite_email == email and x.patient_id != user.id],
        "protecting": [{
            "id": x.id, "patient_id": x.patient_id, "patient_name": x.patient_name, "relation": x.relation,
            "since": x.responded_at,
        } for x in links if x.status == "active" and x.guardian_id == user.id],
    }


def _demo_active(user: CurrentUser, patient_id: str) -> bool:
    with _store.lock:
        return any(x.patient_id == patient_id and x.guardian_id == user.id and x.status == "active" for x in _store.links)


def _demo_view(user: CurrentUser, patient_id: str) -> dict:
    if not _demo_active(user, patient_id):
        return {"status": "none"}
    es.demo_log_view(patient_id, user.id, _name(user.id) or None)
    record = patient_service.get_patient(patient_id)
    return {
        "status": "ok", "accessed_at": datetime.now(UTC).isoformat(),
        "patient_name": record.full_name if record else "",
        "blood_type": record.blood_type if record else None,
        "allergies": [a.model_dump() for a in record.allergies] if record else [],
        "conditions": [d.model_dump() for d in record.diagnoses] if record else [],
        "medications": [m.model_dump() for m in record.treatments] if record else [],
        "emergency_contact": record.emergency_contact.model_dump() if record and record.emergency_contact else None,
        "surgeries": [s.model_dump() for s in record.surgeries] if record else [],
        "labs": lab_extraction.demo_list(patient_id),
    }


def _demo_create_token(user: CurrentUser, patient_id: str, token_hash: str) -> dict:
    if not _demo_active(user, patient_id):
        return {"status": "none"}
    created = es.demo_create(patient_id, token_hash, actor_id=user.id, actor_name=_name(user.id) or None)
    return {"status": "ok", **created}


# ─────────────────────────────────────────────────────────── public API (Supabase or demo)

def invite(user: CurrentUser, email: str, relation: str) -> str:
    email = normalize_email(email)
    relation = relation.strip()[:40]
    if not EMAIL_RE.match(email) or len(email) > 254:
        raise InviteRejected("invalid_email")
    if settings.supabase_enabled:
        result = supabase_repo.invite_emergency_guardian(user, email, relation)
    else:
        result = _demo_invite(user, email, relation)
    status = result.get("status") if isinstance(result, dict) else None
    if status != "ok":
        raise InviteRejected(status or "unexpected")
    return str(result["id"])


def revoke(user: CurrentUser, link_id: str) -> bool:
    if settings.supabase_enabled:
        return supabase_repo.revoke_emergency_guardian(user, link_id)
    return _demo_revoke(user, link_id)


def respond(user: CurrentUser, link_id: str, accept: bool) -> bool:
    if settings.supabase_enabled:
        result = supabase_repo.respond_emergency_guardian(user, link_id, accept)
    else:
        result = _demo_respond(user, link_id, accept)
    return isinstance(result, dict) and result.get("status") == "ok"


def overview(user: CurrentUser) -> GuardianOverview:
    raw = supabase_repo.my_emergency_guardians(user) if settings.supabase_enabled else _demo_overview(user)
    raw = raw if isinstance(raw, dict) else {}
    return GuardianOverview(
        guardians=[GuardianLink.model_validate({**r, "created_at": str(r["created_at"]),
                                                "responded_at": str(r["responded_at"]) if r.get("responded_at") else None})
                   for r in raw.get("guardians") or [] if r.get("status") in ("pending", "active", "declined")],
        invitations=[GuardianInvitation.model_validate({**r, "patient_name": r.get("patient_name") or "",
                                                        "created_at": str(r["created_at"])})
                     for r in raw.get("invitations") or []],
        protecting=[ProtectedPatient.model_validate({**r, "patient_id": str(r["patient_id"]),
                                                     "patient_name": r.get("patient_name") or "",
                                                     "since": str(r["since"]) if r.get("since") else None})
                    for r in raw.get("protecting") or []],
    )


def emergency_view(user: CurrentUser, patient_id: str) -> GuardianEmergencyView | None:
    """None when the caller is not an ACTIVE guardian of this patient (existence is not revealed)."""
    if settings.supabase_enabled:
        result = supabase_repo.guardian_emergency_view(user, patient_id)
    else:
        result = _demo_view(user, patient_id)
    if not isinstance(result, dict) or result.get("status") != "ok":
        return None
    data = es.emergency_data(result)  # same filtering as the doctor view: active conditions / medication only
    contact = result.get("emergency_contact")
    try:
        contact_model = EmergencyContact.model_validate(contact) if isinstance(contact, dict) else None
    except ValueError:
        contact_model = None
    return GuardianEmergencyView(
        patient_name=result.get("patient_name") or "",
        blood_type=data.blood_type, allergies=data.allergies, conditions=data.conditions,
        medications=data.medications, emergency_contact=contact_model, accessed_at=data.accessed_at,
        passport=data.passport,
    )


def create_token(user: CurrentUser, patient_id: str, token_hash: str) -> dict | None:
    if settings.supabase_enabled:
        result = supabase_repo.guardian_create_emergency_token(user, patient_id, token_hash)
    else:
        result = _demo_create_token(user, patient_id, token_hash)
    if not isinstance(result, dict) or result.get("status") != "ok":
        return None
    return result
