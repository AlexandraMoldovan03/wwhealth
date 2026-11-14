"""Universal Smart Import (Upload → Parse → Extract → Preview → Confirm → Save) and the Document Library.
Every route acts only on the signed-in user's own data (checked here and again by Postgres RLS in Supabase mode).
Opening the library or a document NEVER calls Gemini."""
import json
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from app.api.supabase_errors import supabase_errors
from app.api.uploads import MAX_UPLOAD_BYTES
from app.core.security import CurrentUser, get_current_user
from app.schemas.smart_import import (
    AiUsageSummary,
    DocumentDetail,
    DocumentFact,
    DocumentUpdate,
    ImportConfirm,
    ImportPreview,
    LibraryPage,
)
from app.services import ai_usage, document_storage, smart_import_service

router = APIRouter(tags=["smart-import"])

# The real type is detected from the content; these are only the Content-Types a picker may send.
IMPORT_TYPES = {"application/pdf", "image/jpeg", "image/png", "application/json", "application/fhir+json",
                "application/x-ndjson", "application/ndjson", "text/csv", "text/plain", "application/csv",
                "application/vnd.ms-excel", "application/octet-stream", "text/comma-separated-values"}


@contextmanager
def import_errors() -> Iterator[None]:
    try:
        with supabase_errors():
            yield
    except smart_import_service.ImportFailure as exc:
        raise HTTPException(status_code=exc.status, detail=exc.code) from exc
    except document_storage.InvalidDocumentError as exc:
        raise HTTPException(status_code=400, detail="invalid_document") from exc


def _run(fn: Callable, *args, **kwargs):
    with import_errors():
        return fn(*args, **kwargs)


@router.post("/imports", response_model=ImportPreview, status_code=201)
async def create_import(file: UploadFile = File(...), csv_mapping: str | None = Form(None, alias="csvMapping", max_length=2000),
                        user: CurrentUser = Depends(get_current_user)) -> ImportPreview:
    """Analyses the file and returns a PREVIEW. Nothing is integrated into the record before /confirm."""
    if file.content_type not in IMPORT_TYPES:
        raise HTTPException(status_code=415, detail="unsupported_format")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="empty_file")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="file_too_large")
    mapping = None
    if csv_mapping:
        try:
            raw = json.loads(csv_mapping)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="csv_mapping_invalid") from exc
        if not isinstance(raw, dict):
            raise HTTPException(status_code=422, detail="csv_mapping_invalid")
        mapping = {"reference_range" if k == "referenceRange" else k: str(v)[:80] for k, v in raw.items() if isinstance(v, str)}
    from starlette.concurrency import run_in_threadpool  # Gemini / OCR are blocking
    with import_errors():
        return await run_in_threadpool(smart_import_service.upload, user, content, file.filename or "", mapping)


@router.get("/imports/usage", response_model=AiUsageSummary)
def usage(user: CurrentUser = Depends(get_current_user)) -> AiUsageSummary:
    """Gemini usage of the current user (calls, tokens, estimated cost) — no medical content."""
    return _run(ai_usage.summary, user)


@router.get("/imports/{import_id}", response_model=ImportPreview)
def get_import(import_id: str, user: CurrentUser = Depends(get_current_user)) -> ImportPreview:
    return _run(smart_import_service.get, user, import_id)


@router.post("/imports/{import_id}/confirm", response_model=ImportPreview)
def confirm_import(import_id: str, body: ImportConfirm, user: CurrentUser = Depends(get_current_user)) -> ImportPreview:
    """Saves what the patient confirmed / corrected. Never changes the medical profile or active medication."""
    return _run(smart_import_service.confirm, user, import_id, body)


@router.post("/imports/{import_id}/reject", response_model=ImportPreview)
def reject_import(import_id: str, user: CurrentUser = Depends(get_current_user)) -> ImportPreview:
    return _run(smart_import_service.reject, user, import_id)


@router.post("/imports/{import_id}/reanalyze", response_model=ImportPreview)
def reanalyze_import(import_id: str, user: CurrentUser = Depends(get_current_user)) -> ImportPreview:
    """Explicit request only (may use Gemini with the patient's AI consent)."""
    return _run(smart_import_service.reanalyze, user, import_id)


Sort = Literal["date", "title", "uploaded"]


@router.get("/library", response_model=LibraryPage)
def library(q: str | None = Query(None, max_length=120), category: str | None = Query(None, max_length=30),
            specialty: str | None = Query(None, max_length=40), institution: str | None = Query(None, max_length=160),
            date_from: str | None = Query(None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
            date_to: str | None = Query(None, alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
            sort: Sort = "date", order: Literal["asc", "desc"] = "desc",
            user: CurrentUser = Depends(get_current_user)) -> LibraryPage:
    return _run(smart_import_service.library, user, q, category, specialty, institution, date_from, date_to, sort, order)


@router.get("/library/facts", response_model=list[DocumentFact])
def library_facts(user: CurrentUser = Depends(get_current_user)) -> list[DocumentFact]:
    return _run(smart_import_service.facts, user)


@router.get("/library/{document_id}", response_model=DocumentDetail)
def library_document(document_id: str, user: CurrentUser = Depends(get_current_user)) -> DocumentDetail:
    return _run(smart_import_service.detail, user, document_id)


@router.patch("/library/{document_id}", response_model=DocumentDetail)
def update_document(document_id: str, body: DocumentUpdate, user: CurrentUser = Depends(get_current_user)) -> DocumentDetail:
    """Edit the title (AI-proposed or not) / category / date / institution. The original file never changes."""
    return _run(smart_import_service.update, user, document_id, body)
