from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel

DocumentType = Literal["lab_result", "prescription", "discharge_summary", "imaging_report", "other"]


class LabValue(CamelModel):
    name: str
    value: str
    unit: str | None = None
    flag: Literal["low", "normal", "high"] | None = None


class DocumentExtraction(CamelModel):
    summary: str
    diagnoses: list[str] = []
    allergies: list[str] = []
    medications: list[str] = []
    lab_values: list[LabValue] = []


class MedicalDocument(CamelModel):
    id: str
    title: str
    type: DocumentType
    uploaded_at: str
    file_url: str | None = None  # API path, requires auth (e.g. /api/v1/documents/{id}/file)
    mime_type: str | None = None
    size_bytes: int | None = None
    status: Literal["uploaded", "processing", "analyzed", "failed"]
    extraction: DocumentExtraction | None = None
    is_demo: bool = False


class DocumentAnalyzeResponse(CamelModel):
    document: MedicalDocument


class DocumentUploadResponse(CamelModel):
    document: MedicalDocument


# ---------- AI Medical Document Scanner (local, digital PDFs only) ----------

ISO_DATE = r"^\d{4}-\d{2}-\d{2}$"


class ExtractedLabValue(CamelModel):
    name: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=20)
    unit: str | None = Field(default=None, max_length=20)
    reference_range: str | None = Field(default=None, max_length=40)
    source_line: str | None = Field(default=None, max_length=200)  # exact line it was read from
    # Date of the analysis as written in the document (confirmed / edited by the user), ISO yyyy-mm-dd.
    measured_at: str | None = Field(default=None, pattern=ISO_DATE)
    # Extraction only (never stored): OCR or incomplete line → must be confirmed manually.
    needs_review: bool = False


class LabExtractionResponse(CamelModel):
    text_found: bool
    page_count: int
    method: Literal["text", "ocr", "none"] = "text"
    ocr_available: bool = False
    document_date: str | None = None
    values: list[ExtractedLabValue]


class PatientLabValue(ExtractedLabValue):
    """A confirmed value with its source document (Medical Timeline / trends)."""
    document_id: str
    document_title: str | None = None
    document_date: str | None = None  # upload date, used when the analysis date is unknown


class LabValuesSave(CamelModel):
    values: list[ExtractedLabValue] = Field(max_length=200)
