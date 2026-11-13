from typing import Literal

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
    file_url: str | None = None
    status: Literal["processing", "analyzed", "failed"]
    extraction: DocumentExtraction | None = None
    is_demo: bool = False


class DocumentAnalyzeResponse(CamelModel):
    document: MedicalDocument
