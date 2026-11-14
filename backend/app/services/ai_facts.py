"""
Fact sheet + rules for AI Medical Intelligence. Pure functions, no network.

1. `build_facts` turns ONLY the data the caller may read into minimal, id-tagged facts (no name, email, date of
   birth, file contents or raw OCR lines) — this is all Gemini ever receives.
2. `assemble` validates Gemini's draft against those facts: every statement must cite existing facts of the
   right kind and mention what it cites; recommendations / risk / prognosis language and unknown ICD-10 codes
   are rejected. Safety-relevant items are prioritised by explicit rules, never by an LLM score, and every
   active condition, medication and surgery is listed even if Gemini omitted it.
"""
import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date

from app.schemas.document import MedicalDocument
from app.schemas.intelligence import (
    Category,
    DraftStatement,
    Flag,
    GeminiDraft,
    IntelligenceItem,
    IntelligenceSection,
    MedicalIntelligence,
    SourceRef,
)
from app.schemas.patient import PatientRecord
from app.services.medical_summary import latest_labs

MAX_PER_KIND = 50
MAX_FIELD = 200
MAX_PROMPT_CHARS = 30_000
CATEGORY_ORDER: tuple[Category, ...] = ("priority", "active", "history", "verify")

ANAPHYLAXIS_RE = re.compile(r"anafila|anaphyla|soc anafilactic|anaphylactic shock")
# Advice, risk scoring, prognosis, contagiousness → not allowed in any statement.
FORBIDDEN_RE = re.compile(
    r"\b(recomand\w*|recommend\w*|should (take|start|stop|avoid)|trebuie sa (ia|inceap|opreasc|evit)\w*|"
    r"sfatu\w*|advise\w*|risc\w* (crescut|mare|ridicat|scazut)|(high|low|elevated) risk|risk score|scor\w* de risc|"
    r"prognos\w*|contagi\w*|life expectancy|speranta de viata|sever\w* (boala|afectiun)\w*)\b"
)
ICD_RE = re.compile(r"\b[A-TV-Z]\d{2}(?:\.\d{1,2})?\b")


def norm(text: str | None) -> str:
    stripped = "".join(c for c in unicodedata.normalize("NFD", text or "") if unicodedata.category(c) != "Mn")
    return " ".join("".join(c if c.isalnum() or c in "%.," else " " for c in stripped.lower()).split())


def _clip(value: object) -> object:
    return value[:MAX_FIELD] if isinstance(value, str) else value


def _num(raw: str | None) -> float | None:
    m = re.search(r"-?\d+(?:[.,]\d+)?", raw or "")
    return float(m.group(0).replace(",", ".")) if m else None


def lab_outside_range(value: str, reference_range: str | None) -> bool:
    """Explicit rule: numeric value outside a printed 'low - high', '< high' or '> low' range."""
    v = _num(value)
    rng = (reference_range or "").replace(",", ".")
    if v is None or not rng:
        return False
    if m := re.search(r"(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)", rng):
        return v < float(m.group(1)) or v > float(m.group(2))
    if m := re.search(r"[<≤]\s*=?\s*(-?\d+(?:\.\d+)?)", rng):
        return v > float(m.group(1))
    if m := re.search(r"[>≥]\s*=?\s*(-?\d+(?:\.\d+)?)", rng):
        return v < float(m.group(1))
    return False


def _age(dob: str | None) -> int | None:
    try:
        born = date.fromisoformat((dob or "")[:10])
    except ValueError:
        return None
    today = date.today()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def lab_fact_id(name: str | None, unit: str | None) -> str:
    """Stable id per analysis + unit (same id across regenerations → saved summaries stay verifiable)."""
    return "lab:" + hashlib.sha1(f"{norm(name)}|{norm(unit)}".encode()).hexdigest()[:10]


@dataclass
class Fact:
    id: str
    kind: str
    label: str
    data: dict
    date: str | None = None
    document_id: str | None = None
    flag: Flag | None = None
    names: list[str] = field(default_factory=list)  # what a statement citing this fact must mention
    active: bool = False


@dataclass
class FactSheet:
    facts: dict[str, Fact]
    scopes: list[str]
    missing: list[tuple[str, dict]]  # (code, params) — rule-based "needs verification"

    def by_kind(self, *kinds: str) -> list[Fact]:
        return [f for f in self.facts.values() if f.kind in kinds]

    def prompt_payload(self) -> str:
        """Minimal JSON for Gemini. Oldest documents / labs are dropped first if over MAX_PROMPT_CHARS."""
        items = [{"id": f.id, "kind": f.kind, **f.data} for f in self.facts.values()]
        text = json.dumps(items, ensure_ascii=False)
        while len(text) > MAX_PROMPT_CHARS and items:
            victim = next((i for i in reversed(items) if i["kind"] in ("document", "lab")), items[-1])
            items.remove(victim)
            text = json.dumps(items, ensure_ascii=False)
        return text


def build_facts(record: PatientRecord | None, documents: list[MedicalDocument] | None,
                labs: list[dict] | None) -> FactSheet:
    """record → section 'profile', documents → 'documents', labs → 'labs'. None = not shared / not available."""
    facts: dict[str, Fact] = {}
    missing: list[tuple[str, dict]] = []
    scopes: list[str] = []

    def add(f: Fact) -> None:
        f.data = {k: _clip(v) for k, v in f.data.items() if v not in (None, "", [])}
        facts[f.id] = f

    if record is not None:
        scopes.append("profile")
        add(Fact("profile:basics", "profile", "Basic data", {
            "age_years": _age(record.date_of_birth), "sex": record.sex, "blood_type": record.blood_type,
            "height_cm": record.height_cm, "weight_kg": record.weight_kg,
        }))
        if not record.blood_type:
            missing.append(("missing_blood_type", {}))
        if not record.date_of_birth:
            missing.append(("missing_date_of_birth", {}))
        if not record.allergies:
            missing.append(("no_allergies_recorded", {}))
        for a in record.allergies[:MAX_PER_KIND]:
            text = norm(f"{a.substance} {a.reaction}")
            flag: Flag | None = "anaphylaxis" if ANAPHYLAXIS_RE.search(text) else "severe_allergy" if a.severity == "severe" else None
            add(Fact(f"allergy:{a.id}", "allergy", f"{a.substance}" + (f" — {a.reaction}" if a.reaction else ""),
                     {"substance": a.substance, "reaction": a.reaction, "severity": a.severity},
                     flag=flag, names=[a.substance]))
        for d in record.diagnoses[:MAX_PER_KIND]:
            add(Fact(f"condition:{d.id}", "condition", d.name,
                     {"name": d.name, "icd10": d.icd10, "status": d.status, "since": d.diagnosed_at},
                     date=d.diagnosed_at, names=[d.name, d.icd10 or ""], active=d.status == "active"))
        for t in record.treatments[:MAX_PER_KIND]:
            add(Fact(f"medication:{t.id}", "medication", " ".join(x for x in (t.name, t.dosage) if x),
                     {"name": t.name, "dosage": t.dosage, "frequency": t.frequency, "active": t.active,
                      "start": t.start_date, "end": t.end_date},
                     date=t.start_date, names=[t.name], active=t.active))
            if t.active and not t.dosage:
                missing.append(("medication_without_dosage", {"name": t.name}))
        for s in record.surgeries[:MAX_PER_KIND]:
            add(Fact(f"surgery:{s.id}", "surgery", s.name, {"name": s.name, "date": s.date, "notes": s.notes},
                     date=s.date, names=[s.name]))
    else:
        missing.append(("profile_not_shared", {}))

    if documents is not None:
        scopes.append("documents")
        for doc in sorted(documents, key=lambda d: d.uploaded_at, reverse=True)[:MAX_PER_KIND]:
            add(Fact(f"document:{doc.id}", "document", doc.title,
                     {"title": doc.title, "type": doc.type, "date": doc.uploaded_at[:10]},
                     date=doc.uploaded_at[:10], document_id=doc.id, names=[doc.title]))
    else:
        missing.append(("documents_not_shared", {}))

    if labs is not None:
        scopes.append("labs")
        history: dict[str, list[dict]] = {}
        for v in labs:
            history.setdefault(f"{norm(v.get('name'))}|{norm(v.get('unit'))}", []).append(v)
        latest = sorted(latest_labs(labs), key=lambda lab: lab.date or "", reverse=True)[:MAX_PER_KIND]
        for lab in latest:
            key = f"{norm(lab.name)}|{norm(lab.unit)}"
            rows = sorted(history.get(key, []), key=lambda r: r.get("measured_at") or r.get("document_date") or "")
            doc_id = rows[-1].get("document_id") if rows else None
            abnormal = lab_outside_range(lab.value, lab.reference_range)
            add(Fact(lab_fact_id(lab.name, lab.unit), "lab",
                     f"{lab.name}: {lab.value}{' ' + lab.unit if lab.unit else ''}",
                     {"name": lab.name, "value": lab.value, "unit": lab.unit, "reference_range": lab.reference_range,
                      "date": lab.date, "outside_reference_range": abnormal or None,
                      "previous_values": [f"{r['value']} ({(r.get('measured_at') or r.get('document_date') or '?')[:10]})"
                                          for r in rows[-6:-1]]},
                     date=lab.date, document_id=doc_id, flag="abnormal_lab" if abnormal else None,
                     names=[lab.name]))
            if not lab.reference_range:
                missing.append(("lab_without_range", {"name": lab.name}))
            if not lab.date:
                missing.append(("lab_without_date", {"name": lab.name}))
    else:
        missing.append(("labs_not_shared", {}))
    return FactSheet(facts=facts, scopes=scopes, missing=missing)


# ─────────────────────────────────────────────────────────── grounding

# Kinds a statement in each Gemini field must cite (at least one).
REQUIRED_KINDS = {
    "critical_information": {"allergy", "condition", "medication", "lab"},
    "active_conditions": {"condition"},
    "surgical_history": {"surgery"},
    "medications": {"medication"},
    "lab_findings": {"lab"},
    "overview": {"profile", "allergy", "condition", "medication", "surgery", "lab", "document"},
}


def _mentions(text: str, fact: Fact) -> bool:
    t = norm(text)
    for name in fact.names:
        n = norm(name)
        if n and n in t:
            return True
        if any(tok in t for tok in n.split() if len(tok) >= 4):
            return True
    return False


def _grounded(field_name: str, stmt: DraftStatement, sheet: FactSheet) -> list[Fact] | None:
    """Cited facts if the statement is supported, else None (it is dropped)."""
    cited = [sheet.facts[i] for i in dict.fromkeys(stmt.source_ids) if i in sheet.facts]
    if not cited or not any(f.kind in REQUIRED_KINDS[field_name] for f in cited):
        return None
    t = norm(stmt.text)
    if FORBIDDEN_RE.search(t):
        return None
    known_codes = {norm(f.data.get("icd10")) for f in sheet.by_kind("condition") if f.data.get("icd10")}
    if any(norm(code) not in known_codes for code in ICD_RE.findall(stmt.text)):
        return None
    if field_name in ("active_conditions", "surgical_history", "medications"):
        if not any(_mentions(stmt.text, f) for f in cited if f.kind in REQUIRED_KINDS[field_name]):
            return None
    if field_name == "lab_findings":
        labs = [f for f in cited if f.kind == "lab"]
        if not any(norm(str(f.data.get("value"))) in t and _mentions(stmt.text, f) for f in labs):
            return None
    if field_name == "active_conditions" and not any(f.active for f in cited if f.kind == "condition"):
        return None
    return cited


def assemble(draft: GeminiDraft, sheet: FactSheet, *, language: str, model: str, generated_at: str) -> MedicalIntelligence:
    sections: dict[Category, list[IntelligenceItem]] = {c: [] for c in CATEGORY_ORDER}
    discarded = 0
    cited_in: dict[Category, set[str]] = {c: set() for c in CATEGORY_ORDER}

    def ai_item(category: Category, stmt: DraftStatement, cited: list[Fact]) -> None:
        flag = next((f.flag for f in cited if f.flag), None)
        sections[category].append(IntelligenceItem(text=stmt.text.strip(), source_ids=[f.id for f in cited],
                                                   origin="ai", flag=flag))
        cited_in[category].update(f.id for f in cited)

    # 1. Gemini statements that pass grounding, placed by the kind / flag of what they cite.
    for field_name in ("critical_information", "active_conditions", "medications", "surgical_history", "lab_findings"):
        for stmt in getattr(draft, field_name):
            cited = _grounded(field_name, stmt, sheet)
            if cited is None:
                discarded += 1
                continue
            kinds = {f.kind for f in cited}
            if field_name == "critical_information" and any(f.flag for f in cited):
                category: Category = "priority"
            elif field_name == "surgical_history" or kinds <= {"surgery", "document"}:
                category = "history"  # an old operation is history, never an emergency by itself
            elif field_name == "lab_findings":
                category = "priority" if any(f.flag for f in cited) else "history"
            elif kinds & {"condition", "medication"}:
                category = "active"
            else:
                category = "verify"
            ai_item(category, stmt, cited)

    # 2. Rule-based priority: anaphylaxis, severe allergies, labs outside their printed range — always present,
    #    as a record item when no verified AI statement already cites them. Ordered by rule, not by the LLM.
    for f in sheet.facts.values():
        if f.flag and f.id not in cited_in["priority"]:
            sections["priority"].append(IntelligenceItem(text=f.label, source_ids=[f.id], origin="record", flag=f.flag))
            cited_in["priority"].add(f.id)
    rank = {"anaphylaxis": 0, "severe_allergy": 1, "abnormal_lab": 2}
    sections["priority"].sort(key=lambda i: rank.get(i.flag or "", 9))

    # 3. Completeness: every active condition / medication and every surgery is listed (rule-based) if Gemini skipped it.
    for f in sheet.by_kind("condition", "medication"):
        if f.active and f.id not in cited_in["active"]:
            sections["active"].append(IntelligenceItem(text=f.label, source_ids=[f.id], origin="record"))
    for f in sorted(sheet.by_kind("surgery"), key=lambda f: f.date or "", reverse=True):
        if f.id not in cited_in["history"]:
            sections["history"].append(IntelligenceItem(text=f.label, source_ids=[f.id], origin="record"))

    # 4. Needs verification: explicit rules first, then Gemini's notes (plain text, no medical claims).
    for code, params in sheet.missing:
        sections["verify"].append(IntelligenceItem(code=code, text=params.get("name", ""), origin="record"))
    for note in draft.missing_information:
        clean = note.strip()[:MAX_FIELD]
        if clean and not FORBIDDEN_RE.search(norm(clean)) and not ICD_RE.search(clean):
            sections["verify"].append(IntelligenceItem(text=clean, origin="ai"))
        elif clean:
            discarded += 1

    overview_cited = _grounded("overview", draft.overview, sheet)
    overview = draft.overview.text.strip() if overview_cited else ""
    discarded += overview_cited is None

    used = {i for items in sections.values() for item in items for i in item.source_ids} | {
        f.id for f in overview_cited or []}
    sources = [SourceRef(id=f.id, kind=f.kind, label=f.label, date=f.date, document_id=f.document_id, flag=f.flag)
               for f in sheet.facts.values() if f.id in used]
    return MedicalIntelligence(
        overview=overview, overview_source_ids=[f.id for f in overview_cited or []],
        sections=[IntelligenceSection(category=c, items=sections[c]) for c in CATEGORY_ORDER],
        sources=sources, source_scopes=sheet.scopes, language=language, model=model,
        generated_at=generated_at, discarded_statements=discarded,
    )


def revalidate(summary: MedicalIntelligence, sheet: FactSheet) -> MedicalIntelligence:
    """Drops items whose sources no longer exist in the data the reader may see (deleted / not shared)."""
    alive = set(sheet.facts)
    out = summary.model_copy(deep=True)
    for section in out.sections:
        section.items = [i for i in section.items if not i.source_ids or all(s in alive for s in i.source_ids)]
    if not all(s in alive for s in out.overview_source_ids):
        out.overview, out.overview_source_ids = "", []
    out.sources = [s for s in out.sources if s.id in alive]
    return out
