"""
Medical data in Supabase (Postgres via PostgREST + private Storage), used when Supabase is configured.

Every call runs with the *user's* access token (apikey = publishable key, Authorization = user JWT),
so Postgres RLS and the Storage policies decide what is visible: a user can only read or write rows
and files under their own id. The secret key is never used here.

Tables (supabase/migrations/20261113000000_medical_core.sql):
  profiles, medical_profiles, medical_documents, lungvision_analyses; bucket `medical-documents`.
History is derived (documents, conditions, medication, saved LungVision results) — no extra table.
"""
import re
import uuid

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.core.security import CurrentUser
from app.schemas.document import MedicalDocument
from app.schemas.patient import Allergy, Diagnosis, EmergencyContact, MedicalEvent, PatientRecord, ProfileUpdate, Treatment
from app.services.document_storage import EXTENSIONS, TYPE_LABELS, InvalidDocumentError, detect_mime
from app.services.patient_service import apply_profile_update

UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")
TIMEOUT = httpx.Timeout(20.0, connect=5.0)


class SupabaseError(RuntimeError):
    """Supabase unreachable or returned an unexpected error (→ 502). Message is safe to show."""


class SupabaseAuthError(SupabaseError):
    """Supabase rejected the user's token (→ 401)."""


# ─────────────────────────────────────────────────────────── HTTP helpers

def _base() -> str:
    return settings.supabase_url.rstrip("/")


def _headers(user: CurrentUser, **extra: str) -> dict[str, str]:
    if not user.access_token:
        raise SupabaseAuthError("Not authenticated")
    return {"apikey": settings.supabase_publishable_key, "Authorization": f"Bearer {user.access_token}", **extra}


def _request(method: str, url: str, user: CurrentUser, *, expected: tuple[int, ...] = (200,), **kwargs) -> httpx.Response:
    headers = _headers(user, **kwargs.pop("headers", {}))
    try:
        response = httpx.request(method, url, headers=headers, timeout=TIMEOUT, **kwargs)
    except httpx.HTTPError as exc:
        raise SupabaseError("Database unavailable") from exc
    if response.status_code in (400, 401, 403) and "jwt" in response.text.lower():
        raise SupabaseAuthError("Session expired")
    if response.status_code not in expected:
        # Body may contain row data / hints → never forwarded to the client.
        raise SupabaseError(f"Database error ({response.status_code})")
    return response


def _rest(table: str) -> str:
    return f"{_base()}/rest/v1/{table}"


def _storage(path: str) -> str:
    return f"{_base()}/storage/v1/object/{settings.supabase_documents_bucket}/{path}"


# ─────────────────────────────────────────────────────────── mapping

def _items(raw: object, model: type) -> list:
    """jsonb list → models; malformed items are skipped instead of breaking the whole profile."""
    out = []
    for item in raw if isinstance(raw, list) else []:
        try:
            out.append(model.model_validate(item))
        except ValidationError:
            continue
    return out


def _document(row: dict) -> MedicalDocument:
    return MedicalDocument(
        id=row["id"],
        title=row["title"],
        type=row["document_type"],
        uploaded_at=row["uploaded_at"],
        file_url=f"/api/v1/documents/{row['id']}/file",
        mime_type=row["mime_type"],
        size_bytes=row["size_bytes"],
        status="uploaded",
        is_demo=False,
    )


def _history(record: PatientRecord, analyses: list[dict]) -> list[MedicalEvent]:
    events: list[MedicalEvent] = []
    for doc in record.documents:
        label = TYPE_LABELS.get(doc.type, "Document")
        events.append(MedicalEvent(
            id=f"ev_doc_{doc.id}", type="document", title=doc.title, description=f"{label} uploaded.",
            date=doc.uploaded_at, document_id=doc.id,
            details={
                "Type": label,
                "Format": "PDF" if doc.mime_type == "application/pdf" else "Image",
                "Size": f"{max(1, round((doc.size_bytes or 0) / 1024))} KB",
            },
        ))
    for d in record.diagnoses:
        events.append(MedicalEvent(
            id=f"ev_dg_{d.id}", type="diagnosis", title=d.name, description=f"Condition ({d.status}).",
            date=d.diagnosed_at, details={k: v for k, v in {"ICD-10": d.icd10, "Status": d.status}.items() if v},
        ))
    for t in record.treatments:
        events.append(MedicalEvent(
            id=f"ev_tr_{t.id}", type="treatment", title=t.name, description="Medication started.",
            date=t.start_date,
            details={k: v for k, v in {"Dosage": t.dosage, "Frequency": t.frequency,
                                        "Status": "active" if t.active else "stopped"}.items() if v},
        ))
    for a in analyses:
        events.append(MedicalEvent(
            id=f"ev_lv_{a['id']}", type="xray", title="LungVision AI result",
            description="Experimental AI screening result (not a diagnosis).", date=a["created_at"],
            details={"AI score": f"{a['score']:.3f}", "Threshold": str(a["threshold"]), "Model": a["model_version"]},
        ))
    return sorted(events, key=lambda e: e.date, reverse=True)


# ─────────────────────────────────────────────────────────── profile

def get_role(user: CurrentUser) -> str | None:
    rows = _request("GET", _rest("profiles"), user, params={"id": f"eq.{user.id}", "select": "role"}).json()
    return rows[0]["role"] if rows else None


def get_record(user: CurrentUser) -> PatientRecord | None:
    """Full record of the signed-in user, or None if their profile row does not exist."""
    profiles = _request("GET", _rest("profiles"), user,
                        params={"id": f"eq.{user.id}", "select": "id,full_name,medical_profiles(*)"}).json()
    if not profiles:
        return None
    profile = profiles[0]
    medical = profile.get("medical_profiles") or {}
    if isinstance(medical, list):  # PostgREST may embed 1:1 as a list
        medical = medical[0] if medical else {}

    docs = _request("GET", _rest("medical_documents"), user, params={
        "user_id": f"eq.{user.id}", "select": "id,title,document_type,mime_type,size_bytes,uploaded_at",
        "order": "uploaded_at.desc",
    }).json()
    analyses = _request("GET", _rest("lungvision_analyses"), user, params={
        "user_id": f"eq.{user.id}", "select": "id,score,threshold,model_version,created_at",
        "order": "created_at.desc", "limit": "50",
    }).json()

    contact = medical.get("emergency_contact")
    record = PatientRecord(
        id=user.id,
        full_name=profile.get("full_name") or "",
        date_of_birth=medical.get("date_of_birth"),
        sex=medical.get("sex"),
        blood_type=medical.get("blood_type"),
        height_cm=medical.get("height_cm"),
        weight_kg=medical.get("weight_kg"),
        emergency_contact=EmergencyContact.model_validate(contact) if isinstance(contact, dict) else None,
        allergies=_items(medical.get("allergies"), Allergy),
        diagnoses=_items(medical.get("conditions"), Diagnosis),
        treatments=_items(medical.get("medications"), Treatment),
        documents=[_document(r) for r in docs],
    )
    record.history = _history(record, analyses)
    return record


def update_profile(user: CurrentUser, update: ProfileUpdate) -> PatientRecord | None:
    record = get_record(user)
    if record is None:
        return None
    apply_profile_update(record, update)
    body = {
        "user_id": user.id,
        "blood_type": record.blood_type,
        "allergies": [a.model_dump() for a in record.allergies],
        "conditions": [d.model_dump() for d in record.diagnoses],
        "medications": [t.model_dump() for t in record.treatments],
    }
    # Upsert: the row is created at sign-up, but this also covers users created before the trigger.
    _request("POST", _rest("medical_profiles"), user, expected=(200, 201, 204), json=body,
             params={"on_conflict": "user_id"},
             headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
    return get_record(user)


# ─────────────────────────────────────────────────────────── documents

def store_document(user: CurrentUser, content: bytes, document_type: str, title: str, filename: str) -> MedicalDocument:
    """File → private bucket at `<user_id>/<doc_id>.<ext>`, metadata → medical_documents."""
    mime_type = detect_mime(content)
    document_id = str(uuid.uuid4())
    path = f"{user.id}/{document_id}.{EXTENSIONS[mime_type]}"
    clean_title = (title.strip() or filename.rsplit(".", 1)[0].strip() or TYPE_LABELS[document_type])[:120]

    _request("POST", _storage(path), user, expected=(200, 201), content=content,
             headers={"Content-Type": mime_type, "x-upsert": "false", "Cache-Control": "no-store"})
    try:
        rows = _request("POST", _rest("medical_documents"), user, expected=(201,), json={
            "id": document_id, "user_id": user.id, "title": clean_title, "document_type": document_type,
            "storage_path": path, "mime_type": mime_type, "size_bytes": len(content),
        }, headers={"Prefer": "return=representation"}).json()
    except SupabaseError:
        # Don't leave an orphan file behind.
        try:
            _request("DELETE", _storage(path), user, expected=(200, 204, 404))
        except SupabaseError:
            pass
        raise
    return _document(rows[0])


def get_document_file(user: CurrentUser, document_id: str) -> tuple[bytes, str, str] | None:
    """(content, mime, filename) only for the owner — RLS hides other users' rows and files."""
    if not UUID_RE.match(document_id):
        return None
    rows = _request("GET", _rest("medical_documents"), user, params={
        "id": f"eq.{document_id}", "select": "storage_path,mime_type",
    }).json()
    if not rows:
        return None
    path, mime_type = rows[0]["storage_path"], rows[0]["mime_type"]
    response = _request("GET", f"{_base()}/storage/v1/object/authenticated/{settings.supabase_documents_bucket}/{path}",
                        user, expected=(200, 400, 404))
    if response.status_code != 200:
        return None
    return response.content, mime_type, path.rsplit("/", 1)[-1]


# ─────────────────────────────────────────────────────────── emergency passport (RPCs, security definer)

def _rpc(name: str, user: CurrentUser, body: dict) -> object:
    return _request("POST", f"{_base()}/rest/v1/rpc/{name}", user, json=body).json()


def create_emergency_token(user: CurrentUser, token_hash: str) -> dict:
    return _rpc("create_emergency_token", user, {"p_token_hash": token_hash})


def revoke_emergency_token(user: CurrentUser, token_id: str) -> bool:
    if not UUID_RE.match(token_id):
        return False
    return bool(_rpc("revoke_emergency_token", user, {"p_token_id": token_id}))


def redeem_emergency_token(user: CurrentUser, token_hash: str) -> dict:
    """Doctor role + validity + single use are enforced atomically in Postgres; every attempt is logged."""
    return _rpc("redeem_emergency_token", user, {"p_token_hash": token_hash})


def emergency_audit(user: CurrentUser, limit: int = 20) -> list[dict]:
    return _request("GET", _rest("emergency_access_log"), user, params={
        "patient_id": f"eq.{user.id}", "select": "id,event,reason,actor_name,created_at",
        "order": "created_at.desc", "limit": str(limit),
    }).json()


# ─────────────────────────────────────────────────────────── confirmed lab values (document scanner)

class LabStorageUnavailable(SupabaseError):
    """Table document_lab_values missing (migration 20261114000000 not applied) → 503."""


LAB_FIELDS = "name,value,unit,reference_range,source_line"


def get_lab_values(user: CurrentUser, document_id: str) -> list[dict]:
    if not UUID_RE.match(document_id):
        return []
    res = _request("GET", _rest("document_lab_values"), user, expected=(200, 404), params={
        "document_id": f"eq.{document_id}", "select": LAB_FIELDS, "order": "position.asc",
    })
    if res.status_code == 404:
        raise LabStorageUnavailable("Lab values storage not set up")
    return res.json()


def save_lab_values(user: CurrentUser, document_id: str, values: list[dict]) -> list[dict] | None:
    """Replaces the confirmed values of one of the user's documents. None if the document is not theirs."""
    if not UUID_RE.match(document_id):
        return None
    owned = _request("GET", _rest("medical_documents"), user, params={"id": f"eq.{document_id}", "select": "id"}).json()
    if not owned:
        return None
    res = _request("DELETE", _rest("document_lab_values"), user, expected=(200, 204, 404),
                   params={"document_id": f"eq.{document_id}"})
    if res.status_code == 404:
        raise LabStorageUnavailable("Lab values storage not set up")
    if values:
        rows = [{"user_id": user.id, "document_id": document_id, "position": i, **v} for i, v in enumerate(values)]
        _request("POST", _rest("document_lab_values"), user, expected=(201,), json=rows,
                 headers={"Prefer": "return=minimal"})
    return get_lab_values(user, document_id)


def emergency_doctor_accesses(user: CurrentUser, limit: int = 50) -> list[dict]:
    """The doctor's own attempts (RLS policy "emergency_log: actor reads own"). No patient identity is selected."""
    return _request("GET", _rest("emergency_access_log"), user, params={
        "actor_id": f"eq.{user.id}", "event": "in.(viewed,denied)", "select": "id,event,reason,actor_name,created_at",
        "order": "created_at.desc", "limit": str(limit),
    }).json()


__all__ = [
    "InvalidDocumentError", "SupabaseAuthError", "SupabaseError",
    "LabStorageUnavailable", "create_emergency_token", "emergency_audit", "emergency_doctor_accesses",
    "get_lab_values", "save_lab_values", "get_document_file", "get_record", "get_role",
    "redeem_emergency_token", "revoke_emergency_token", "store_document", "update_profile",
]
