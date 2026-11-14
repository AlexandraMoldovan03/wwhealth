"""
Smart Import persistence. Supabase mode: PostgREST + private Storage with the USER's token (RLS decides what is
visible — a user only ever reads / writes rows and files under their own id; a doctor reads facts only with the
patient's 'documents' grant). Demo mode (no Supabase): in-memory rows + the private local file store.

Tables: medical_documents (+ Smart Import columns), document_imports, document_facts (migration 20261119000000).
"""
import uuid
from datetime import UTC, datetime

import httpx

from app.core.config import settings
from app.core.security import CurrentUser
from app.schemas.document import MedicalDocument
from app.services import document_storage, patient_service
from app.services.document_storage import EXTENSIONS
from app.services.supabase_repo import (
    UUID_RE,
    FeatureNotSetUp,
    SupabaseError,
    _request,
    _rest,
    _storage,
)

DOC_FULL = ("id,title,document_type,mime_type,size_bytes,uploaded_at,original_filename,content_sha256,specialty,"
            "event_date,document_date,institution,processing_status,is_demo")
IMPORT_FIELDS = ("id,document_id,content_sha256,pipeline_version,source_format,original_filename,status,method,model,"
                 "extraction,identity,duplicates,contradictions,history,is_demo,created_at,updated_at,confirmed_at")
FACT_FIELDS = "id,document_id,import_id,kind,label,detail,status,value,event_date,source_page,source_excerpt,edited"


class SmartImportUnavailable(FeatureNotSetUp):
    """Smart Import tables / columns missing (migration 20261119000000 not applied) → 503."""


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _si(res: httpx.Response) -> httpx.Response:
    if res.status_code == 404:
        raise SmartImportUnavailable("Smart import is not set up yet (migration 20261119000000)")
    if res.status_code == 400:
        try:
            code = res.json().get("code")
        except ValueError:
            code = None
        if code in ("PGRST204", "42703", "PGRST200", "42P01", "23514"):
            raise SmartImportUnavailable("Smart import is not set up yet (migration 20261119000000)")
        raise SupabaseError("Database error (400)")
    return res


def _req(method: str, url: str, user: CurrentUser, expected: tuple[int, ...] = (200,), **kw) -> httpx.Response:
    return _si(_request(method, url, user, expected=(*expected, 400, 404), **kw))


def to_document(row: dict) -> MedicalDocument:
    return MedicalDocument(
        id=str(row["id"]), title=row["title"], type=row.get("document_type") or "other", uploaded_at=str(row["uploaded_at"]),
        file_url=f"/api/v1/documents/{row['id']}/file", mime_type=row.get("mime_type"), size_bytes=row.get("size_bytes"),
        status="analyzed" if row.get("processing_status") == "confirmed" else "uploaded",
        is_demo=bool(row.get("is_demo")), original_filename=row.get("original_filename"), specialty=row.get("specialty"),
        event_date=(str(row["event_date"])[:10] if row.get("event_date") else None),
        document_date=(str(row["document_date"])[:10] if row.get("document_date") else None),
        institution=row.get("institution"), processing_status=row.get("processing_status") or "uploaded",
        import_id=row.get("import_id"))


# ─────────────────────────────────────────────────────────── demo store (no Supabase)

_imports: dict[str, dict] = {}            # import id → row (with user_id)
_facts: dict[str, list[dict]] = {}        # document id → fact rows (with user_id)
_doc_meta: dict[str, dict] = {}           # document id → Smart Import metadata (with user_id)


def reset_demo() -> None:
    _imports.clear()
    _facts.clear()
    _doc_meta.clear()


def _demo_docs(user_id: str) -> list[dict]:
    record = patient_service.get_patient(user_id)
    out = []
    for d in record.documents if record else []:
        meta = _doc_meta.get(d.id, {})
        out.append({"id": d.id, "title": d.title, "document_type": d.type, "mime_type": d.mime_type,
                    "size_bytes": d.size_bytes, "uploaded_at": d.uploaded_at, "is_demo": d.is_demo, **meta})
    return out


# ─────────────────────────────────────────────────────────── profile (identity / contradictions)

def profile(user: CurrentUser):
    """The signed-in user's PatientRecord (or None)."""
    if settings.supabase_enabled:
        from app.services import supabase_repo
        return supabase_repo.get_record(user)
    return patient_service.get_patient(user.id)


# ─────────────────────────────────────────────────────────── documents

def list_documents(user: CurrentUser) -> list[dict]:
    if not settings.supabase_enabled:
        return _demo_docs(user.id)
    return _req("GET", _rest("medical_documents"), user, params={
        "user_id": f"eq.{user.id}", "select": DOC_FULL, "order": "uploaded_at.desc", "limit": "1000"}).json()


def get_document(user: CurrentUser, document_id: str) -> dict | None:
    if not settings.supabase_enabled:
        return next((d for d in _demo_docs(user.id) if d["id"] == document_id), None)
    if not UUID_RE.match(document_id):
        return None
    rows = _req("GET", _rest("medical_documents"), user, params={
        "id": f"eq.{document_id}", "user_id": f"eq.{user.id}", "select": DOC_FULL}).json()
    return rows[0] if rows else None


def find_document_by_sha(user: CurrentUser, sha: str) -> dict | None:
    if not settings.supabase_enabled:
        return next((d for d in _demo_docs(user.id) if d.get("content_sha256") == sha), None)
    rows = _req("GET", _rest("medical_documents"), user, params={
        "user_id": f"eq.{user.id}", "content_sha256": f"eq.{sha}", "select": DOC_FULL}).json()
    return rows[0] if rows else None


def store_document(user: CurrentUser, content: bytes, mime_type: str, meta: dict) -> dict:
    """Original file → private storage (`<user_id>/<doc_id>.<ext>`), metadata → medical_documents."""
    title = (meta.get("title") or "Document medical")[:120]
    if not settings.supabase_enabled:
        record = patient_service.get_patient(user.id)
        if record is None:
            raise document_storage.InvalidDocumentError("Patient not found.")
        document_id = f"doc_{uuid.uuid4().hex[:12]}"
        document_storage._write_private(document_storage._file_path(user.id, document_id, mime_type), content)
        doc = MedicalDocument(id=document_id, title=title, type=meta.get("document_type") or "other", uploaded_at=_now(),
                              file_url=f"/api/v1/documents/{document_id}/file", mime_type=mime_type, size_bytes=len(content),
                              status="uploaded", is_demo=bool(meta.get("is_demo")))
        record.documents.insert(0, doc)
        _doc_meta[document_id] = {k: meta.get(k) for k in ("original_filename", "content_sha256", "specialty", "event_date",
                                                            "document_date", "institution", "processing_status")}
        return get_document(user, document_id) or {}
    document_id = str(uuid.uuid4())
    path = f"{user.id}/{document_id}.{EXTENSIONS[mime_type]}"
    _request("POST", _storage(path), user, expected=(200, 201), content=content,
             headers={"Content-Type": mime_type, "x-upsert": "false", "Cache-Control": "no-store"})
    try:
        rows = _req("POST", _rest("medical_documents"), user, expected=(201,), json={
            "id": document_id, "user_id": user.id, "title": title, "document_type": meta.get("document_type") or "other",
            "storage_path": path, "mime_type": mime_type, "size_bytes": len(content),
            **{k: meta.get(k) for k in ("original_filename", "content_sha256", "specialty", "event_date", "document_date",
                                        "institution", "processing_status", "is_demo")},
        }, headers={"Prefer": "return=representation"}).json()
    except SupabaseError:
        try:
            _request("DELETE", _storage(path), user, expected=(200, 204, 404))
        except SupabaseError:
            pass
        raise
    return {k: rows[0].get(k) for k in DOC_FULL.split(",")}


def update_document(user: CurrentUser, document_id: str, patch: dict) -> dict | None:
    allowed = {"title", "document_type", "specialty", "event_date", "document_date", "institution", "processing_status"}
    patch = {k: v for k, v in patch.items() if k in allowed}
    if not settings.supabase_enabled:
        record = patient_service.get_patient(user.id)
        doc = next((d for d in record.documents if d.id == document_id), None) if record else None
        if doc is None:
            return None
        if "title" in patch:
            doc.title = patch["title"]
        if "document_type" in patch:
            doc.type = patch["document_type"]
        _doc_meta.setdefault(document_id, {}).update({k: v for k, v in patch.items() if k not in ("title", "document_type")})
        return get_document(user, document_id)
    if not UUID_RE.match(document_id):
        return None
    rows = _req("PATCH", _rest("medical_documents"), user, params={"id": f"eq.{document_id}", "user_id": f"eq.{user.id}"},
                json={**patch, "updated_at": _now()}, headers={"Prefer": "return=representation"}).json()
    return {k: rows[0].get(k) for k in DOC_FULL.split(",")} if rows else None


def delete_document(user: CurrentUser, document_id: str) -> None:
    """Removes an UNCONFIRMED imported document (row + file) — used when the patient rejects the import."""
    if not settings.supabase_enabled:
        record = patient_service.get_patient(user.id)
        if record:
            doc = next((d for d in record.documents if d.id == document_id), None)
            if doc:
                record.documents.remove(doc)
                try:
                    document_storage._file_path(user.id, document_id, doc.mime_type or "application/pdf").unlink(missing_ok=True)
                except (document_storage.InvalidDocumentError, OSError, KeyError):
                    pass
        _doc_meta.pop(document_id, None)
        _facts.pop(document_id, None)
        return
    rows = _request("GET", _rest("medical_documents"), user, params={
        "id": f"eq.{document_id}", "user_id": f"eq.{user.id}", "select": "storage_path"}).json()
    if not rows:
        return
    _request("DELETE", _rest("medical_documents"), user, expected=(200, 204),
             params={"id": f"eq.{document_id}", "user_id": f"eq.{user.id}"})
    try:
        _request("DELETE", _storage(rows[0]["storage_path"]), user, expected=(200, 204, 404))
    except SupabaseError:
        pass


def get_file(user: CurrentUser, document_id: str) -> tuple[bytes, str, str] | None:
    if settings.supabase_enabled:
        from app.services import supabase_repo
        return supabase_repo.get_document_file(user, document_id)
    local = document_storage.get_document_file(user.id, document_id)
    return (local[0].read_bytes(), local[1], local[0].name) if local else None


# ─────────────────────────────────────────────────────────── imports

def _demo_import(user_id: str, **match) -> dict | None:
    return next((r for r in _imports.values() if r["user_id"] == user_id and all(r.get(k) == v for k, v in match.items())), None)


def find_import(user: CurrentUser, sha: str, version: str) -> dict | None:
    if not settings.supabase_enabled:
        return _demo_import(user.id, content_sha256=sha, pipeline_version=version)
    rows = _req("GET", _rest("document_imports"), user, params={
        "user_id": f"eq.{user.id}", "content_sha256": f"eq.{sha}", "pipeline_version": f"eq.{version}",
        "select": IMPORT_FIELDS}).json()
    return rows[0] if rows else None


def get_import(user: CurrentUser, import_id: str) -> dict | None:
    if not settings.supabase_enabled:
        row = _imports.get(import_id)
        return row if row and row["user_id"] == user.id else None
    if not UUID_RE.match(import_id):
        return None
    rows = _req("GET", _rest("document_imports"), user, params={
        "id": f"eq.{import_id}", "user_id": f"eq.{user.id}", "select": IMPORT_FIELDS}).json()
    return rows[0] if rows else None


def latest_import_for_document(user: CurrentUser, document_id: str) -> dict | None:
    if not settings.supabase_enabled:
        rows = [r for r in _imports.values() if r["user_id"] == user.id and r.get("document_id") == document_id]
        return max(rows, key=lambda r: r["updated_at"]) if rows else None
    if not UUID_RE.match(document_id):
        return None
    rows = _req("GET", _rest("document_imports"), user, params={
        "user_id": f"eq.{user.id}", "document_id": f"eq.{document_id}", "select": IMPORT_FIELDS,
        "order": "updated_at.desc", "limit": "1"}).json()
    return rows[0] if rows else None


def ner_search(user: CurrentUser, query: str) -> set[str]:
    """Search owner-scoped annotations, excluding rejected imports."""
    from app.services.document_intelligence import fold

    if not settings.supabase_enabled:
        rows = [r for r in _imports.values() if r["user_id"] == user.id and r["status"] != "rejected"]
    else:
        rows = _req("GET", _rest("document_imports"), user, params={
            "user_id": f"eq.{user.id}", "status": "neq.rejected",
            "select": "document_id,terms:extraction->nerTerms",
            "order": "updated_at.desc", "limit": 200,
        }).json()
    return {str(r["document_id"]) for r in rows if r.get("document_id") and any(
        query in fold(term.get("text")) for term in
        (r.get("terms") or (r.get("extraction") or {}).get("nerTerms") or [])
    )}


def save_import(user: CurrentUser, row: dict, import_id: str | None = None) -> dict:
    """Insert (import_id None) or update an import row."""
    row = {**row, "updated_at": _now()}
    if not settings.supabase_enabled:
        if import_id:
            _imports[import_id].update(row)
            return _imports[import_id]
        new = {"id": f"imp_{uuid.uuid4().hex[:12]}", "user_id": user.id, "created_at": _now(), "confirmed_at": None,
               "history": [], "duplicates": [], "contradictions": [], **row}
        _imports[new["id"]] = new
        return new
    if import_id:
        rows = _req("PATCH", _rest("document_imports"), user, params={"id": f"eq.{import_id}", "user_id": f"eq.{user.id}"},
                    json=row, headers={"Prefer": "return=representation"}).json()
    else:
        rows = _req("POST", _rest("document_imports"), user, expected=(201,), json={"user_id": user.id, **row},
                    headers={"Prefer": "return=representation"}).json()
    return rows[0]


# ─────────────────────────────────────────────────────────── facts

def replace_facts(user: CurrentUser, document_id: str, rows: list[dict]) -> None:
    """Facts of ONE document, replaced on the patient's explicit confirmation (idempotent by fingerprint)."""
    if not settings.supabase_enabled:
        _facts[document_id] = [{"id": f"fact_{uuid.uuid4().hex[:10]}", "user_id": user.id, "document_id": document_id,
                                "created_at": _now(), **r} for r in rows]
        return
    previous = _req("GET", _rest("document_facts"), user, params={
        "document_id": f"eq.{document_id}", "user_id": f"eq.{user.id}", "select": "kind,label,detail,status,value,event_date,"
        "source_page,source_excerpt,fingerprint,edited,import_id"}).json()
    _req("DELETE", _rest("document_facts"), user, expected=(200, 204),
         params={"document_id": f"eq.{document_id}", "user_id": f"eq.{user.id}"})
    if not rows:
        return
    body = [{"user_id": user.id, "document_id": document_id, **r} for r in rows]
    try:
        _req("POST", _rest("document_facts"), user, expected=(201,), json=body, headers={"Prefer": "return=minimal"})
    except SupabaseError:
        if previous:  # never lose confirmed facts because the new set could not be stored
            _request("POST", _rest("document_facts"), user, expected=(201, 400, 409),
                     json=[{"user_id": user.id, "document_id": document_id, **r} for r in previous],
                     headers={"Prefer": "return=minimal"})
        raise


def list_facts(user: CurrentUser, patient_id: str | None = None, document_id: str | None = None) -> list[dict]:
    """Confirmed facts of the user (or, for a doctor, of a patient who granted 'documents' — RLS checks it)."""
    owner = patient_id or user.id
    if not settings.supabase_enabled:
        docs = {d["id"]: d for d in _demo_docs(owner)}
        out = []
        for doc_id, rows in _facts.items():
            if document_id and doc_id != document_id:
                continue
            for r in rows:
                if r["user_id"] == owner:
                    d = docs.get(doc_id, {})
                    out.append({**r, "document_title": d.get("title"), "is_demo": bool(d.get("is_demo"))})
        return out
    params = {"user_id": f"eq.{owner}", "select": f"{FACT_FIELDS},medical_documents(title,is_demo)",
              "order": "event_date.desc.nullslast", "limit": "2000"}
    if document_id:
        if not UUID_RE.match(document_id):
            return []
        params["document_id"] = f"eq.{document_id}"
    rows = _req("GET", _rest("document_facts"), user, params=params).json()
    out = []
    for r in rows:
        doc = r.pop("medical_documents", None) or {}
        out.append({**r, "document_title": doc.get("title"), "is_demo": bool(doc.get("is_demo"))})
    return out


def facts_or_empty(user: CurrentUser, patient_id: str | None = None) -> list[dict]:
    """Record / FHIR / timeline: confirmed facts, or [] before the migration (the record still works)."""
    try:
        return list_facts(user, patient_id)
    except FeatureNotSetUp:
        return []


# ─────────────────────────────────────────────────────────── AI usage (no PHI)

_usage: list[dict] = []


def usage_insert(user: CurrentUser, row: dict) -> None:
    _usage.append({"user_id": user.id, "created_at": _now(), **row})
    del _usage[:-5000]
    if settings.supabase_enabled:
        try:
            _request("POST", _rest("ai_usage_log"), user, expected=(201, 400, 404), json={"user_id": user.id, **row},
                     headers={"Prefer": "return=minimal"})
        except SupabaseError:
            pass  # monitoring must never break an import


def usage_list(user: CurrentUser, since_iso: str) -> list[dict]:
    if settings.supabase_enabled:
        try:
            res = _request("GET", _rest("ai_usage_log"), user, expected=(200, 400, 404), params={
                "user_id": f"eq.{user.id}", "created_at": f"gte.{since_iso}", "order": "created_at.desc", "limit": "1000",
                "select": "feature,model,prompt_tokens,output_tokens,est_cost_usd,status,created_at"})
            if res.status_code == 200:
                return res.json()
        except SupabaseError:
            pass
    return sorted((r for r in _usage if r["user_id"] == user.id and r["created_at"] >= since_iso),
                  key=lambda r: r["created_at"], reverse=True)


def reset_usage() -> None:
    _usage.clear()



def demo_timeline(user: CurrentUser, document_id: str, title: str, category: str, event_date: str | None,
                  facts: list[dict]) -> None:
    """Demo mode only (Supabase derives the timeline on read): document + confirmed diagnoses on the Medical Timeline."""
    from app.schemas.patient import MedicalEvent
    record = patient_service.get_patient(user.id)
    if record is None:
        return
    record.history = [e for e in record.history if e.document_id != document_id]
    label = document_storage.TYPE_LABELS.get(category, "Document")
    record.history.insert(0, MedicalEvent(id=f"ev_doc_{document_id}", type="document", title=title, description=f"{label}.",
                                          date=event_date or _now(), document_id=document_id, details={"Type": label}))
    for f in facts:
        if f["kind"] == "diagnosis" and f.get("event_date") and f.get("status") != "ruled_out":
            record.history.insert(0, MedicalEvent(
                id=f"ev_fact_{f['fingerprint']}", type="diagnosis", title=f["label"],
                description=f"Documented ({f.get('status') or 'confirmed'}).", date=f["event_date"], document_id=document_id,
                details={"Status": f.get("status") or "confirmed", "Document": title}))
    record.history.sort(key=lambda e: e.date, reverse=True)
