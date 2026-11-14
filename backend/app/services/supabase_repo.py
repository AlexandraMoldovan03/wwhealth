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
from datetime import UTC, datetime

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.core.security import CurrentUser
from app.schemas.document import MedicalDocument
from app.schemas.patient import (
    Allergy,
    Diagnosis,
    EmergencyContact,
    MedicalEvent,
    PatientRecord,
    ProfileUpdate,
    Surgery,
    Treatment,
)
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
        status="analyzed" if row.get("processing_status") == "confirmed" else "uploaded",
        is_demo=bool(row.get("is_demo")),
        # Smart Import metadata (migration 20261119000000; absent before it → None)
        original_filename=row.get("original_filename"),
        specialty=row.get("specialty"),
        event_date=row.get("event_date"),
        document_date=row.get("document_date"),
        institution=row.get("institution"),
        processing_status=row.get("processing_status"),
    )


DOC_SELECT = "id,title,document_type,mime_type,size_bytes,uploaded_at"
DOC_SELECT_SMART = (f"{DOC_SELECT},original_filename,specialty,event_date,document_date,institution,processing_status,"
                    "is_demo")


def _own_documents(user: CurrentUser) -> list[dict]:
    """The user's documents with Smart Import metadata when that migration is applied (plain columns otherwise)."""
    res = _request("GET", _rest("medical_documents"), user, expected=(200, 400), params={
        "user_id": f"eq.{user.id}", "select": DOC_SELECT_SMART, "order": "uploaded_at.desc"})
    if res.status_code == 400:
        res = _request("GET", _rest("medical_documents"), user, params={
            "user_id": f"eq.{user.id}", "select": DOC_SELECT, "order": "uploaded_at.desc"})
    return res.json()


def _confirmed_diagnoses(user: CurrentUser) -> list[dict]:
    """Diagnoses / procedures the patient confirmed from documents, for the Medical Timeline ([] before migration)."""
    res = _request("GET", _rest("document_facts"), user, expected=(200, 400, 404), params={
        "user_id": f"eq.{user.id}", "kind": "in.(diagnosis,procedure)", "status": "not.eq.ruled_out",
        "select": "id,document_id,kind,label,status,event_date", "limit": "500"})
    return res.json() if res.status_code == 200 else []


def _history(record: PatientRecord, analyses: list[dict], facts: list[dict] | None = None) -> list[MedicalEvent]:
    events: list[MedicalEvent] = []
    for doc in record.documents:
        label = TYPE_LABELS.get(doc.type, "Document")
        details = {
            "Type": label,
            "Format": {"application/pdf": "PDF", "image/jpeg": "Image", "image/png": "Image", "text/csv": "CSV"}.get(
                doc.mime_type or "", "FHIR"),
            "Size": f"{max(1, round((doc.size_bytes or 0) / 1024))} KB",
        }
        if doc.institution:
            details["Institution"] = doc.institution
        events.append(MedicalEvent(
            id=f"ev_doc_{doc.id}", type="document", title=doc.title,
            description=f"{label}." if doc.event_date else f"{label} uploaded.",
            date=doc.event_date or doc.uploaded_at, document_id=doc.id, details=details,
        ))
    titles = {d.id: d.title for d in record.documents}
    for f in facts or []:
        if not f.get("event_date") or f.get("kind") != "diagnosis":
            continue
        events.append(MedicalEvent(
            id=f"ev_fact_{f['id']}", type="diagnosis", title=f["label"],
            description=f"Documented ({f.get('status') or 'confirmed'}).", date=str(f["event_date"])[:10],
            document_id=str(f["document_id"]),
            details={k: v for k, v in {"Status": f.get("status"), "Document": titles.get(str(f["document_id"]))}.items() if v},
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

    docs = _own_documents(user)
    analyses = _request("GET", _rest("lungvision_analyses"), user, params={
        "user_id": f"eq.{user.id}", "select": "id,score,threshold,model_version,created_at",
        "order": "created_at.desc", "limit": "50",
    }).json()

    record = _record_from(user.id, profile.get("full_name") or "", medical, [_document(r) for r in docs])
    record.history = _history(record, analyses, _confirmed_diagnoses(user))
    return record


def _record_from(patient_id: str, full_name: str, medical: dict, documents: list[MedicalDocument]) -> PatientRecord:
    contact = medical.get("emergency_contact")
    return PatientRecord(
        id=patient_id,
        full_name=full_name,
        date_of_birth=medical.get("date_of_birth"),
        sex=medical.get("sex"),
        blood_type=medical.get("blood_type"),
        height_cm=medical.get("height_cm"),
        weight_kg=medical.get("weight_kg"),
        emergency_contact=EmergencyContact.model_validate(contact) if isinstance(contact, dict) else None,
        allergies=_items(medical.get("allergies"), Allergy),
        diagnoses=_items(medical.get("conditions"), Diagnosis),
        treatments=_items(medical.get("medications"), Treatment),
        surgeries=_items(medical.get("surgeries"), Surgery),  # column from migration 20261116000000 (absent → [])
        documents=documents,
    )


def update_profile(user: CurrentUser, update: ProfileUpdate) -> PatientRecord | None:
    record = get_record(user)
    if record is None:
        return None
    apply_profile_update(record, update)
    sent = update.model_fields_set
    body = update.model_dump(
        mode="json", exclude_unset=True,
        include={"date_of_birth", "sex", "height_cm", "weight_kg", "blood_type"},
    )
    for field, column in (
        ("allergies", "allergies"), ("diagnoses", "conditions"),
        ("treatments", "medications"), ("surgeries", "surgeries"),
    ):
        if field in sent and getattr(update, field) is not None:
            body[column] = [item.model_dump() for item in getattr(record, field)]
    if body:
        # Upsert also covers accounts created before the sign-up trigger.
        body["user_id"] = user.id
        res = _request("POST", _rest("medical_profiles"), user, expected=(200, 201, 204, 400), json=body,
                       params={"on_conflict": "user_id"},
                       headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
        if res.status_code == 400:
            if _missing_column(res, "surgeries"):
                raise FeatureNotSetUp("Surgical history is not set up yet")
            raise SupabaseError("Database error (400)")
    if "full_name" in sent:
        _request("PATCH", _rest("profiles"), user, expected=(200, 204),
                 params={"id": f"eq.{user.id}"}, json={"full_name": record.full_name},
                 headers={"Prefer": "return=minimal"})
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
        "id": f"eq.{document_id}", "user_id": f"eq.{user.id}", "select": "storage_path,mime_type",
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


def emergency_token_status(user: CurrentUser, token_id: str) -> str:
    if not UUID_RE.match(token_id):
        return "not_found"
    return str(_rpc("emergency_token_status", user, {"p_token_id": token_id}))


def redeem_emergency_token(user: CurrentUser, token_hash: str) -> dict:
    """Doctor role + validity + single use are enforced atomically in Postgres; every attempt is logged."""
    return _rpc("redeem_emergency_token", user, {"p_token_hash": token_hash})


def emergency_audit(user: CurrentUser, limit: int = 20) -> list[dict]:
    return _request("GET", _rest("emergency_access_log"), user, params={
        "patient_id": f"eq.{user.id}", "select": "id,event,reason,actor_name,created_at",
        "order": "created_at.desc", "limit": str(limit),
    }).json()


# ─────────────────────────────────────────────────────────── confirmed lab values (document scanner)

class FeatureNotSetUp(SupabaseError):
    """A table / function of a newer migration is missing (migration not applied yet) → 503."""


class LabStorageUnavailable(FeatureNotSetUp):
    """Table document_lab_values missing (migration 20261114000000 not applied) → 503."""


LAB_FIELDS = "name,value,unit,reference_range,source_line"
# Added by migration 20261114000200 — tolerated when that migration has not been applied yet.
LAB_DATE_FIELD = "measured_at"


def _missing_column(res: httpx.Response, column: str) -> bool:
    """True only when PostgREST says `column` does not exist (its migration was not applied)."""
    if res.status_code != 400:
        return False
    try:
        body = res.json()
    except ValueError:
        return False
    return body.get("code") in ("PGRST204", "42703") and column in str(body.get("message", ""))


def _missing_date_column(res: httpx.Response) -> bool:
    """True only when PostgREST says the `measured_at` column does not exist (migration not applied)."""
    return _missing_column(res, LAB_DATE_FIELD)


def _lab_get(user: CurrentUser, params: dict, fields: str) -> list[dict]:
    """GET document_lab_values; retries without `measured_at` only if that column does not exist yet."""
    res = _request("GET", _rest("document_lab_values"), user, expected=(200, 400, 404),
                   params={**params, "select": f"{fields},{LAB_DATE_FIELD}"})
    if _missing_date_column(res):
        res = _request("GET", _rest("document_lab_values"), user, expected=(200, 404), params={**params, "select": fields})
    if res.status_code == 404:
        raise LabStorageUnavailable("Lab values storage not set up")
    if res.status_code != 200:
        raise SupabaseError(f"Database error ({res.status_code})")
    return res.json()


def _insert_lab_rows(user: CurrentUser, rows: list[dict]) -> None:
    res = _request("POST", _rest("document_lab_values"), user, expected=(201, 400), json=rows,
                   headers={"Prefer": "return=minimal"})
    if _missing_date_column(res):  # migration 20261114000200 not applied → store without the date
        rows = [{k: v for k, v in row.items() if k != LAB_DATE_FIELD} for row in rows]
        res = _request("POST", _rest("document_lab_values"), user, expected=(201, 400), json=rows,
                       headers={"Prefer": "return=minimal"})
    if res.status_code != 201:
        raise SupabaseError(f"Database error ({res.status_code})")


def get_lab_values(user: CurrentUser, document_id: str) -> list[dict]:
    if not UUID_RE.match(document_id):
        return []
    # user_id filter: a doctor with consent can also read a patient's rows — this route is owner-only.
    return _lab_get(user, {"document_id": f"eq.{document_id}", "user_id": f"eq.{user.id}", "order": "position.asc"},
                    LAB_FIELDS)


def list_lab_values(user: CurrentUser) -> list[dict]:
    """All confirmed values of the user (RLS: own rows only) with their document's title and upload date."""
    rows = _lab_get(user, {"user_id": f"eq.{user.id}", "order": "created_at.asc", "limit": "2000"},
                    f"{LAB_FIELDS},document_id,medical_documents(title,uploaded_at)")
    out = []
    for r in rows:
        doc = r.pop("medical_documents", None) or {}
        out.append({**r, "document_title": doc.get("title"), "document_date": (doc.get("uploaded_at") or "")[:10] or None})
    return out


def save_lab_values(user: CurrentUser, document_id: str, values: list[dict]) -> list[dict] | None:
    """Replaces the confirmed values of one of the user's documents (empty list = delete them).
    None if the document is not theirs."""
    if not UUID_RE.match(document_id):
        return None
    owned = _request("GET", _rest("medical_documents"), user,
                     params={"id": f"eq.{document_id}", "user_id": f"eq.{user.id}", "select": "id"}).json()
    if not owned:
        return None
    previous = get_lab_values(user, document_id)  # restored if the new values cannot be stored
    res = _request("DELETE", _rest("document_lab_values"), user, expected=(200, 204, 404),
                   params={"document_id": f"eq.{document_id}"})
    if res.status_code == 404:
        raise LabStorageUnavailable("Lab values storage not set up")
    if values:
        stored = ("name", "value", "unit", "reference_range", "source_line", LAB_DATE_FIELD)

        def to_rows(items: list[dict]) -> list[dict]:
            return [{"user_id": user.id, "document_id": document_id, "position": i, **{k: v.get(k) for k in stored}}
                    for i, v in enumerate(items)]

        try:
            _insert_lab_rows(user, to_rows(values))
        except SupabaseError:
            if previous:
                _insert_lab_rows(user, to_rows(previous))
            raise
    return get_lab_values(user, document_id)


def emergency_doctor_accesses(user: CurrentUser, limit: int = 50) -> list[dict]:
    """The doctor's own attempts (RLS policy "emergency_log: actor reads own"). No patient identity is selected."""
    return _request("GET", _rest("emergency_access_log"), user, params={
        "actor_id": f"eq.{user.id}", "event": "in.(viewed,denied)", "select": "id,event,reason,actor_name,created_at",
        "order": "created_at.desc", "limit": str(limit),
    }).json()


__all__ = [
    "InvalidDocumentError", "SupabaseAuthError", "SupabaseError",
    "LabStorageUnavailable", "create_emergency_token", "emergency_audit", "emergency_doctor_accesses", "emergency_token_status",
    "get_lab_values", "list_lab_values", "save_lab_values", "get_document_file", "get_record", "get_role",
    "redeem_emergency_token", "revoke_emergency_token", "store_document", "update_profile",
]


# ─────────────────────────────────────────────────────────── doctor access & consent (migration 20261115000000)
# Writes only through security-definer RPCs (patient_id = auth.uid()); doctor reads go through RLS policies that
# require an active grant with the section. Every call below runs with the caller's own token.

DOC_FIELDS = "id,title,document_type,mime_type,size_bytes,uploaded_at"


class DoctorAccessUnavailable(FeatureNotSetUp):
    """Doctor-access tables / functions missing (migration 20261115000000 not applied) → 503."""


def _consent_rpc(name: str, user: CurrentUser, body: dict) -> object:
    res = _request("POST", f"{_base()}/rest/v1/rpc/{name}", user, expected=(200, 404), json=body)
    if res.status_code == 404:
        raise DoctorAccessUnavailable("Doctor access is not set up yet")
    return res.json()


def list_verified_doctors(user: CurrentUser, query: str) -> list[dict]:
    return _consent_rpc("list_verified_doctors", user, {"p_query": query[:60]})  # type: ignore[return-value]


def grant_doctor_access(user: CurrentUser, doctor_id: str, scopes: list[str], hours: int) -> dict:
    if not UUID_RE.match(doctor_id):
        return {"status": "doctor_not_found"}
    return _consent_rpc("grant_doctor_access", user, {"p_doctor_id": doctor_id, "p_scopes": scopes, "p_hours": hours})  # type: ignore[return-value]


def revoke_doctor_access(user: CurrentUser, grant_id: str) -> bool:
    if not UUID_RE.match(grant_id):
        return False
    return bool(_consent_rpc("revoke_doctor_access", user, {"p_grant_id": grant_id}))


def patient_doctor_access(user: CurrentUser) -> dict:
    return _consent_rpc("patient_doctor_access", user, {})  # type: ignore[return-value]


def doctor_patients(user: CurrentUser) -> list[dict]:
    return _consent_rpc("doctor_patients", user, {})  # type: ignore[return-value]


def doctor_open_patient(user: CurrentUser, patient_id: str, section: str) -> dict:
    """Status + scopes of the doctor's latest grant for this patient; logged as viewed / denied in Postgres."""
    if not UUID_RE.match(patient_id):
        return {"status": "none"}
    return _consent_rpc("doctor_open_patient", user, {"p_patient_id": patient_id, "p_section": section})  # type: ignore[return-value]


def doctor_identity(user: CurrentUser) -> dict:
    res = _request("GET", _rest("profiles"), user, expected=(200, 400),
                   params={"id": f"eq.{user.id}", "select": "full_name,doctor_code"})
    if res.status_code == 400:  # doctor_code column missing → migration not applied
        raise DoctorAccessUnavailable("Doctor access is not set up yet")
    rows = res.json()
    return rows[0] if rows else {"full_name": "", "doctor_code": None}


def doctor_patient_record(user: CurrentUser, patient_id: str, full_name: str) -> PatientRecord:
    """Profile section only (RLS: needs an active grant with 'profile'); no documents / history."""
    rows = _request("GET", _rest("medical_profiles"), user, params={"user_id": f"eq.{patient_id}", "select": "*"}).json()
    return _record_from(patient_id, full_name, rows[0] if rows else {}, [])


def _doctor_document(row: dict, patient_id: str) -> MedicalDocument:
    doc = _document(row)
    doc.file_url = f"/api/v1/doctor-access/patients/{patient_id}/documents/{row['id']}/file"
    return doc


def doctor_patient_documents(user: CurrentUser, patient_id: str) -> list[MedicalDocument]:
    rows = _request("GET", _rest("medical_documents"), user, params={
        "user_id": f"eq.{patient_id}", "select": DOC_FIELDS, "order": "uploaded_at.desc",
    }).json()
    return [_doctor_document(r, patient_id) for r in rows]


def doctor_patient_labs(user: CurrentUser, patient_id: str) -> list[dict]:
    """Confirmed values (RLS: 'labs'). Titles come from the embedded document only if 'documents' is shared too."""
    try:
        rows = _lab_get(user, {"user_id": f"eq.{patient_id}", "order": "created_at.asc", "limit": "2000"},
                        f"{LAB_FIELDS},document_id,medical_documents(title,uploaded_at)")
    except LabStorageUnavailable:
        return []
    out = []
    for r in rows:
        doc = r.pop("medical_documents", None) or {}
        out.append({**r, "document_title": doc.get("title"), "document_date": (doc.get("uploaded_at") or "")[:10] or None})
    return out


def doctor_document_file(user: CurrentUser, patient_id: str, document_id: str) -> tuple[bytes, str, str] | None:
    if not (UUID_RE.match(patient_id) and UUID_RE.match(document_id)):
        return None
    rows = _request("GET", _rest("medical_documents"), user, params={
        "id": f"eq.{document_id}", "user_id": f"eq.{patient_id}", "select": "storage_path,mime_type",
    }).json()
    if not rows:
        return None
    path, mime_type = rows[0]["storage_path"], rows[0]["mime_type"]
    response = _request("GET", f"{_base()}/storage/v1/object/authenticated/{settings.supabase_documents_bucket}/{path}",
                        user, expected=(200, 400, 404))
    if response.status_code != 200:
        return None
    return response.content, mime_type, path.rsplit("/", 1)[-1]


# ─────────────────────────────────────────────────────────── AI Medical Intelligence (migration 20261116000000)

class AiIntelligenceUnavailable(FeatureNotSetUp):
    """ai_processing_consents / ai_medical_summaries missing → 503."""


def _ai(res: httpx.Response) -> httpx.Response:
    if res.status_code == 404:
        raise AiIntelligenceUnavailable("AI Medical Intelligence is not set up yet")
    return res


def ai_consent_get(user: CurrentUser) -> dict | None:
    rows = _ai(_request("GET", _rest("ai_processing_consents"), user, expected=(200, 404),
                        params={"user_id": f"eq.{user.id}", "select": "granted_at,revoked_at"})).json()
    return rows[0] if rows else None


def ai_consent_set(user: CurrentUser, granted: bool) -> None:
    """Grant = (re)create an active consent. Revoke = set revoked_at (a trigger deletes the saved summary)."""
    now = datetime.now(UTC).isoformat()
    if granted:
        _ai(_request("POST", _rest("ai_processing_consents"), user, expected=(200, 201, 204, 404),
                     params={"on_conflict": "user_id"}, json={"user_id": user.id, "granted_at": now, "revoked_at": None},
                     headers={"Prefer": "resolution=merge-duplicates,return=minimal"}))
    else:
        _ai(_request("PATCH", _rest("ai_processing_consents"), user, expected=(200, 204, 404),
                     params={"user_id": f"eq.{user.id}", "revoked_at": "is.null"}, json={"revoked_at": now},
                     headers={"Prefer": "return=minimal"}))


def ai_consent_active(user: CurrentUser, patient_id: str) -> bool:
    """Patient consent to Gemini processing. For a doctor: only answered with an active grant (else False)."""
    if not UUID_RE.match(patient_id):
        return False
    res = _ai(_request("POST", f"{_base()}/rest/v1/rpc/ai_consent_active", user, expected=(200, 404),
                       json={"p_patient": patient_id}))
    return res.json() is True


def ai_summary_get(user: CurrentUser, patient_id: str) -> dict | None:
    """RLS: the patient's own row, or a doctor's only with an active grant covering every source section."""
    if not UUID_RE.match(patient_id):
        return None
    rows = _ai(_request("GET", _rest("ai_medical_summaries"), user, expected=(200, 404), params={
        "patient_id": f"eq.{patient_id}", "select": "content,source_scopes,model,generated_at"})).json()
    return rows[0] if rows else None


def ai_summary_save(user: CurrentUser, content: dict, scopes: list[str], model: str) -> None:
    _ai(_request("POST", _rest("ai_medical_summaries"), user, expected=(200, 201, 204, 404),
                 params={"on_conflict": "patient_id"},
                 json={"patient_id": user.id, "content": content, "source_scopes": scopes, "model": model[:80],
                       "generated_at": datetime.now(UTC).isoformat()},
                 headers={"Prefer": "resolution=merge-duplicates,return=minimal"}))


def ai_summary_delete(user: CurrentUser) -> None:
    _ai(_request("DELETE", _rest("ai_medical_summaries"), user, expected=(200, 204, 404),
                 params={"patient_id": f"eq.{user.id}"}))


# ─────────────────────────────────────────────────────────── Smart Care: specialties, calendar, appointments
# (migration 20261117000100). Writes to appointments only through security-definer RPCs; availability through RLS
# (a doctor manages only their own slots). Every call runs with the caller's own token.

class SmartCareUnavailable(FeatureNotSetUp):
    """Appointment tables / functions missing (migration 20261117000100 not applied) → 503."""


def _care_rpc(name: str, user: CurrentUser, body: dict) -> object:
    res = _request("POST", f"{_base()}/rest/v1/rpc/{name}", user, expected=(200, 404), json=body)
    if res.status_code == 404:
        raise SmartCareUnavailable("Appointments are not set up yet")
    return res.json()


def specialty_doctors(user: CurrentUser, specialty_id: str) -> list[dict]:
    return _care_rpc("specialty_doctors", user, {"p_specialty": specialty_id})  # type: ignore[return-value]


def doctor_free_slots(user: CurrentUser, doctor_id: str, days: int) -> list[dict]:
    if not UUID_RE.match(doctor_id):
        return []
    return _care_rpc("doctor_free_slots", user, {"p_doctor": doctor_id, "p_days": days})  # type: ignore[return-value]


def request_appointment(user: CurrentUser, slot_id: str, specialty_id: str | None, note: str | None) -> dict:
    if not UUID_RE.match(slot_id):
        return {"status": "doctor_not_found"}
    return _care_rpc("request_appointment", user, {"p_slot_id": slot_id, "p_specialty": specialty_id, "p_note": note})  # type: ignore[return-value]


def respond_appointment(user: CurrentUser, appointment_id: str, action: str, slot_id: str | None, note: str | None) -> dict:
    if not UUID_RE.match(appointment_id) or (slot_id and not UUID_RE.match(slot_id)):
        return {"status": "not_found"}
    return _care_rpc("respond_appointment", user, {"p_id": appointment_id, "p_action": action, "p_slot_id": slot_id, "p_note": note})  # type: ignore[return-value]


def patient_update_appointment(user: CurrentUser, appointment_id: str, action: str) -> dict:
    if not UUID_RE.match(appointment_id):
        return {"status": "not_found"}
    return _care_rpc("patient_update_appointment", user, {"p_id": appointment_id, "p_action": action})  # type: ignore[return-value]


def my_appointments(user: CurrentUser) -> list[dict]:
    return _care_rpc("my_appointments", user, {}) or []  # type: ignore[return-value]


def availability_list(user: CurrentUser) -> list[dict]:
    res = _request("GET", _rest("doctor_availability"), user, expected=(200, 404), params={
        "select": "id,starts_at,ends_at", "doctor_id": f"eq.{user.id}",
        "starts_at": f"gt.{datetime.now(UTC).isoformat()}", "order": "starts_at", "limit": "300"})
    if res.status_code == 404:
        raise SmartCareUnavailable("Appointments are not set up yet")
    return res.json()


def availability_add(user: CurrentUser, slots: list[tuple[str, str]]) -> int:
    rows = [{"doctor_id": user.id, "starts_at": s, "ends_at": e} for s, e in slots]
    res = _request("POST", _rest("doctor_availability"), user, expected=(201, 404, 409),
                   params={"on_conflict": "doctor_id,starts_at"},
                   headers={"Prefer": "resolution=ignore-duplicates,return=representation"}, json=rows)
    if res.status_code == 404:
        raise SmartCareUnavailable("Appointments are not set up yet")
    return len(res.json()) if res.status_code == 201 else 0


def availability_delete(user: CurrentUser, slot_id: str) -> bool:
    if not UUID_RE.match(slot_id):
        return False
    res = _request("DELETE", _rest("doctor_availability"), user, expected=(200, 404),
                   params={"id": f"eq.{slot_id}", "doctor_id": f"eq.{user.id}"},
                   headers={"Prefer": "return=representation"})
    if res.status_code == 404:
        raise SmartCareUnavailable("Appointments are not set up yet")
    return bool(res.json())


# ─────────────────────────────────────────────────────────── Care Journey (migration 20261118000000)
# Schedule / time off / treatments are written only through security-definer RPCs (role + consent checked in
# Postgres); reads go through RLS. Every call runs with the caller's own token.

class CareJourneyUnavailable(FeatureNotSetUp):
    """Care Journey tables / functions missing (migration 20261118000000 not applied) → 503."""


def _cj(res: httpx.Response) -> httpx.Response:
    if res.status_code == 404:
        raise CareJourneyUnavailable("Care journey is not set up yet (migration 20261118000000)")
    return res


def _cj_rpc(name: str, user: CurrentUser, body: dict) -> object:
    res = _cj(_request("POST", f"{_base()}/rest/v1/rpc/{name}", user, expected=(200, 204, 404), json=body))
    return res.json() if res.content else None


def _cj_get(table: str, user: CurrentUser, params: dict) -> list[dict]:
    return _cj(_request("GET", _rest(table), user, expected=(200, 404), params=params)).json()


def schedule_get(user: CurrentUser) -> tuple[dict | None, list[dict]]:
    settings_rows = _cj_get("doctor_schedule_settings", user, {"doctor_id": f"eq.{user.id}",
                                                               "select": "timezone,slot_minutes,horizon_days"})
    hours = _cj_get("doctor_weekly_hours", user, {"doctor_id": f"eq.{user.id}", "select": "weekday,kind,start_time,end_time",
                                                  "order": "weekday,start_time"})
    return (settings_rows[0] if settings_rows else None), hours


def schedule_save(user: CurrentUser, timezone: str, slot_minutes: int, horizon_days: int, hours: list[dict]) -> dict:
    return _cj_rpc("save_doctor_schedule", user, {"p_timezone": timezone, "p_slot_minutes": slot_minutes,
                                                  "p_horizon_days": horizon_days, "p_hours": hours})  # type: ignore[return-value]


def time_off_list(user: CurrentUser) -> list[dict]:
    return _cj_get("doctor_time_off", user, {"doctor_id": f"eq.{user.id}", "select": "id,kind,starts_at,ends_at,note",
                                             "ends_at": f"gt.{datetime.now(UTC).isoformat()}", "order": "starts_at"})


def time_off_add(user: CurrentUser, kind: str, starts_at: str, ends_at: str, note: str | None) -> dict:
    return _cj_rpc("add_doctor_time_off", user, {"p_kind": kind, "p_starts_at": starts_at, "p_ends_at": ends_at,
                                                 "p_note": note})  # type: ignore[return-value]


def time_off_delete(user: CurrentUser, time_off_id: str) -> bool:
    if not UUID_RE.match(time_off_id):
        return False
    return bool(_cj_rpc("delete_doctor_time_off", user, {"p_id": time_off_id}))


def doctor_agenda(user: CurrentUser, starts_at: str, ends_at: str) -> dict:
    return _cj_rpc("doctor_agenda", user, {"p_from": starts_at, "p_to": ends_at})  # type: ignore[return-value]


def ensure_doctor_availability(user: CurrentUser, doctor_id: str) -> None:
    """Extends the doctor's generated slots from their weekly schedule (idempotent; tolerated if not set up)."""
    if not UUID_RE.match(doctor_id):
        return
    try:
        _cj_rpc("ensure_doctor_availability", user, {"p_doctor": doctor_id})
    except CareJourneyUnavailable:
        return


def ensure_specialty_availability(user: CurrentUser, specialty_id: str) -> None:
    try:
        _cj_rpc("ensure_specialty_availability", user, {"p_specialty": specialty_id})
    except CareJourneyUnavailable:
        return


def preparation_get(user: CurrentUser, appointment_id: str) -> dict | None:
    if not UUID_RE.match(appointment_id):
        return None
    rows = _cj_get("appointment_preparations", user, {"appointment_id": f"eq.{appointment_id}",
                                                      "select": "reason,symptoms,questions,care_summary,updated_at"})
    return rows[0] if rows else None


def preparation_save(user: CurrentUser, appointment_id: str, body: dict) -> dict:
    if not UUID_RE.match(appointment_id):
        return {"status": "not_found"}
    return _cj_rpc("save_appointment_preparation", user, {
        "p_id": appointment_id, "p_reason": body.get("reason"), "p_symptoms": body.get("symptoms"),
        "p_questions": body.get("questions") or [], "p_care_summary": body.get("care_summary")})  # type: ignore[return-value]


def doctor_consultation(user: CurrentUser, appointment_id: str) -> dict:
    if not UUID_RE.match(appointment_id):
        return {"status": "not_found"}
    return _cj_rpc("doctor_consultation", user, {"p_id": appointment_id})  # type: ignore[return-value]


PLAN_SELECT = ("id,patient_id,prescriber_id,prescriber_name,appointment_id,kind,status,current_version,issued_at,"
               "treatment_plan_versions(*)")


def treatments_list(user: CurrentUser, patient_id: str) -> list[dict]:
    """RLS: the patient's own plans, the prescriber's, or a doctor's with an active 'profile' grant."""
    if not UUID_RE.match(patient_id):
        return []
    return _cj_get("treatment_plans", user, {"patient_id": f"eq.{patient_id}", "select": PLAN_SELECT,
                                             "order": "issued_at.desc", "limit": "200"})


def treatment_get(user: CurrentUser, plan_id: str) -> dict | None:
    if not UUID_RE.match(plan_id):
        return None
    rows = _cj_get("treatment_plans", user, {"id": f"eq.{plan_id}", "select": PLAN_SELECT})
    return rows[0] if rows else None


def treatment_save(user: CurrentUser, plan_id: str | None, patient_id: str | None, appointment_id: str | None,
                   kind: str | None, data: dict, reason: str | None) -> dict:
    for value in (plan_id, patient_id, appointment_id):
        if value and not UUID_RE.match(value):
            return {"status": "not_found"}
    return _cj_rpc("doctor_save_treatment", user, {"p_plan_id": plan_id, "p_patient_id": patient_id,
                                                   "p_appointment_id": appointment_id, "p_kind": kind,
                                                   "p_data": data, "p_reason": reason})  # type: ignore[return-value]


def treatment_end(user: CurrentUser, plan_id: str, status: str, reason: str | None) -> dict:
    if not UUID_RE.match(plan_id):
        return {"status": "not_found"}
    return _cj_rpc("doctor_end_treatment", user, {"p_plan_id": plan_id, "p_status": status, "p_reason": reason})  # type: ignore[return-value]


def dose_log_list(user: CurrentUser, patient_id: str, since: str) -> list[dict]:
    if not UUID_RE.match(patient_id):
        return []
    return _cj_get("medication_dose_log", user, {"patient_id": f"eq.{patient_id}", "scheduled_for": f"gte.{since}",
                                                 "select": "plan_id,plan_version,scheduled_for,status,recorded_at",
                                                 "order": "scheduled_for.desc", "limit": "1000"})


def dose_log_mark(user: CurrentUser, plan_id: str, plan_version: int, scheduled_for: str, status: str) -> None:
    """Upsert of the patient's own report (RLS: own plan, not more than a day ahead)."""
    _cj(_request("POST", _rest("medication_dose_log"), user, expected=(200, 201, 204, 404),
                 params={"on_conflict": "plan_id,scheduled_for"},
                 json={"patient_id": user.id, "plan_id": plan_id, "plan_version": plan_version,
                       "scheduled_for": scheduled_for, "status": status,
                       "recorded_at": datetime.now(UTC).isoformat()},
                 headers={"Prefer": "resolution=merge-duplicates,return=minimal"}))


def log_fhir_export(user: CurrentUser, patient_id: str) -> None:
    if UUID_RE.match(patient_id):
        try:
            _cj_rpc("log_fhir_export", user, {"p_patient": patient_id})
        except CareJourneyUnavailable:
            return
