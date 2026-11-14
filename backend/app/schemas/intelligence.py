"""AI Medical Intelligence — Gemini draft (structured output) and the validated view returned to the app."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.base import CamelModel
from app.schemas.doctor_access import DoctorScope

# ─────────────────────────────────────────────────────────── what Gemini must return (validated strictly)

MAX_TEXT = 400
MAX_ITEMS = 20


class DraftStatement(BaseModel):
    """One claim + the ids of the facts it is based on (ids come from the fact sheet we send)."""
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=MAX_TEXT)
    source_ids: list[str] = Field(default_factory=list, max_length=10)


class GeminiDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    overview: DraftStatement
    critical_information: list[DraftStatement] = Field(default_factory=list, max_length=MAX_ITEMS)
    active_conditions: list[DraftStatement] = Field(default_factory=list, max_length=MAX_ITEMS)
    surgical_history: list[DraftStatement] = Field(default_factory=list, max_length=MAX_ITEMS)
    medications: list[DraftStatement] = Field(default_factory=list, max_length=MAX_ITEMS)
    lab_findings: list[DraftStatement] = Field(default_factory=list, max_length=MAX_ITEMS)
    missing_information: list[str] = Field(default_factory=list, max_length=15)
    source_references: list[str] = Field(default_factory=list, max_length=200)


# ─────────────────────────────────────────────────────────── validated view

SourceKind = Literal["profile", "allergy", "condition", "medication", "surgery", "lab", "document"]
Category = Literal["priority", "active", "history", "verify"]
# Explicit, documented rules (never an LLM score): anaphylaxis / severe allergy / lab outside its printed range.
Flag = Literal["anaphylaxis", "severe_allergy", "abnormal_lab"]


class SourceRef(CamelModel):
    id: str
    kind: SourceKind
    label: str
    date: str | None = None
    document_id: str | None = None  # opens the original document (patient or doctor route)
    flag: Flag | None = None


class IntelligenceItem(CamelModel):
    """origin 'record' = built by rules from the stored data · 'ai' = Gemini text that passed grounding checks."""
    text: str = ""
    code: str | None = None  # 'record' verification items: translated in the app (e.g. missing_blood_type)
    source_ids: list[str] = []
    origin: Literal["record", "ai"]
    flag: Flag | None = None


class IntelligenceSection(CamelModel):
    category: Category
    items: list[IntelligenceItem] = []


class MedicalIntelligence(CamelModel):
    overview: str = ""
    overview_source_ids: list[str] = []
    sections: list[IntelligenceSection] = []
    sources: list[SourceRef] = []
    source_scopes: list[DoctorScope] = []
    language: Literal["ro", "en"] = "ro"
    model: str = ""
    generated_at: str = ""
    discarded_statements: int = 0  # AI statements dropped because no real source supported them


ViewStatus = Literal[
    "ok",             # summary present
    "none",           # nothing generated yet (or none visible for this doctor's access)
    "no_consent",     # the patient has not consented to Gemini processing
    "not_configured", # GEMINI_API_KEY missing on the server
    "forbidden", "expired", "revoked",  # doctor: not a doctor / consent ended
]


class IntelligenceView(CamelModel):
    status: ViewStatus
    ai_configured: bool
    consent: bool
    summary: MedicalIntelligence | None = None
    patient_name: str | None = None  # doctor view only
    scopes: list[DoctorScope] = []   # doctor view: sections of the active grant


class AiConsent(CamelModel):
    granted: bool
    granted_at: str | None = None


class AiConsentUpdate(CamelModel):
    granted: bool


class GenerateRequest(CamelModel):
    language: Literal["ro", "en"] = "ro"
