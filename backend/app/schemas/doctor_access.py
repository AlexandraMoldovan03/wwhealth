"""Doctor Access & Consent — patient-granted, time-limited access of a verified doctor to chosen sections."""
from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.document import MedicalDocument, PatientLabValue
from app.schemas.patient import Allergy, Diagnosis, Treatment

DoctorScope = Literal["profile", "documents", "labs"]
GrantStatus = Literal["active", "expired", "revoked"]
# ok = data returned · none = no consent · expired / revoked = consent ended · forbidden = not a doctor
OpenStatus = Literal["ok", "none", "expired", "revoked", "forbidden"]


class VerifiedDoctor(CamelModel):
    id: str
    full_name: str
    doctor_code: str


class GrantRequest(CamelModel):
    """Exactly one of doctor_id (picked from the verified list) or doctor_code (typed by the patient)."""
    doctor_id: str | None = Field(default=None, max_length=64)
    doctor_code: str | None = Field(default=None, max_length=16)
    scopes: list[DoctorScope] = Field(min_length=1, max_length=3)
    duration_hours: Literal[1, 24, 168]


class DoctorGrant(CamelModel):
    id: str
    doctor_id: str
    doctor_name: str | None = None
    doctor_code: str | None = None
    scopes: list[DoctorScope]
    created_at: str
    expires_at: str
    revoked_at: str | None = None
    status: GrantStatus


class AccessEvent(CamelModel):
    id: str
    event: Literal["granted", "revoked", "viewed", "denied"]
    section: str | None = None
    reason: str | None = None
    doctor_name: str | None = None
    created_at: str


class AccessOverview(CamelModel):
    grants: list[DoctorGrant]
    events: list[AccessEvent]


class DoctorPatient(CamelModel):
    patient_id: str
    full_name: str
    grant_id: str
    scopes: list[DoctorScope]
    created_at: str
    expires_at: str
    revoked_at: str | None = None
    status: GrantStatus


class DoctorIdentity(CamelModel):
    full_name: str
    doctor_code: str | None = None


# ---------- Medical Summary (structured, built only from existing authorised data — no AI, no diagnosis) ----------

class SummaryBasics(CamelModel):
    date_of_birth: str | None = None
    sex: str | None = None
    blood_type: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None


class LatestLab(CamelModel):
    name: str
    value: str
    unit: str | None = None
    reference_range: str | None = None
    date: str | None = None
    document_title: str | None = None
    measurements: int = 1


class MedicalSummary(CamelModel):
    """Sections that were not shared are null (not empty), so the UI can say "not shared"."""
    basics: SummaryBasics | None = None
    allergies: list[Allergy] | None = None
    conditions: list[Diagnosis] | None = None
    medications: list[Treatment] | None = None
    latest_labs: list[LatestLab] | None = None
    documents: list[MedicalDocument] | None = None


class PatientAccessView(CamelModel):
    status: OpenStatus
    patient_id: str
    patient_name: str | None = None
    scopes: list[DoctorScope] = []
    expires_at: str | None = None
    summary: MedicalSummary | None = None
    documents: list[MedicalDocument] | None = None
    labs: list[PatientLabValue] | None = None
