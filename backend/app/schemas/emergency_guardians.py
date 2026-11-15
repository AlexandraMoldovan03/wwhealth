"""Emergency guardians — mirror of frontend/types/emergencyGuardians.ts (mobile)."""
from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.emergency import EmergencyAllergy, EmergencyCondition, EmergencyMedication
from app.schemas.emergency_passport import PrioritizedPassport
from app.schemas.patient import EmergencyContact


class GuardianInviteRequest(CamelModel):
    email: str = Field(min_length=3, max_length=254)
    relation: str = Field(default="", max_length=40)


class GuardianLink(CamelModel):
    """Patient side: someone I invited (pending) or who accepted (active)."""
    id: str
    email: str
    relation: str = ""
    status: Literal["pending", "active", "declined"]
    guardian_name: str | None = None
    created_at: str
    responded_at: str | None = None


class GuardianInvitation(CamelModel):
    """Guardian side: a pending invitation sent to my (confirmed) email."""
    id: str
    patient_name: str
    relation: str = ""
    created_at: str


class ProtectedPatient(CamelModel):
    """Guardian side: a patient I am an active emergency person for."""
    id: str
    patient_id: str
    patient_name: str
    relation: str = ""
    since: str | None = None


class GuardianOverview(CamelModel):
    guardians: list[GuardianLink] = []
    invitations: list[GuardianInvitation] = []
    protecting: list[ProtectedPatient] = []


class GuardianEmergencyView(CamelModel):
    """ONLY emergency data — no documents, labs, history or other profile fields."""
    patient_name: str
    blood_type: str | None = None
    allergies: list[EmergencyAllergy] = []
    conditions: list[EmergencyCondition] = []    # active only
    medications: list[EmergencyMedication] = []  # active only
    emergency_contact: EmergencyContact | None = None
    accessed_at: str
    passport: PrioritizedPassport | None = None
