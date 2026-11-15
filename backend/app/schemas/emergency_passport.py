"""Prioritised Emergency Passport + structured document summary (validated JSON, no free text from AI).

Mirror of frontend/types/emergencyPassport.ts.
"""
from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel

ItemKind = Literal["allergy", "condition", "medication", "lab", "blood_type", "history", "procedure", "finding",
                   "recommendation"]
LabStatus = Literal["low", "high", "normal", "unknown"]
# Why an item was prioritised (rule codes, translated in the app).
Flag = Literal[
    "severe_allergy", "anaphylaxis", "drug_allergy",
    "anticoagulant", "antiplatelet", "insulin", "hypoglycemic", "opioid", "antiepileptic", "corticosteroid",
    "immunosuppressant", "cardiac_drug", "lithium",
    "emergency_condition", "critical_lab", "abnormal_lab", "suspected", "historical_medication",
]


class PassportSource(CamelModel):
    kind: Literal["profile", "document", "lab"]
    document_id: str | None = None
    document_title: str | None = None
    date: str | None = None
    page: int | None = None
    excerpt: str | None = Field(default=None, max_length=300)


class LabPoint(CamelModel):
    value: str
    date: str | None = None


class LabReading(CamelModel):
    value: str
    unit: str | None = None
    reference_range: str | None = None
    status: LabStatus = "unknown"
    critical: bool = False
    date: str | None = None
    previous: list[LabPoint] = []   # older measurements, newest first (trend)


class PassportItem(CamelModel):
    key: str
    kind: ItemKind
    label: str = Field(max_length=200)
    detail: str | None = Field(default=None, max_length=300)
    severity: Literal["mild", "moderate", "severe"] | None = None
    status: str | None = None       # documented certainty / context (confirmed, suspected, history, at_discharge, ...)
    flags: list[Flag] = []
    confirmed: bool = True          # False → shown as "Necesită confirmare"
    conflict: bool = False          # sources disagree → all values kept, none chosen
    conflict_values: list[str] = []
    lab: LabReading | None = None
    sources: list[PassportSource] = []


class PrioritizedPassport(CamelModel):
    """critical (P1) → essential (P2) → investigations (P3); normal labs kept apart, off the emergency screen."""
    allergies_status: Literal["known", "unknown"]
    critical: list[PassportItem] = []
    essential: list[PassportItem] = []
    investigations: list[PassportItem] = []
    normal_labs: list[PassportItem] = []
    conflicts: int = 0
    unconfirmed: int = 0


class DocumentSummary(CamelModel):
    """Per-document structured summary. Empty sections stay empty (never padded)."""
    document_id: str
    document_type: str
    date: str | None = None
    # The short conclusion is composed in the app from these structured fields (no AI prose).
    findings: list[PassportItem] = []
    abnormal_labs: list[PassportItem] = []
    normal_labs_count: int = 0
    diagnoses: list[PassportItem] = []     # confirmed / suspected / history, kept distinct via flags + detail
    treatment: list[PassportItem] = []     # medication + recommendations as documented
    emergency_relevant: list[PassportItem] = []
    needs_confirmation: int = 0
