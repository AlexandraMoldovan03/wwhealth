"""Document analysis. TODO(backend): send the file to Gemini and parse the JSON into DocumentExtraction."""
import uuid
from datetime import UTC, datetime

from app.core.config import settings
from app.schemas.document import DocumentExtraction, DocumentType, MedicalDocument
from app.services import patient_service


def analyze_document(patient_id: str, content: bytes, filename: str, document_type: DocumentType, title: str) -> MedicalDocument:
    _ = content  # will be sent to Gemini
    if settings.gemini_api_key:
        pass  # TODO(backend): real Gemini call here; keep the same return type.

    document = MedicalDocument(
        id=f"doc_{uuid.uuid4().hex[:10]}",
        title=title or filename,
        type=document_type,
        uploaded_at=datetime.now(UTC).isoformat(),
        status="analyzed",
        is_demo=True,
        extraction=DocumentExtraction(summary="DEMO extraction — Gemini not connected yet."),
    )
    record = patient_service.get_patient(patient_id)
    if record:
        record.documents.insert(0, document)
    return document
