"""Mirror of frontend/types/medical.ts (mobile) and docs/API_CONTRACT.md."""
from datetime import date
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.base import CamelModel
from app.schemas.document import MedicalDocument
from app.schemas.xray import XrayAnalysis


class Allergy(CamelModel):
    id: str
    substance: str
    reaction: str
    severity: Literal["mild", "moderate", "severe"]


class Diagnosis(CamelModel):
    id: str
    name: str
    icd10: str | None = None
    diagnosed_at: str
    status: Literal["active", "resolved"]


class Treatment(CamelModel):
    id: str
    name: str
    dosage: str
    frequency: str
    start_date: str
    end_date: str | None = None
    active: bool


class Surgery(CamelModel):
    """Surgical history (medical_profiles.surgeries). Date: YYYY, YYYY-MM or YYYY-MM-DD, as the patient knows it."""
    id: str
    name: str
    date: str | None = None
    notes: str = ""


class EmergencyContact(CamelModel):
    name: str
    phone: str
    relation: str


class MedicalEvent(CamelModel):
    id: str
    type: Literal["diagnosis", "treatment", "allergy", "document", "xray", "visit"]
    title: str
    description: str
    date: str
    details: dict[str, str] = {}
    document_id: str | None = None  # set for type == "document" → open the file


class PatientRecord(CamelModel):
    id: str
    full_name: str
    date_of_birth: str | None = None  # null until the user fills it in
    sex: Literal["female", "male", "other"] | None = None
    blood_type: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    emergency_contact: EmergencyContact | None = None
    allergies: list[Allergy] = []
    diagnoses: list[Diagnosis] = []
    treatments: list[Treatment] = []
    surgeries: list[Surgery] = []
    history: list[MedicalEvent] = []
    documents: list[MedicalDocument] = []
    xrays: list[XrayAnalysis] = []


# ---------- PATCH /api/v1/patients/me ----------

BloodType = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
Severity = Literal["mild", "moderate", "severe"]


class AllergyInput(CamelModel):
    id: str | None = None  # existing id to keep, omit for new items
    substance: str = Field(min_length=1, max_length=100)
    reaction: str = Field(default="", max_length=200)
    severity: Severity = "mild"


class DiagnosisInput(CamelModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=120)
    icd10: str | None = Field(default=None, max_length=10)
    diagnosed_at: str | None = Field(default=None, max_length=10)  # YYYY-MM-DD, defaults to today
    status: Literal["active", "resolved"] = "active"


class TreatmentInput(CamelModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=120)
    dosage: str = Field(default="", max_length=60)
    frequency: str = Field(default="", max_length=60)
    start_date: str | None = Field(default=None, max_length=10)
    end_date: str | None = Field(default=None, max_length=10)
    active: bool = True


class SurgeryInput(CamelModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=120)
    date: str | None = Field(default=None, pattern=r"^\d{4}(-\d{2}(-\d{2})?)?$")
    notes: str = Field(default="", max_length=200)


class EmergencyContactInput(CamelModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=3, max_length=40, pattern=r"^[0-9+()./ -]{3,40}$")
    relation: str = Field(default="", max_length=40)


class ProfileUpdate(CamelModel):
    """Only the fields that are sent are changed. Lists replace the whole list."""

    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    date_of_birth: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    sex: Literal["female", "male", "other"] | None = None
    height_cm: float | None = Field(default=None, ge=30, le=260)
    weight_kg: float | None = Field(default=None, ge=1, le=400)
    emergency_contact: EmergencyContactInput | None = None
    blood_type: BloodType | None = None
    allergies: list[AllergyInput] | None = Field(default=None, max_length=50)
    diagnoses: list[DiagnosisInput] | None = Field(default=None, max_length=50)
    treatments: list[TreatmentInput] | None = Field(default=None, max_length=50)
    surgeries: list[SurgeryInput] | None = Field(default=None, max_length=50)

    @field_validator("date_of_birth")
    @classmethod
    def _real_past_date(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            born = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("invalid date") from exc
        if born > date.today() or born.year < 1900:
            raise ValueError("date of birth out of range")
        return value

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("name required")
        return value.strip() if value else value
