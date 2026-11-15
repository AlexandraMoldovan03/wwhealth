"""
Patient / doctor exports: FHIR R4 (collection + IPS-inspired emergency summary), CSV lab history, PDF, ZIP.

Patient: own data only. Doctor: only the sections the patient granted (active consent, doctor role) — the same
consent check and FHIR export log as GET /care/doctor/patients/{id}/fhir. Every export is logged.
"""
from collections.abc import Callable

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.api.routes.care_journey import _doctor_data, _own_data, _run
from app.core.config import settings
from app.core.security import CurrentUser, get_sensitive_doctor, get_sensitive_user
from app.core import rate_limit
from app.services import doctor_access_service, document_storage, export_service, fhir_service, import_repo, supabase_repo
from app.services.emergency_passport import build_passport, profile_dict

router = APIRouter(prefix="/care", tags=["exports"])
Lang = Literal["ro", "en"]  # language of the PDF text (patient data is never translated)
KINDS = {"fhir": ("application/fhir+json", "wwhealth-fhir.json"),
         "emergency-summary": ("application/fhir+json", "wwhealth-emergency-summary.json"),
         "labs.csv": ("text/csv; charset=utf-8", "wwhealth-analize.csv"),
         "summary.pdf": ("application/pdf", "wwhealth-rezumat.pdf"),
         "archive.zip": ("application/zip", "wwhealth-export.zip")}


def _respond(kind: str, body: bytes | str) -> Response:
    media, filename = KINDS[kind]
    return Response(content=body.encode() if isinstance(body, str) else body, media_type=media, headers={
        "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff",
        "Content-Disposition": f'attachment; filename="{filename}"'})


def _build(kind: str, patient_id: str, record, documents, labs, plans, appts, facts,
           fetch: Callable[[str], tuple[bytes, str, str] | None] | None, lang: str = "ro") -> bytes | str:
    import json
    if kind == "labs.csv":
        return export_service.labs_csv(labs)
    passport = build_passport(profile_dict(record), facts=facts, labs=labs or [])
    if kind == "summary.pdf":
        return export_service.summary_pdf(record, passport, labs, lang)
    summary = export_service.emergency_summary(patient_id, record, labs, facts, passport)
    if kind == "emergency-summary":
        return json.dumps(summary, ensure_ascii=False)
    bundle = fhir_service.validate(fhir_service.bundle(patient_id, record, documents, labs, plans, appts, facts=facts))
    if kind == "fhir":
        return json.dumps(bundle, ensure_ascii=False)
    return export_service.archive_zip(bundle, summary, export_service.labs_csv(labs),
                                      export_service.summary_pdf(record, passport, labs, lang), documents, fetch)


def _guard(fn: Callable[[], bytes | str], kind: str) -> Response:
    try:
        return _respond(kind, fn())
    except fhir_service.FhirValidationError as exc:  # never ship an invalid bundle; no patient data in the error
        raise HTTPException(status_code=500, detail="export_validation_failed") from exc


def _own(user: CurrentUser, kind: str, lang: str = "ro") -> bytes | str:
    record, documents, labs, plans, appts = _own_data(user, "en")
    if settings.supabase_enabled:
        supabase_repo.log_fhir_export(user, user.id)
        fetch = lambda doc_id: supabase_repo.get_document_file(user, doc_id)  # noqa: E731
    else:
        def fetch(doc_id: str):
            local = document_storage.get_document_file(user.id, doc_id)
            return (local[0].read_bytes(), local[1], local[0].name) if local else None
    return _build(kind, user.id, record, documents, labs, plans, appts, import_repo.facts_or_empty(user), fetch, lang)


def _doctor(doctor: CurrentUser, patient_id: str, kind: str, lang: str = "ro") -> bytes | str:
    o, record, documents, labs, plans, appts = _doctor_data(doctor, patient_id)  # 403 without an active grant
    scopes = o.get("scopes") or []
    if settings.supabase_enabled:
        supabase_repo.log_fhir_export(doctor, patient_id)

    def fetch(doc_id: str):
        status, found = doctor_access_service.document_file(doctor, patient_id, doc_id)  # re-checked + logged per file
        return found if status == "ok" else None
    return _build(kind, patient_id, record, documents, labs, plans, appts,
                  doctor_access_service.documented_facts(doctor, patient_id, scopes),
                  fetch if "documents" in scopes else None, lang)


def _register(kind: str) -> None:
    @router.get(f"/export/{kind}", name=f"export_{kind}")
    def own(lang: Lang = Query("ro"), user: CurrentUser = Depends(get_sensitive_user)) -> Response:
        rate_limit.hit(f"export:{user.id}", settings.exports_per_hour, 3600)
        return _guard(lambda: _run(_own, user, kind, lang), kind)

    @router.get(f"/doctor/patients/{{patient_id}}/export/{kind}", name=f"doctor_export_{kind}")
    def doctor(patient_id: str, lang: Lang = Query("ro"), doctor: CurrentUser = Depends(get_sensitive_doctor)) -> Response:
        rate_limit.hit(f"export:{doctor.id}", settings.exports_per_hour, 3600)
        return _guard(lambda: _run(_doctor, doctor, patient_id, kind, lang), kind)


for _kind in KINDS:
    _register(_kind)
