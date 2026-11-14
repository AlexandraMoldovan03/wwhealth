"""Mirror of src/types/medical.ts (mobile) and docs/API_CONTRACT.md."""
from typing import Literal

from pydantic import Field

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


class ProfileUpdate(CamelModel):
    """Only the fields that are sent are changed. Lists replace the whole list."""

    blood_type: BloodType | None = None
    allergies: list[AllergyInput] | None = Field(default=None, max_length=50)
    diagnoses: list[DiagnosisInput] | None = Field(default=None, max_length=50)
    treatments: list[TreatmentInput] | None = Field(default=None, max_length=50)
