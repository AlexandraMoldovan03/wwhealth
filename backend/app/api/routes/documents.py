from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.api.supabase_errors import supabase_errors
from app.api.uploads import read_upload
from app.core.config import settings
from app.core.security import CurrentUser, get_current_user
from app.schemas.document import (
    DocumentAnalyzeResponse,
    DocumentType,
    DocumentUploadResponse,
    ExtractedLabValue,
    LabExtractionResponse,
    LabValuesSave,
)
from app.services import document_service, document_storage, lab_extraction, supabase_repo

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/analyze", response_model=DocumentAnalyzeResponse)
async def analyze(
    file: UploadFile = File(...),
    document_type: DocumentType = Form("other", alias="documentType"),
    title: str = Form(""),
    user: CurrentUser = Depends(get_current_user),
) -> DocumentAnalyzeResponse:
    content = await read_upload(file)
    document = document_service.analyze_document(user.id, content, file.filename or "document", document_type, title)
    return DocumentAnalyzeResponse(document=document)


UPLOAD_TYPES = {"application/pdf", "image/jpeg", "image/png"}


@router.post("/extract-labs", response_model=LabExtractionResponse)
async def extract_labs(file: UploadFile = File(...), user: CurrentUser = Depends(get_current_user)) -> LabExtractionResponse:
    """Digital PDFs only. Text is read locally on this server; nothing is stored or sent elsewhere.
    Returns only values written explicitly in the document, for the user to verify before saving."""
    _ = user  # authenticated users only
    content = await read_upload(file, allowed={"application/pdf"})
    try:
        text, pages = lab_extraction.extract_text(content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="This PDF could not be read") from exc
    values = lab_extraction.parse_lab_values(text)
    return LabExtractionResponse(text_found=bool(text.strip()), page_count=pages,
                                 values=[ExtractedLabValue.model_validate(v) for v in values])


@router.get("/{document_id}/lab-values", response_model=list[ExtractedLabValue])
def get_lab_values(document_id: str, user: CurrentUser = Depends(get_current_user)) -> list[ExtractedLabValue]:
    with supabase_errors():
        rows = supabase_repo.get_lab_values(user, document_id) if settings.supabase_enabled else lab_extraction.demo_get(user.id, document_id)
    return [ExtractedLabValue.model_validate(r) for r in rows]


@router.put("/{document_id}/lab-values", response_model=list[ExtractedLabValue])
def save_lab_values(document_id: str, body: LabValuesSave, user: CurrentUser = Depends(get_current_user)) -> list[ExtractedLabValue]:
    """Saves the values the user verified / edited (replaces previous ones for that document)."""
    values = [v.model_dump() for v in body.values]
    with supabase_errors():
        if settings.supabase_enabled:
            rows = supabase_repo.save_lab_values(user, document_id, values)
        else:
            rows = lab_extraction.demo_save(user.id, document_id, values)
    if rows is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return [ExtractedLabValue.model_validate(r) for r in rows]


@router.post("", response_model=DocumentUploadResponse, status_code=201)
async def upload(
    file: UploadFile = File(...),
    document_type: DocumentType = Form("other", alias="documentType"),
    title: str = Form("", max_length=120),
    user: CurrentUser = Depends(get_current_user),
) -> DocumentUploadResponse:
    """Stores a PDF/JPEG/PNG privately for the current user (no OCR / AI). 415 type, 413 > 10 MB."""
    content = await read_upload(file, allowed=UPLOAD_TYPES)
    try:
        with supabase_errors():
            if settings.supabase_enabled:
                document = supabase_repo.store_document(user, content, document_type, title, file.filename or "")
            else:
                document = document_storage.store_document(user.id, content, document_type, title, file.filename or "")
    except document_storage.InvalidDocumentError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return DocumentUploadResponse(document=document)


@router.get("/{document_id}/file")
def download(document_id: str, user: CurrentUser = Depends(get_current_user)) -> Response:
    """The file, only for its owner. 404 for missing or someone else's document (no existence leak)."""
    with supabase_errors():
        if settings.supabase_enabled:
            found = supabase_repo.get_document_file(user, document_id)
        else:
            local = document_storage.get_document_file(user.id, document_id)
            found = (local[0].read_bytes(), local[1], local[0].name) if local else None
    if found is None:
        raise HTTPException(status_code=404, detail="Document not found")
    content, mime_type, filename = found
    return Response(
        content,
        media_type=mime_type,
        headers={
            "Cache-Control": "no-store, private",
            "Content-Disposition": f'inline; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
        },
    )
