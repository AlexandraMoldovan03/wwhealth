"""Care Journey: doctor agenda & schedule, consultation preparation / sheet, treatment plans, doses, record views, FHIR.
Mirror of frontend/types/careJourney.ts. A WWHealth prescription is NOT an official CNAS e-prescription."""
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.base import CamelModel
from app.schemas.doctor_access import DoctorScope
from app.schemas.document import MedicalDocument, PatientLabValue
from app.schemas.patient import Allergy, Diagnosis, Surgery, Treatment
from app.schemas.smart_care import Appointment, EmergencyGuidance

TIME_RE = r"^([01]\d|2[0-3]):[0-5]\d$"
DATE_RE = r"^\d{4}-\d{2}-\d{2}$"

# ─────────────────────────────────────────────────────────── schedule (doctor)


class WeeklyHours(CamelModel):
    weekday: int = Field(ge=1, le=7)  # ISO: 1 = Monday … 7 = Sunday
    kind: Literal["work", "break"] = "work"
    start: str = Field(pattern=TIME_RE)
    end: str = Field(pattern=TIME_RE)


class DoctorSchedule(CamelModel):
    timezone: str = Field(default="Europe/Bucharest", min_length=1, max_length=64)
    slot_minutes: Literal[15, 20, 30, 45, 60] = 30
    horizon_days: int = Field(default=30, ge=7, le=60)
    hours: list[WeeklyHours] = Field(default_factory=list, max_length=70)
    configured: bool = False


class ScheduleSaveResult(CamelModel):
    added: int
    removed: int
    schedule: DoctorSchedule


TimeOffKind = Literal["day_off", "vacation", "blocked"]


class TimeOffCreate(CamelModel):
    kind: TimeOffKind
    starts_at: str = Field(max_length=40)
    ends_at: str = Field(max_length=40)
    note: str | None = Field(default=None, max_length=120)


class TimeOff(CamelModel):
    id: str
    kind: TimeOffKind
    starts_at: str
    ends_at: str
    note: str | None = None


class TimeOffResult(CamelModel):
    time_off: TimeOff
    conflicts: int  # existing appointments in that interval (they are NOT cancelled automatically)


class AgendaSlot(CamelModel):
    id: str
    starts_at: str
    ends_at: str
    booked: bool = False
    blocked: bool = False


class AgendaAppointment(Appointment):
    prepared: bool = False


class DoctorAgenda(CamelModel):
    starts_at: str
    ends_at: str
    appointments: list[AgendaAppointment] = []
    slots: list[AgendaSlot] = []
    time_off: list[TimeOff] = []


# ─────────────────────────────────────────────────────────── consultation


class PreparationInput(CamelModel):
    """What the patient sends to the appointment's doctor (only this doctor reads it)."""
    reason: str | None = Field(default=None, max_length=500)
    symptoms: str | None = Field(default=None, max_length=2000)
    questions: list[str] = Field(default_factory=list, max_length=10)
    # Smart Care result the patient chose to attach (summary + suggested specialties), never generated here.
    care_summary: dict | None = None

    @field_validator("questions")
    @classmethod
    def _short(cls, v: list[str]) -> list[str]:
        return [q.strip()[:300] for q in v if q and q.strip()]

    @field_validator("care_summary")
    @classmethod
    def _small(cls, v: dict | None) -> dict | None:
        if v is not None and len(str(v)) > 15000:
            raise ValueError("care summary too large")
        return v


class Preparation(PreparationInput):
    updated_at: str | None = None


class GrantInfo(CamelModel):
    status: Literal["active", "expired", "revoked"]
    scopes: list[DoctorScope] = []
    expires_at: str | None = None


class ConsultationSheet(CamelModel):
    """Everything the appointment's doctor may see. Record sections are None when not shared (explicit grant)."""
    appointment: Appointment
    preparation: Preparation | None = None
    grant: GrantInfo | None = None
    allergies: list[Allergy] | None = None
    diagnoses: list[Diagnosis] | None = None
    surgeries: list[Surgery] | None = None
    declared_medication: list[Treatment] | None = None  # declared by the patient (not prescribed here)
    treatments: list["TreatmentPlan"] | None = None       # prescribed / instructed in WWHealth
    labs: list[PatientLabValue] | None = None
    documents: list[MedicalDocument] | None = None


# ─────────────────────────────────────────────────────────── treatment plans

PlanKind = Literal["prescription", "instructions"]
PlanStoredStatus = Literal["active", "discontinued", "cancelled"]
TreatmentStatus = Literal["UPCOMING", "ACTIVE", "COMPLETED", "DISCONTINUED", "CANCELLED"]
ScheduleType = Literal["fixed_times", "as_needed", "undocumented"]


class TreatmentInput(CamelModel):
    medication_name: str = Field(min_length=1, max_length=120)
    active_substance: str | None = Field(default=None, max_length=120)
    strength: str | None = Field(default=None, max_length=60)
    dosage_form: str | None = Field(default=None, max_length=60)
    dose_amount: float | None = Field(default=None, gt=0, lt=10_000_000)
    dose_unit: str | None = Field(default=None, max_length=30)
    route: str | None = Field(default=None, max_length=60)
    schedule_type: ScheduleType
    times_of_day: list[str] = Field(default_factory=list, max_length=12)
    frequency_text: str | None = Field(default=None, max_length=120)
    start_date: str = Field(pattern=DATE_RE)
    end_date: str | None = Field(default=None, pattern=DATE_RE)
    instructions: str | None = Field(default=None, max_length=1000)

    @field_validator("times_of_day")
    @classmethod
    def _times(cls, v: list[str]) -> list[str]:
        import re

        out = sorted({t.strip() for t in v})
        if any(not re.match(TIME_RE, t) for t in out):
            raise ValueError("times must be HH:MM")
        return out


class TreatmentCreate(TreatmentInput):
    patient_id: str = Field(min_length=1, max_length=64)
    kind: PlanKind
    appointment_id: str | None = Field(default=None, max_length=64)


class TreatmentUpdate(TreatmentInput):
    reason: str | None = Field(default=None, max_length=300)


class TreatmentEnd(CamelModel):
    status: Literal["discontinued", "cancelled"]
    reason: str | None = Field(default=None, max_length=300)


class TreatmentVersion(CamelModel):
    version: int
    medication_name: str
    active_substance: str | None = None
    strength: str | None = None
    dosage_form: str | None = None
    dose_amount: float | None = None
    dose_unit: str | None = None
    route: str | None = None
    schedule_type: ScheduleType
    times_of_day: list[str] = []
    frequency_text: str | None = None
    start_date: str
    end_date: str | None = None
    instructions: str | None = None
    status: PlanStoredStatus
    change_kind: Literal["created", "updated", "discontinued", "cancelled"]
    change_reason: str | None = None
    changed_by_name: str = ""
    changed_at: str


class TreatmentPlan(CamelModel):
    id: str
    patient_id: str
    prescriber_id: str | None = None
    prescriber_name: str = ""
    appointment_id: str | None = None
    kind: PlanKind
    stored_status: PlanStoredStatus
    status: TreatmentStatus  # computed for "today" in the patient's time zone
    issued_at: str
    current: TreatmentVersion
    history: list[TreatmentVersion] = []
    can_edit: bool = False  # caller is the prescriber, plan active (the server re-checks access anyway)


class DoseEvent(CamelModel):
    """One documented intake time (fixed_times only). status: what the PATIENT reported (not a clinical record)."""
    plan_id: str
    plan_version: int
    medication_name: str
    scheduled_for: str
    status: Literal["pending", "taken", "skipped"] = "pending"
    recorded_at: str | None = None


class DoseMark(CamelModel):
    plan_id: str = Field(min_length=1, max_length=64)
    scheduled_for: str = Field(max_length=40)
    status: Literal["taken", "skipped"]


class TreatmentOverview(CamelModel):
    timezone: str
    today: list[DoseEvent] = []
    next_dose: DoseEvent | None = None
    active: list[TreatmentPlan] = []
    upcoming: list[TreatmentPlan] = []
    finished: list[TreatmentPlan] = []  # completed / discontinued / cancelled (kept in the history)
    declared: list[Treatment] = []      # medication declared by the patient (not prescribed in WWHealth)
    is_demo: bool = False


class DoseSchedule(CamelModel):
    """Future documented intake times for local reminders (no medication names are needed for the notification)."""
    timezone: str
    doses: list[DoseEvent] = []
    plans_hash: str = ""  # changes when a prescription changes → old reminders are cancelled and rebuilt


# ─────────────────────────────────────────────────────────── intelligent record

RecordCategory = Literal["conditions", "procedures", "medication", "allergies", "labs", "investigations",
                         "consultations", "hospitalizations", "vaccinations", "family_history", "recommendations"]
Verification = Literal["patient_declared", "doctor_prescribed", "document", "patient_confirmed_lab", "ai_screening",
                       "booking"]


class RecordItem(CamelModel):
    id: str
    category: RecordCategory
    title: str
    detail: str = ""
    date: str | None = None
    source: str                       # e.g. "Medical profile", "Uploaded document", "Prescription (WWHealth)"
    author: str | None = None         # who documented it (patient / doctor name) when known
    document_type: str | None = None
    verification: Verification
    provenance: str                   # table / origin of the data, e.g. medical_profiles.conditions
    document_id: str | None = None    # link to the original document
    plan_id: str | None = None
    status: str | None = None
    pinned: bool = False              # allergies and active treatments are never hidden in "relevance"
    relevance_reason: str | None = None  # why it is near the top (rule-based, never a severity score)
    source_excerpt: str | None = None   # exact quote of the source document (Smart Import facts)
    source_page: int | None = None
    is_demo: bool = False


class RecordSection(CamelModel):
    category: RecordCategory
    items: list[RecordItem]


class OrganizedRecord(CamelModel):
    view: Literal["relevance", "chronological", "category"]
    items: list[RecordItem] = []         # relevance / chronological
    sections: list[RecordSection] = []   # category (empty categories omitted)
    context: str | None = None           # the consultation reason / specialty used for relevance
    insufficient: bool = False           # nothing in the record matches the consultation reason


# ─────────────────────────────────────────────────────────── AI care insights (Gemini, structured)


class InsightStatement(CamelModel):
    text: str
    source_ids: list[str] = []


class TimelineEvent(CamelModel):
    date: str
    title: str
    source_ids: list[str] = []


class TermExplanation(CamelModel):
    term: str
    explanation: str


class CareInsights(CamelModel):
    general_summary: InsightStatement | None = None
    patient_summary: InsightStatement | None = None
    clinical_summary: InsightStatement | None = None
    consultation_summary: InsightStatement | None = None
    timeline: list[TimelineEvent] = []
    categories: dict[str, list[str]] = {}   # category → source ids
    missing_information: list[str] = []
    contradictions: list[InsightStatement] = []
    terms: list[TermExplanation] = []
    sources: list[dict] = []
    insufficient_sources: bool = False
    emergency: EmergencyGuidance | None = None  # rule-based (never Gemini); Gemini is skipped for call_112
    status: Literal["ok", "emergency", "no_consent", "not_configured", "forbidden", "expired", "revoked", "none"] = "ok"
    discarded_statements: int = 0
    model: str = ""
    generated_at: str = ""


class InsightsRequest(CamelModel):
    language: Literal["ro", "en"] = "ro"
    reason: str | None = Field(default=None, max_length=500)  # consultation reason (optional)


ConsultationSheet.model_rebuild()
