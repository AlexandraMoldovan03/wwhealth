"""
Prioritised Emergency Passport (patient preview) + structured per-document summary.

GET /emergency/passport           → what a doctor would see, built from MY profile + confirmed document facts +
                                    confirmed lab values (with sources, conflicts, "needs confirmation")
GET /documents/{id}/summary       → structured summary of one of MY documents (no AI prose)
Both reuse app.services.emergency_passport — the same builder as the doctor / guardian views.
"""
from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.supabase_errors import supabase_errors
from app.core.config import settings
from app.core.security import CurrentUser, get_current_user
from app.schemas.emergency_passport import DocumentSummary, PrioritizedPassport
from app.services import import_repo, lab_extraction, patient_service, smart_import_service, supabase_repo
from app.services.emergency_passport import build_document_summary, build_passport, profile_dict

router = APIRouter(tags=["emergency-passport"])
NO_STORE = {"Cache-Control": "no-store, private"}


def _labs(user: CurrentUser) -> list[dict]:
    try:
        return supabase_repo.list_lab_values(user) if settings.supabase_enabled else lab_extraction.demo_list(user.id)
    except supabase_repo.FeatureNotSetUp:
        return []


@router.get("/emergency/passport", response_model=PrioritizedPassport)
def passport_preview(response: Response, user: CurrentUser = Depends(get_current_user)) -> PrioritizedPassport:
    with supabase_errors():
        record = supabase_repo.get_record(user) if settings.supabase_enabled else patient_service.get_patient(user.id)
        facts = import_repo.facts_or_empty(user)
        labs = _labs(user)
    response.headers.update(NO_STORE)
    return build_passport(profile_dict(record), facts=facts, labs=labs)


@router.get("/documents/{document_id}/summary", response_model=DocumentSummary)
def document_summary(document_id: str, response: Response, user: CurrentUser = Depends(get_current_user)) -> DocumentSummary:
    try:
        with supabase_errors():
            detail = smart_import_service.detail(user, document_id)
            labs = (supabase_repo.get_lab_values(user, document_id) if settings.supabase_enabled
                    else lab_extraction.demo_get(user.id, document_id))
    except smart_import_service.ImportFailure as exc:
        raise HTTPException(status_code=exc.status, detail=exc.code) from exc
    doc = detail.document
    response.headers.update(NO_STORE)
    return build_document_summary(
        document_id=doc.id, document_type=doc.type, date=doc.event_date or doc.document_date,
        facts=[{**f.model_dump(), "document_title": doc.title} for f in detail.facts],
        labs=[{**v, "document_id": doc.id, "document_title": doc.title, "document_date": doc.document_date} for v in labs],
    )
