"""
Private storage for uploaded medical documents (PDF / JPEG / PNG). No OCR or AI.

- Files live in settings.documents_storage_dir/<patient_id>/<document_id>.<ext>, outside any static or
  public folder, with owner-only permissions. They are only returned by an authenticated route that
  checks the document belongs to the current user.
- Paths are built only from server-generated ids, never from the uploaded filename.
TODO(backend): move metadata to PostgreSQL (the in-memory record is lost on restart; files stay on disk).
"""
import os
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import BACKEND_DIR, settings
from app.schemas.document import DocumentType, MedicalDocument
from app.schemas.patient import MedicalEvent
from app.services import patient_service

SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
EXTENSIONS = {"application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png",
              # Smart Import (stored as received, read locally — never executed or served inline as HTML)
              "application/fhir+json": "json", "application/x-ndjson": "ndjson", "text/csv": "csv"}
TYPE_LABELS = {
    "lab_result": "Lab result",
    "prescription": "Prescription",
    "discharge_summary": "Discharge summary",
    "imaging_report": "Imaging report",
    "other": "Other",
    "consultation": "Consultation",
    "trauma": "Accident / trauma",
    "surgery": "Surgery",
    "vaccination": "Vaccination",
}


class InvalidDocumentError(ValueError):
    """Message is safe to show to the user."""


def detect_mime(content: bytes) -> str:
    """Real file type from the first bytes — the client's Content-Type is not trusted."""
    if content.startswith(b"%PDF-"):
        return "application/pdf"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    raise InvalidDocumentError("Only PDF, JPEG and PNG files are supported.")


def _storage_root() -> Path:
    root = settings.documents_storage_dir
    return root if root.is_absolute() else BACKEND_DIR / root


def _file_path(patient_id: str, document_id: str, mime_type: str) -> Path:
    if not SAFE_ID.match(patient_id) or not SAFE_ID.match(document_id):
        raise InvalidDocumentError("Invalid id.")
    return _storage_root() / patient_id / f"{document_id}.{EXTENSIONS[mime_type]}"


def _write_private(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as fh:
        fh.write(content)


def store_document(patient_id: str, content: bytes, document_type: DocumentType, title: str, filename: str) -> MedicalDocument:
    record = patient_service.get_patient(patient_id)
    if record is None:
        raise InvalidDocumentError("Patient not found.")
    mime_type = detect_mime(content)
    document_id = f"doc_{uuid.uuid4().hex[:12]}"
    _write_private(_file_path(patient_id, document_id, mime_type), content)

    uploaded_at = datetime.now(UTC).isoformat()
    label = TYPE_LABELS[document_type]
    clean_title = (title.strip() or Path(filename).stem or label)[:120]
    document = MedicalDocument(
        id=document_id,
        title=clean_title,
        type=document_type,
        uploaded_at=uploaded_at,
        file_url=f"/api/v1/documents/{document_id}/file",
        mime_type=mime_type,
        size_bytes=len(content),
        status="uploaded",
        extraction=None,
        is_demo=False,
    )
    record.documents.insert(0, document)
    record.history.insert(0, MedicalEvent(
        id=f"ev_{uuid.uuid4().hex[:10]}",
        type="document",
        title=clean_title,
        description=f"{label} uploaded.",
        date=uploaded_at,
        details={
            "Type": label,
            "Format": "PDF" if mime_type == "application/pdf" else "Image",
            "Size": f"{max(1, round(len(content) / 1024))} KB",
        },
        document_id=document_id,
    ))
    return document


def get_document_file(patient_id: str, document_id: str) -> tuple[Path, str] | None:
    """Returns (path, mime) only if the document belongs to this patient and the file exists."""
    record = patient_service.get_patient(patient_id)
    if record is None:
        return None
    document = next((d for d in record.documents if d.id == document_id), None)
    if document is None or document.mime_type not in EXTENSIONS:
        return None
    try:
        path = _file_path(patient_id, document_id, document.mime_type)
    except InvalidDocumentError:
        return None
    return (path, document.mime_type) if path.is_file() else None
