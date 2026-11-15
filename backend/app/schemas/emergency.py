"""Emergency Medical Passport — mirror of frontend/types/emergency.ts (mobile)."""
from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.emergency_passport import PrioritizedPassport


class EmergencyTokenResponse(CamelModel):
    token_id: str
    token: str          # random, no medical data; shown once, only its SHA-256 is stored
    qr_payload: str     # wwhealth://emergency/<token>
    expires_at: str
    ttl_seconds: int


class EmergencyTokenStatus(CamelModel):
    status: Literal["active", "used", "revoked", "expired", "not_found"]


class EmergencyRedeemRequest(CamelModel):
    token: str = Field(min_length=10, max_length=200)  # raw token or the full QR payload


class EmergencyAllergy(CamelModel):
    substance: str
    reaction: str = ""
    severity: Literal["mild", "moderate", "severe"] | None = None


class EmergencyCondition(CamelModel):
    name: str
    icd10: str | None = None


class EmergencyMedication(CamelModel):
    name: str
    dosage: str = ""
    frequency: str = ""


class EmergencyData(CamelModel):
    """ONLY what a doctor needs in an emergency — no name, contact, documents or history."""
    blood_type: str | None = None
    allergies: list[EmergencyAllergy] = []
    conditions: list[EmergencyCondition] = []    # active only
    medications: list[EmergencyMedication] = []  # active only
    accessed_at: str
    # Same data, prioritised (critical → essential → abnormal labs). Normal labs are never sent here.
    passport: PrioritizedPassport | None = None


class EmergencyAccessEvent(CamelModel):
    id: str
    event: Literal["created", "revoked", "viewed", "denied"]
    reason: Literal["not_found", "expired", "used", "revoked", "not_doctor"] | None = None
    actor_name: str | None = None
    created_at: str
