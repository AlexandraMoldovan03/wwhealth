from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.uploads import read_upload
from app.core.security import CurrentUser, get_current_user
from app.schemas.document import DocumentAnalyzeResponse, DocumentType
from app.services import document_service

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
