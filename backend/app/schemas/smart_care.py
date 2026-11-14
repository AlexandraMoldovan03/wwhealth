"""Smart Care: AI specialty recommendation + appointments."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.base import CamelModel


# ─────────────────────────────────────────────────────────── Gemini structured output (strict)

class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GeminiSpecialty(_Strict):
    specialty_id: str = Field(max_length=40)
    reason: str = Field(max_length=300)


class GeminiTriage(_Strict):
    symptom_summary: str = Field(max_length=600)
    suggested_specialties: list[GeminiSpecialty] = Field(default_factory=list, max_length=5)
    reasoning: str = Field(default="", max_length=800)
    clarification_questions: list[str] = Field(default_factory=list, max_length=5)
    warning_signs: list[str] = Field(default_factory=list, max_length=6)
    recommended_next_step: str = Field(default="", max_length=300)


# ─────────────────────────────────────────────────────────── API

class SpecialtyOut(CamelModel):
    id: str
    name: str


class ClarificationAnswer(CamelModel):
    question: str = Field(min_length=1, max_length=200)
    answer: str = Field(min_length=1, max_length=300)


class TriageRequest(CamelModel):
    """Symptoms the patient typed or confirmed after transcription."""
    symptoms: str = Field(min_length=3, max_length=2000)
    source: Literal["text", "voice"] = "text"
    confirmed: bool = Field(description="The patient checked the text before sending it")
    use_history: bool = False
    answers: list[ClarificationAnswer] = Field(default_factory=list, max_length=3)
    language: Literal["ro", "en"] = "ro"


class Transcript(CamelModel):
    transcript: str
    language: str | None = None
    is_demo: bool = False


class SuggestedSpecialty(CamelModel):
    id: str
    name: str
    reason: str


class EmergencyGuidance(CamelModel):
    """Rule-based (never from Gemini). call_112: call 112 now · urgent: urgent care / emergency department today."""
    level: Literal["call_112", "urgent"]
    codes: list[str]


class TriageResult(CamelModel):
    # ok: AI suggestions · emergency: rules detected red flags (AI skipped) · no_consent / not_configured / failed:
    # no AI result (manual search still works)
    status: Literal["ok", "emergency", "no_consent", "not_configured", "failed"]
    ai_used: bool
    history_used: bool
    symptom_summary: str = ""
    specialties: list[SuggestedSpecialty] = Field(default_factory=list)
    reasoning: str = ""
    clarification_questions: list[str] = Field(default_factory=list)
    warning_signs: list[str] = Field(default_factory=list)
    recommended_next_step: str = ""
    emergency: EmergencyGuidance | None = None
    discarded: int = 0
    # Only with status "failed", content-free: timeout · busy (Gemini overloaded) · invalid answer · error
    failure_reason: Literal["timeout", "busy", "invalid", "error"] | None = None


class DoctorAvailabilityOut(CamelModel):
    id: str
    full_name: str
    doctor_code: str | None = None
    next_slot: str | None = None
    free_slots: int = 0


class Slot(CamelModel):
    id: str
    starts_at: str
    ends_at: str


AppointmentStatus = Literal["requested", "confirmed", "rejected", "proposed", "cancelled"]


class Appointment(CamelModel):
    id: str
    patient_id: str
    doctor_id: str
    patient_name: str | None = None
    doctor_name: str | None = None
    specialty_id: str | None = None
    specialty_name: str | None = None
    starts_at: str
    ends_at: str
    status: AppointmentStatus
    proposed_starts_at: str | None = None
    proposed_ends_at: str | None = None
    patient_note: str | None = None
    doctor_note: str | None = None
    created_at: str
    updated_at: str


class AppointmentRequest(CamelModel):
    slot_id: str = Field(min_length=1, max_length=64)
    specialty_id: str | None = Field(default=None, max_length=40)
    note: str | None = Field(default=None, max_length=500)


class PatientAppointmentAction(CamelModel):
    action: Literal["accept_proposal", "decline_proposal", "cancel"]


class DoctorAppointmentAction(CamelModel):
    action: Literal["accept", "reject", "propose"]
    slot_id: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=300)


class AvailabilityCreate(CamelModel):
    """Publishes consecutive slots of `slot_minutes` between starts_at and ends_at (same day, max 12 h)."""
    starts_at: str = Field(max_length=40)
    ends_at: str = Field(max_length=40)
    slot_minutes: Literal[15, 20, 30, 45, 60] = 30
