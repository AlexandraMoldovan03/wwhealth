"""
Structured medical summary — pure function over data the caller is already allowed to read.

No AI, no external service, no interpretation: values are copied as stored, the "latest" lab value is the
most recent confirmed one per analysis + unit (units are never converted or mixed). Sections the patient
did not share stay None.
"""
import unicodedata

from app.schemas.doctor_access import LatestLab, MedicalSummary, SummaryBasics
from app.schemas.document import MedicalDocument
from app.schemas.patient import PatientRecord

RECENT_DOCUMENTS = 5


def _key(text: str | None) -> str:
    stripped = "".join(c for c in unicodedata.normalize("NFD", text or "") if unicodedata.category(c) != "Mn")
    return " ".join("".join(c if c.isalnum() or c == "%" else " " for c in stripped.lower()).split())


def latest_labs(labs: list[dict]) -> list[LatestLab]:
    """labs: rows with name, value, unit, reference_range, measured_at, document_date, document_title."""
    groups: dict[tuple[str, str], list[dict]] = {}
    for v in labs:
        groups.setdefault((_key(v.get("name")), _key(v.get("unit"))), []).append(v)
    out = []
    for rows in groups.values():
        rows.sort(key=lambda r: r.get("measured_at") or r.get("document_date") or "")
        last = rows[-1]
        out.append(LatestLab(
            name=last["name"], value=last["value"], unit=last.get("unit"), reference_range=last.get("reference_range"),
            date=last.get("measured_at") or last.get("document_date"), document_title=last.get("document_title"),
            measurements=len(rows),
        ))
    return sorted(out, key=lambda lab: lab.name.lower())


def build_summary(
    record: PatientRecord | None,
    documents: list[MedicalDocument] | None,
    labs: list[dict] | None,
    facts: list[dict] | None = None,
) -> MedicalSummary:
    """record → profile sections (None if not shared); documents / labs None if not shared."""
    summary = MedicalSummary()
    if record is not None:
        summary.basics = SummaryBasics(
            date_of_birth=record.date_of_birth, sex=record.sex, blood_type=record.blood_type,
            height_cm=record.height_cm, weight_kg=record.weight_kg,
        )
        summary.allergies = list(record.allergies)
        summary.conditions = [d for d in record.diagnoses if d.status == "active"]
        summary.medications = [t for t in record.treatments if t.active]
    if documents is not None:
        summary.documents = sorted(documents, key=lambda d: d.uploaded_at, reverse=True)[:RECENT_DOCUMENTS]
    if labs is not None:
        summary.latest_labs = latest_labs(labs)
    if facts is not None:
        from app.schemas.doctor_access import DocumentFinding
        from app.core.config import settings
        keep = [f for f in facts if f.get("kind") in ("diagnosis", "allergy", "procedure") and f.get("status") != "ruled_out"
                and (not f.get("is_demo") or not settings.supabase_enabled)]
        keep.sort(key=lambda f: str(f.get("event_date") or ""), reverse=True)
        summary.documented_findings = [DocumentFinding(
            kind=f["kind"], label=f["label"], status=f.get("status"), date=str(f["event_date"])[:10] if f.get("event_date") else None,
            document_id=str(f["document_id"]), document_title=f.get("document_title")) for f in keep[:30]]
    return summary
