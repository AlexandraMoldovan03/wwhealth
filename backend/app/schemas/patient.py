"""Mirror of src/types/medical.ts (mobile) and docs/API_CONTRACT.md."""
from typing import Literal

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


class PatientRecord(CamelModel):
    id: str
    full_name: str
    date_of_birth: str
    sex: Literal["female", "male", "other"]
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
