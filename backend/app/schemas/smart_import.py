"""Smart Import (Universal document import → preview → confirmation) and Document Library schemas."""
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.base import CamelModel
from app.schemas.document import ISO_DATE, DocumentType, MedicalDocument

SourceFormat = Literal["pdf_text", "pdf_scanned", "image", "fhir_json", "fhir_ndjson", "csv"]
FactKind = Literal["diagnosis", "symptom", "medication", "allergy", "procedure", "investigation", "recommendation",
                   "follow_up", "vaccination", "reason"]
Certainty = Literal["confirmed", "suspected", "ruled_out", "history"]
# Medication found in a document is ALWAYS historical information (as documented then) — never "active today".
MedContext = Literal["at_discharge", "during_stay", "prior", "prescribed", "unknown"]
ImportStatus = Literal["preview", "confirmed", "rejected", "failed"]
ImportMethod = Literal["local", "gemini", "local_fallback"]


class SourceRef(CamelModel):
    page: int | None = Field(default=None, ge=1, le=500)
    excerpt: str | None = Field(default=None, max_length=300)
    verified: bool = False  # the excerpt was found in the document text (False → shown as "to verify")


class ExtractedItem(CamelModel):
    key: str = Field(min_length=8, max_length=80)        # stable fingerprint (idempotent save)
    kind: FactKind
    label: str = Field(min_length=1, max_length=200)
    detail: str | None = Field(default=None, max_length=400)
    status: str | None = Field(default=None, max_length=20)  # certainty (diagnosis) / context (medication)
    date: str | None = Field(default=None, pattern=ISO_DATE)
    value: dict = {}
    source: SourceRef = SourceRef()
    uncertain: bool = False
    include: bool = True                                  # the patient may leave an item out
    edited: bool = False


class ExtractedLab(CamelModel):
    key: str = Field(min_length=8, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=20)
    unit: str | None = Field(default=None, max_length=20)
    reference_range: str | None = Field(default=None, max_length=40)
    measured_at: str | None = Field(default=None, pattern=ISO_DATE)
    source: SourceRef = SourceRef()
    uncertain: bool = False
    include: bool = True
    edited: bool = False


class NerTerm(CamelModel):
    text: str
    kind: Literal["Disease", "Chemical"]
    start: int
    end: int
    page: int | None = None
    confidence: float | None = None
    context: str


class ImportExtraction(CamelModel):
    category: DocumentType = "other"
    specialty: str | None = None
    proposed_title: str = Field(default="", max_length=120)
    event_date: str | None = None
    document_date: str | None = None
    institution: str | None = Field(default=None, max_length=160)
    physician: str | None = Field(default=None, max_length=120)
    items: list[ExtractedItem] = []
    labs: list[ExtractedLab] = []
    to_verify: list[str] = []          # codes / short notes the patient should check (translated in the app)
    page_count: int = 1
    truncated: bool = False            # the text sent for analysis was cut at the configured limit
    text_found: bool = True
    ner_terms: list[NerTerm] = []
    ner_model_version: str | None = None


class IdentityCheck(CamelModel):
    status: Literal["match", "unverified", "mismatch", "insufficient", "demo"]
    reasons: list[str] = []            # codes: name_match, name_mismatch, dob_match, dob_mismatch, placeholder, ...
    document_name: str | None = None
    document_birth_date: str | None = None
    requires_confirmation: bool = True


class DuplicateHint(CamelModel):
    document_id: str
    title: str
    reason: Literal["same_file", "same_event"]
    date: str | None = None


class Contradiction(CamelModel):
    code: str                          # e.g. allergy_not_in_profile, medication_not_active, condition_status
    label: str
    existing: str | None = None
    incoming: str | None = None


class ImportPreview(CamelModel):
    id: str
    document_id: str | None = None
    status: ImportStatus
    source_format: SourceFormat
    method: ImportMethod
    model: str | None = None
    original_filename: str | None = None
    created_at: str
    extraction: ImportExtraction
    identity: IdentityCheck
    duplicates: list[DuplicateHint] = []
    contradictions: list[Contradiction] = []
    is_demo: bool = False
    cached: bool = False               # returned from the cache (same file + pipeline version) — no new analysis
    fallback_reason: str | None = None  # why AI was not used: no_consent / not_configured / budget / rate_limited / error
    history: list[dict] = []


class ImportConfirm(CamelModel):
    title: str = Field(min_length=1, max_length=120)
    category: DocumentType
    specialty: str | None = Field(default=None, max_length=40)
    event_date: str | None = Field(default=None, pattern=ISO_DATE)
    institution: str | None = Field(default=None, max_length=160)
    items: list[ExtractedItem] = Field(default=[], max_length=300)
    labs: list[ExtractedLab] = Field(default=[], max_length=200)
    identity_confirmed: bool = False   # required unless the identity check is a clear match


class DocumentFact(CamelModel):
    id: str
    document_id: str
    kind: FactKind
    label: str
    detail: str | None = None
    status: str | None = None
    event_date: str | None = None
    source_page: int | None = None
    source_excerpt: str | None = None
    value: dict = {}
    edited: bool = False
    document_title: str | None = None


class DocumentUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    category: DocumentType | None = None
    specialty: str | None = Field(default=None, max_length=40)
    event_date: str | None = Field(default=None, pattern=ISO_DATE)
    institution: str | None = Field(default=None, max_length=160)


class LibraryPage(CamelModel):
    documents: list[MedicalDocument]
    institutions: list[str] = []
    specialties: list[str] = []


class DocumentDetail(CamelModel):
    ner_terms: list[NerTerm] = []
    document: MedicalDocument
    facts: list[DocumentFact] = []
    import_id: str | None = None


class AiUsageRow(CamelModel):
    feature: str
    model: str
    prompt_tokens: int
    output_tokens: int
    est_cost_usd: float
    status: str
    created_at: str


class AiUsageSummary(CamelModel):
    today_calls: int
    today_tokens: int
    today_cost_usd: float
    month_calls: int
    month_tokens: int
    month_cost_usd: float
    daily_budget_usd: float
    model: str
    recent: list[AiUsageRow] = []


# ─────────────────────────────────────────────────────────── Gemini structured output (strict)

class _G(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GDiagnosis(_G):
    name: str = Field(max_length=200)
    certainty: Certainty
    page: int = Field(ge=1, le=500)
    excerpt: str = Field(max_length=300)


class GItem(_G):
    text: str = Field(max_length=300)
    date: str | None = None
    page: int = Field(ge=1, le=500)
    excerpt: str = Field(max_length=300)


class GLab(_G):
    name: str = Field(max_length=80)
    value: str = Field(max_length=20)
    unit: str | None = Field(default=None, max_length=20)
    reference_range: str | None = Field(default=None, max_length=40)
    date: str | None = None
    page: int = Field(ge=1, le=500)
    excerpt: str = Field(max_length=300)


class GMedication(_G):
    name: str = Field(max_length=120)
    strength: str | None = Field(default=None, max_length=120)
    dose: str | None = Field(default=None, max_length=120)
    duration: str | None = Field(default=None, max_length=120)
    frequency: str | None = Field(default=None, max_length=160)
    context: MedContext
    page: int = Field(ge=1, le=500)
    excerpt: str = Field(max_length=300)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        name = value.strip()
        if not name or re.search(r"\d+(?:[.,]\d+)?\s*(?:%|(?:mcg|μg|µg|mg|g|ml|iu)\b)", name, re.I):
            raise ValueError("Medication name must be separate from strength and dose")
        return name


class GAllergy(_G):
    substance: str = Field(max_length=120)
    reaction: str | None = Field(default=None, max_length=160)
    page: int = Field(ge=1, le=500)
    excerpt: str = Field(max_length=300)


class GeminiDocument(_G):
    category: DocumentType
    specialty: str | None = None
    title_ro: str = Field(max_length=120)
    event_date: str | None = None
    document_date: str | None = None
    institution: str | None = Field(default=None, max_length=160)
    physician: str | None = Field(default=None, max_length=120)
    patient_name: str | None = Field(default=None, max_length=120)
    patient_birth_date: str | None = None
    patient_sex: Literal["female", "male"] | None = None
    reason: GItem | None = None
    diagnoses: list[GDiagnosis] = Field(default=[], max_length=40)
    symptoms: list[GItem] = Field(default=[], max_length=40)
    labs: list[GLab] = Field(default=[], max_length=120)
    investigations: list[GItem] = Field(default=[], max_length=40)
    procedures: list[GItem] = Field(default=[], max_length=40)
    medications: list[GMedication] = Field(default=[], max_length=60)
    allergies: list[GAllergy] = Field(default=[], max_length=30)
    recommendations: list[GItem] = Field(default=[], max_length=40)
    follow_ups: list[GItem] = Field(default=[], max_length=20)
    vaccinations: list[GItem] = Field(default=[], max_length=30)
    to_verify: list[str] = Field(default=[], max_length=20)
