"""
Intelligent Medical Record — the same authorised data in three views: relevance (for a consultation), chronological,
by category. Pure rules, no AI, nothing invented:
  • every item keeps its source, date, author (when known), document type, verification status and provenance;
  • patient-declared data (medical profile) is never labelled as doctor-validated; WWHealth prescriptions are
    `doctor_prescribed`; confirmed lab values are `patient_confirmed_lab`; LungVision is `ai_screening`;
  • relevance = documented words of the consultation reason / specialty, never a severity score. Allergies and active
    treatments are always pinned on top; nothing is hidden; if nothing matches, `insufficient` is set;
  • empty categories are omitted (vaccinations / family history appear only if such data exists).
"""
import re
import unicodedata

from app.schemas.care import OrganizedRecord, RecordCategory, RecordItem, RecordSection, TreatmentPlan
from app.schemas.document import MedicalDocument
from app.schemas.patient import PatientRecord
from app.schemas.smart_care import Appointment
from app.services.medical_summary import latest_labs

CATEGORY_ORDER: tuple[RecordCategory, ...] = (
    "allergies", "medication", "conditions", "procedures", "labs", "investigations", "consultations",
    "hospitalizations", "recommendations", "vaccinations", "family_history")

DOC_CATEGORY: dict[str, RecordCategory] = {
    "lab_result": "labs", "imaging_report": "investigations", "discharge_summary": "hospitalizations",
    "prescription": "medication", "other": "investigations", "consultation": "consultations",
    "trauma": "hospitalizations", "surgery": "procedures", "vaccination": "vaccinations",
}
# Smart Import facts (confirmed by the patient from a document) → record category. Symptoms / reasons stay in the
# document (they are context, not record entries).
FACT_CATEGORY: dict[str, RecordCategory] = {
    "diagnosis": "conditions", "allergy": "allergies", "medication": "medication", "procedure": "procedures",
    "investigation": "investigations", "vaccination": "vaccinations", "recommendation": "recommendations",
    "follow_up": "recommendations",
}

# Words that tie a specialty to documented terms (matching only; never used to rank severity).
SPECIALTY_TERMS: dict[str, tuple[str, ...]] = {
    "cardiology": ("cardi", "inim", "heart", "tensiun", "hipertens", "blood pressure", "ekg", "ecg", "puls"),
    "pulmonology": ("pulmo", "plaman", "lung", "astm", "asthma", "tuse", "cough", "respir", "bronh"),
    "endocrinology": ("diabet", "glicem", "glucose", "tiroid", "thyro", "tsh", "hba1c", "insulin"),
    "gastroenterology": ("gastr", "stomac", "ficat", "liver", "intestin", "colon", "reflux"),
    "neurology": ("neuro", "migren", "migrain", "cefale", "headache", "epilep", "ameteal", "dizz"),
    "dermatology": ("derm", "piele", "skin", "eczem", "eruptie", "rash", "acnee"),
    "allergology": ("alerg", "allerg", "urticar", "astm", "asthma"),
    "nephrology": ("renal", "rinichi", "kidney", "creatinin", "uree"),
    "rheumatology": ("reumat", "artrit", "arthrit", "articul", "joint", "lupus"),
    "hematology": ("hemat", "anemi", "feritin", "ferritin", "hemoglobin", "trombocit", "platelet"),
    "orthopedics": ("ortop", "fractur", "os ", "bone", "genunchi", "knee", "coloan", "spine"),
    "ent": ("orl", "ureche", "ear", "gat", "throat", "nas", "sinus", "amigdal"),
    "ophthalmology": ("ochi", "eye", "vedere", "vision", "oftalm"),
    "urology": ("urolog", "prostat", "vezic", "bladder", "urinar"),
    "gynecology": ("ginec", "gynec", "sarcin", "pregnan", "ovar", "uter"),
}
STOPWORDS = {"pentru", "despre", "dupa", "inainte", "control", "consult", "consultatie", "doresc", "vreau", "have",
             "with", "this", "that", "from", "about", "check", "since", "zile", "days", "weeks", "saptamani"}


def fold(text: str | None) -> str:
    stripped = "".join(c for c in unicodedata.normalize("NFD", text or "") if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9%., ]", " ", stripped.lower()).split())


def _terms(reason: str | None, specialty_id: str | None) -> tuple[list[str], list[str]]:
    words = [w for w in fold(reason).split() if len(w) >= 4 and w not in STOPWORDS]
    stems = sorted({w[:6] for w in words})
    return stems, list(SPECIALTY_TERMS.get(specialty_id or "", ()))


def build_items(record: PatientRecord | None, documents: list[MedicalDocument] | None, labs: list[dict] | None,
                plans: list[TreatmentPlan] | None, appointments: list[Appointment] | None,
                patient_name: str = "", facts: list[dict] | None = None) -> list[RecordItem]:
    """All authorised items. None = section not shared / not available."""
    items: list[RecordItem] = []
    author = patient_name or None
    if record is not None:
        for a in record.allergies:
            items.append(RecordItem(
                id=f"allergy:{a.id}", category="allergies", title=a.substance,
                detail=", ".join(x for x in (a.reaction, a.severity) if x), source="medical_profile",
                author=author, verification="patient_declared", provenance="medical_profiles.allergies",
                pinned=True, relevance_reason="allergy_always"))
        for d in record.diagnoses:
            items.append(RecordItem(
                id=f"condition:{d.id}", category="conditions", title=d.name,
                detail=" · ".join(x for x in (d.icd10, d.status) if x), date=d.diagnosed_at, source="medical_profile",
                author=author, verification="patient_declared", provenance="medical_profiles.conditions",
                status=d.status))
        for s in record.surgeries:
            items.append(RecordItem(
                id=f"surgery:{s.id}", category="procedures", title=s.name, detail=s.notes, date=s.date,
                source="medical_profile", author=author, verification="patient_declared",
                provenance="medical_profiles.surgeries"))
        for t in record.treatments:
            items.append(RecordItem(
                id=f"declared_med:{t.id}", category="medication", title=t.name,
                detail=" · ".join(x for x in (t.dosage, t.frequency) if x), date=t.start_date,
                source="medical_profile", author=author, verification="patient_declared",
                provenance="medical_profiles.medications", status="active" if t.active else "stopped",
                pinned=t.active, relevance_reason="active_treatment_always" if t.active else None))
        for x in record.xrays:
            items.append(RecordItem(
                id=f"xray:{x.id}", category="investigations", title="LungVision", detail="",
                date=getattr(x, "created_at", None), source="lungvision", verification="ai_screening",
                provenance="lungvision_analyses"))
    for p in plans or []:
        v = p.current
        dose = " ".join(str(x) for x in (_amount(v.dose_amount), v.dose_unit) if x)
        items.append(RecordItem(
            id=f"plan:{p.id}", category="medication", title=v.medication_name,
            detail=" · ".join(x for x in (v.strength, v.dosage_form, dose, v.route, v.frequency_text) if x),
            date=v.start_date, source=p.kind, author=p.prescriber_name or None, verification="doctor_prescribed",
            provenance="treatment_plans", plan_id=p.id, status=p.status,
            pinned=p.status == "ACTIVE", relevance_reason="active_treatment_always" if p.status == "ACTIVE" else None))
    for doc in documents or []:
        items.append(RecordItem(
            id=f"document:{doc.id}", category=DOC_CATEGORY.get(doc.type, "investigations"), title=doc.title,
            date=(doc.event_date or doc.uploaded_at)[:10], source="uploaded_document", author=author, document_type=doc.type,
            verification="document", provenance="medical_documents", document_id=doc.id, is_demo=doc.is_demo,
            detail=" · ".join(x for x in (doc.institution or "",) if x)))
    for f in facts or []:
        category = FACT_CATEGORY.get(f.get("kind", ""))
        if category is None:
            continue
        status = f.get("status")
        # Imported medication is historical by definition: never pinned, never "active".
        medication = f["kind"] == "medication"
        items.append(RecordItem(
            id=f"fact:{f['id']}", category=category, title=f["label"], detail=f.get("detail") or "",
            date=str(f["event_date"])[:10] if f.get("event_date") else None, source="document_fact",
            author=None, document_type=None, verification="document", provenance="document_facts",
            document_id=str(f["document_id"]), status=("historical" if medication else status),
            pinned=f["kind"] == "allergy", relevance_reason="allergy_always" if f["kind"] == "allergy" else None,
            source_excerpt=f.get("source_excerpt"), source_page=f.get("source_page"), is_demo=bool(f.get("is_demo"))))
    if labs is not None:
        by_doc = {}
        for v in labs:
            by_doc[(fold(v.get("name")), fold(v.get("unit")))] = v.get("document_id")
        for lab in latest_labs(labs):
            items.append(RecordItem(
                id=f"lab:{fold(lab.name)}|{fold(lab.unit)}", category="labs", title=lab.name,
                detail=" ".join(x for x in (lab.value, lab.unit or "", f"({lab.reference_range})" if lab.reference_range else "") if x),
                date=lab.date, source="confirmed_lab_value", document_type="lab_result",
                verification="patient_confirmed_lab", provenance="document_lab_values",
                document_id=by_doc.get((fold(lab.name), fold(lab.unit)))))
    for a in appointments or []:
        if a.status != "confirmed":
            continue
        items.append(RecordItem(
            id=f"appointment:{a.id}", category="consultations", title=a.specialty_name or a.doctor_name or "",
            detail=a.doctor_name or "", date=a.starts_at, source="appointment", author=a.doctor_name,
            verification="booking", provenance="appointments", status=a.status))
    return items


def _amount(value: float | None) -> str | None:
    if value is None:
        return None
    return str(int(value)) if float(value).is_integer() else f"{value:g}"


def _date_key(item: RecordItem) -> str:
    return item.date or ""


def organize(items: list[RecordItem], view: str, reason: str | None = None, specialty_id: str | None = None,
             specialty_name: str | None = None) -> OrganizedRecord:
    if view == "chronological":
        dated = sorted((i for i in items if i.date), key=_date_key, reverse=True)
        return OrganizedRecord(view="chronological", items=dated + [i for i in items if not i.date])
    if view == "category":
        sections = []
        for c in CATEGORY_ORDER:
            group = sorted((i for i in items if i.category == c), key=_date_key, reverse=True)
            if group:
                sections.append(RecordSection(category=c, items=group))
        return OrganizedRecord(view="category", sections=sections)

    stems, spec_terms = _terms(reason, specialty_id)
    pinned, matched, rest = [], [], []
    for item in items:
        text = fold(f"{item.title} {item.detail}")
        if item.pinned:
            pinned.append(item)
        elif stems and any(s in text for s in stems):
            matched.append(item.model_copy(update={"relevance_reason": "matches_reason"}))
        elif spec_terms and any(t in text for t in spec_terms):
            matched.append(item.model_copy(update={"relevance_reason": "matches_specialty"}))
        else:
            rest.append(item)
    order = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    pinned.sort(key=lambda i: (order[i.category], _date_key(i)))
    matched.sort(key=_date_key, reverse=True)
    rest.sort(key=_date_key, reverse=True)
    context = " · ".join(x for x in (specialty_name, (reason or "").strip()) if x) or None
    return OrganizedRecord(view="relevance", items=pinned + matched + rest, context=context,
                           insufficient=bool(context) and not matched)
