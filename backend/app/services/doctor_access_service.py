"""
Doctor Access & Consent.

Supabase: every rule is enforced in Postgres (security-definer RPCs for writes, RLS for doctor reads — see
migration 20261115000000). This service re-checks the grant's sections before returning anything, so a section
that was not shared is never even requested.

Demo (no Supabase): an in-memory store applying the same rules (one active grant per doctor, 1 h / 24 h / 7 d,
sections, immediate revoke, audit log). Lost on restart.
"""
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.core.security import CurrentUser
from app.schemas.doctor_access import (
    AccessEvent,
    AccessOverview,
    DoctorGrant,
    DoctorIdentity,
    DoctorPatient,
    GrantRequest,
    PatientAccessView,
    VerifiedDoctor,
)
from app.schemas.document import MedicalDocument, PatientLabValue
from app.schemas.patient import PatientRecord
from app.services import document_storage, lab_extraction, patient_service, supabase_repo
from app.services.medical_summary import build_summary


class DoctorNotFound(Exception):
    """Unknown / unverified doctor (or the patient themself)."""


# ─────────────────────────────────────────────────────────── demo store

DEMO_DOCTORS = [{"id": "doc_demo_001", "full_name": "Dr. Alex Test", "doctor_code": "DR-DEMO01"}]


@dataclass
class _Grant:
    patient_id: str
    doctor_id: str
    scopes: list[str]
    expires_at: datetime
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    revoked_at: datetime | None = None

    @property
    def status(self) -> str:
        if self.revoked_at is not None:
            return "revoked"
        return "expired" if self.expires_at <= datetime.now(UTC) else "active"


_grants: list[_Grant] = []
_log: list[dict] = []


def _demo_log(g: _Grant, event: str, section: str | None = None, reason: str | None = None) -> None:
    _log.append({"id": str(len(_log) + 1), "grant_id": g.id, "patient_id": g.patient_id, "doctor_id": g.doctor_id,
                 "event": event, "section": section, "reason": reason, "created_at": datetime.now(UTC).isoformat()})


def _doctor_name(doctor_id: str) -> str | None:
    return next((d["full_name"] for d in DEMO_DOCTORS if d["id"] == doctor_id), None)


def _patient_name(patient_id: str) -> str:
    record = patient_service.get_patient(patient_id)
    return record.full_name if record else ""


def _iso(d: datetime | None) -> str | None:
    return d.isoformat() if d else None


def reset_demo() -> None:
    _grants.clear()
    _log.clear()


# ─────────────────────────────────────────────────────────── patient side

def search_doctors(user: CurrentUser, query: str) -> list[VerifiedDoctor]:
    q = query.strip()
    if settings.supabase_enabled:
        rows = supabase_repo.list_verified_doctors(user, q)
    else:
        rows = [d for d in DEMO_DOCTORS if d["id"] != user.id and (
            not q or q.lower() in d["full_name"].lower() or q.upper() == d["doctor_code"])]
    return [VerifiedDoctor.model_validate(r) for r in rows]


def _resolve_doctor(user: CurrentUser, req: GrantRequest) -> str:
    if req.doctor_id:
        return req.doctor_id
    code = (req.doctor_code or "").strip().upper()
    match = [d for d in search_doctors(user, code) if d.doctor_code == code] if code else []
    if not match:
        raise DoctorNotFound
    return match[0].id


def grant(user: CurrentUser, req: GrantRequest) -> DoctorGrant:
    doctor_id = _resolve_doctor(user, req)
    scopes = sorted(set(req.scopes))
    if settings.supabase_enabled:
        res = supabase_repo.grant_doctor_access(user, doctor_id, scopes, req.duration_hours)
        if res.get("status") != "ok":
            raise DoctorNotFound  # validation of scopes / duration already done by the schema
        return next(g for g in overview(user).grants if g.id == res["grant_id"])
    if doctor_id == user.id or not any(d["id"] == doctor_id for d in DEMO_DOCTORS):
        raise DoctorNotFound
    for old in _grants:
        if old.patient_id == user.id and old.doctor_id == doctor_id and old.status == "active":
            old.revoked_at = datetime.now(UTC)
            _demo_log(old, "revoked", reason="replaced")
    g = _Grant(patient_id=user.id, doctor_id=doctor_id, scopes=scopes,
               expires_at=datetime.now(UTC) + timedelta(hours=req.duration_hours))
    _grants.append(g)
    _demo_log(g, "granted")
    return _demo_grant(g)


def _demo_grant(g: _Grant) -> DoctorGrant:
    code = next((d["doctor_code"] for d in DEMO_DOCTORS if d["id"] == g.doctor_id), None)
    return DoctorGrant(id=g.id, doctor_id=g.doctor_id, doctor_name=_doctor_name(g.doctor_id), doctor_code=code,
                       scopes=g.scopes, created_at=_iso(g.created_at), expires_at=_iso(g.expires_at),
                       revoked_at=_iso(g.revoked_at), status=g.status)


def revoke(user: CurrentUser, grant_id: str) -> bool:
    if settings.supabase_enabled:
        return supabase_repo.revoke_doctor_access(user, grant_id)
    for g in _grants:
        if g.id == grant_id and g.patient_id == user.id and g.status == "active":
            g.revoked_at = datetime.now(UTC)
            _demo_log(g, "revoked")
            return True
    return False


def overview(user: CurrentUser) -> AccessOverview:
    if settings.supabase_enabled:
        data = supabase_repo.patient_doctor_access(user)
        return AccessOverview(
            grants=[DoctorGrant.model_validate(g) for g in data.get("grants", [])],
            events=[AccessEvent.model_validate({**e, "id": str(e["id"])}) for e in data.get("events", [])],
        )
    mine = sorted((g for g in _grants if g.patient_id == user.id), key=lambda g: g.created_at, reverse=True)
    events = [AccessEvent.model_validate({**e, "doctor_name": _doctor_name(e["doctor_id"])})
              for e in reversed(_log) if e["patient_id"] == user.id][:100]
    return AccessOverview(grants=[_demo_grant(g) for g in mine], events=events)


# ─────────────────────────────────────────────────────────── doctor side

def identity(doctor: CurrentUser) -> DoctorIdentity:
    if settings.supabase_enabled:
        return DoctorIdentity.model_validate(supabase_repo.doctor_identity(doctor))
    d = next((d for d in DEMO_DOCTORS if d["id"] == doctor.id), None)
    return DoctorIdentity(full_name=d["full_name"] if d else "", doctor_code=d["doctor_code"] if d else None)


def patients(doctor: CurrentUser, query: str = "") -> list[DoctorPatient]:
    if settings.supabase_enabled:
        rows = [DoctorPatient.model_validate(r) for r in supabase_repo.doctor_patients(doctor)]
    else:
        latest: dict[str, _Grant] = {}
        for g in sorted((g for g in _grants if g.doctor_id == doctor.id), key=lambda g: g.created_at):
            latest[g.patient_id] = g
        rows = [DoctorPatient(patient_id=g.patient_id, full_name=_patient_name(g.patient_id), grant_id=g.id,
                              scopes=g.scopes, created_at=_iso(g.created_at), expires_at=_iso(g.expires_at),
                              revoked_at=_iso(g.revoked_at), status=g.status) for g in latest.values()]
        rows.sort(key=lambda r: r.created_at, reverse=True)
        rows.sort(key=lambda r: r.status != "active")  # active first, newest first
    q = query.strip().lower()
    return [r for r in rows if q in r.full_name.lower()] if q else rows


def _demo_open(doctor: CurrentUser, patient_id: str, section: str) -> dict:
    mine = [g for g in _grants if g.doctor_id == doctor.id and g.patient_id == patient_id]
    if not mine:
        return {"status": "none"}
    g = max(mine, key=lambda g: g.created_at)
    needed = "documents" if section == "document_file" else section
    if g.status != "active":
        status = g.status
    else:
        status = "scope" if needed in ("profile", "documents", "labs") and needed not in g.scopes else "ok"
    _demo_log(g, "viewed" if status == "ok" else "denied", section, None if status == "ok" else status)
    return {"status": status, "patient_name": _patient_name(patient_id), "scopes": g.scopes,
            "expires_at": _iso(g.expires_at)}


def _open(doctor: CurrentUser, patient_id: str, section: str) -> dict:
    if settings.supabase_enabled:
        return supabase_repo.doctor_open_patient(doctor, patient_id, section)
    return _demo_open(doctor, patient_id, section)


def check_section(doctor: CurrentUser, patient_id: str, section: str) -> str:
    """Consent status for one section ('ok' only with an active grant that includes it). Logged either way."""
    return _open(doctor, patient_id, section).get("status", "none")


def collect(doctor: CurrentUser, patient_id: str, scopes: list[str], name: str = "") \
        -> tuple[PatientRecord | None, list[MedicalDocument] | None, list[dict] | None]:
    """Only the granted sections (None = not shared). Call AFTER an 'ok' consent check; RLS re-checks in Supabase."""
    granted = set(scopes)
    if settings.supabase_enabled:
        record = supabase_repo.doctor_patient_record(doctor, patient_id, name) if "profile" in granted else None
        documents = supabase_repo.doctor_patient_documents(doctor, patient_id) if "documents" in granted else None
        labs = supabase_repo.doctor_patient_labs(doctor, patient_id) if "labs" in granted else None
        return record, documents, labs
    full = patient_service.get_patient(patient_id)
    record = full if (full and "profile" in granted) else None
    documents = [_demo_doc(d, patient_id) for d in full.documents] if (full and "documents" in granted) else None
    labs = _demo_labs(patient_id, full.documents if full else []) if "labs" in granted else None
    return record, documents, labs


def documented_facts(doctor: CurrentUser, patient_id: str, scopes: list[str]) -> list[dict] | None:
    """Facts confirmed from imported documents — only with the 'documents' grant (RLS re-checks it). No demo docs."""
    if "documents" not in scopes:
        return None
    from app.services import import_repo
    return [f for f in import_repo.facts_or_empty(doctor, patient_id) if not f.get("is_demo") or not settings.supabase_enabled]


def open_patient(doctor: CurrentUser, patient_id: str) -> PatientAccessView:
    """Everything the doctor may see, or only the status (none / expired / revoked) when consent is not valid."""
    o = _open(doctor, patient_id, "summary")
    status = o.get("status", "none")
    view = PatientAccessView(status=status if status in ("ok", "expired", "revoked", "forbidden") else "none",
                             patient_id=patient_id)
    if view.status in ("ok", "expired", "revoked"):
        view.patient_name, view.scopes, view.expires_at = o.get("patient_name"), o.get("scopes") or [], o.get("expires_at")
    if view.status != "ok":
        return view

    record, documents, labs = collect(doctor, patient_id, view.scopes, view.patient_name or "")
    facts = documented_facts(doctor, patient_id, view.scopes)
    view.summary = build_summary(record, documents, labs, facts)
    view.documents = documents
    view.labs = [PatientLabValue.model_validate(v) for v in labs] if labs is not None else None
    return view


def _demo_doc(doc: MedicalDocument, patient_id: str) -> MedicalDocument:
    return doc.model_copy(update={"file_url": f"/api/v1/doctor-access/patients/{patient_id}/documents/{doc.id}/file"})


def _demo_labs(patient_id: str, docs: list[MedicalDocument]) -> list[dict]:
    titles = {d.id: (d.title, d.uploaded_at[:10]) for d in docs}
    return [{**v, "document_title": titles.get(v["document_id"], (None, None))[0],
             "document_date": titles.get(v["document_id"], (None, None))[1]} for v in lab_extraction.demo_list(patient_id)]


def document_file(doctor: CurrentUser, patient_id: str, document_id: str) -> tuple[str, tuple[bytes, str, str] | None]:
    """(status, file). File only with an active grant that includes 'documents' (logged either way)."""
    o = _open(doctor, patient_id, "document_file")
    status = o.get("status", "none")
    if status != "ok":
        return status, None
    if settings.supabase_enabled:
        return status, supabase_repo.doctor_document_file(doctor, patient_id, document_id)
    local = document_storage.get_document_file(patient_id, document_id)
    return status, ((local[0].read_bytes(), local[1], local[0].name) if local else None)
