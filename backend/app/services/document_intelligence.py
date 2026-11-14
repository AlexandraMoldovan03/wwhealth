"""
Smart Import — step 2: document intelligence for PDFs / images (text already produced by the existing OCR).

  • `analyze_with_gemini`: ONE call per document (only this document's text, truncated to a configured limit — never
    the whole record), strict Pydantic structured output. Every item must carry page + excerpt; the excerpt is checked
    against the page text and anything not found is marked uncertain ("to verify"). Suspicions stay suspicions;
    medication is always historical (as documented), never "active today".
  • `analyze_locally`: rule-based fallback (no AI) — used when Gemini is unavailable, not consented, over budget, or
    fails. Lower recall, same output format, every item verifiable in the text.
  • `finalize`: smart Romanian title, specialty, dates, ordering. Same for both paths.
Nothing here logs document content.
"""
import re
import unicodedata
from datetime import date

from app.schemas.smart_import import (
    ExtractedItem,
    ExtractedLab,
    GeminiDocument,
    ImportExtraction,
    SourceRef,
    NerTerm,
)
from app.services import lab_extraction
from app.services.import_parsers import fingerprint
from app.services.specialty_catalog import BY_ID

PIPELINE_VERSION = "si-1.0"

# ─────────────────────────────────────────────────────────── text helpers


def fold(text: str | None) -> str:
    stripped = "".join(c for c in unicodedata.normalize("NFD", text or "") if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9%.,/ ]", " ", stripped.lower()).split())


def clip(text: str | None, n: int) -> str | None:
    if not text:
        return None
    text = " ".join(str(text).split())
    return text[:n] or None


PLACEHOLDER_RE = re.compile(r"\[[^\]]*\]|\b(?:MM/DD/YYYY|DD/MM/YYYY|DD\.MM\.YYYY|XX+|N/A)\b|\bname\b", re.I)
SYNTHETIC_RE = re.compile(r"synthetic (?:data|creation|record)|date sintetice|document demo|\[DEMO\]", re.I)


def is_placeholder(value: str | None) -> bool:
    if not value:
        return True
    v = value.strip()
    return bool(re.fullmatch(r"\[.*\]", v)) or bool(re.search(r"\b(MM/DD/YYYY|DD/MM/YYYY|XXXX+)\b", v, re.I)) or bool(
        re.search(r"\[[^\]]*(name|nume|date|data|xx|physician|doctor|medic|hospital|spital|address|id)[^\]]*\]", v, re.I))


def unbracket(value: str | None) -> str | None:
    if value is None:
        return None
    v = value.strip()
    if v.startswith("[") and v.endswith("]"):
        v = v[1:-1].strip()
    return v or None


MONTHS = {m: i + 1 for i, m in enumerate(
    ("january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"))}
MONTHS.update({m: i + 1 for i, m in enumerate(
    ("ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie",
     "noiembrie", "decembrie"))})
MONTHS.update({k[:3]: v for k, v in list(MONTHS.items())})
DATE_TEXT_RE = re.compile(
    r"\b(?:(?P<mon>[A-Za-z]{3,9})\.?\s+(?P<d1>\d{1,2}),?\s+(?P<y1>\d{4})"
    r"|(?P<d2>\d{1,2})\s+(?P<mon2>[A-Za-z]{3,10})\.?\s+(?P<y2>\d{4})"
    r"|(?P<a>\d{1,2})(?P<sep>[./-])(?P<b>\d{1,2})(?P=sep)(?P<y3>\d{4})"
    r"|(?P<iy>\d{4})-(?P<im>\d{2})-(?P<id>\d{2}))\b")


def parse_date(text: str | None, english: bool = True) -> str | None:
    """First real date in `text` → ISO. Slashes in English documents are US month/day; dots are day.month."""
    if not text:
        return None
    for m in DATE_TEXT_RE.finditer(text):
        try:
            if m.group("mon") and m.group("mon").lower() in MONTHS:
                d = date(int(m.group("y1")), MONTHS[m.group("mon").lower()], int(m.group("d1")))
            elif m.group("mon2") and m.group("mon2").lower() in MONTHS:
                d = date(int(m.group("y2")), MONTHS[m.group("mon2").lower()], int(m.group("d2")))
            elif m.group("a"):
                a, b, y = int(m.group("a")), int(m.group("b")), int(m.group("y3"))
                month_first = english and m.group("sep") == "/"
                d = date(y, a, b) if month_first else date(y, b, a)
            elif m.group("iy"):
                d = date(int(m.group("iy")), int(m.group("im")), int(m.group("id")))
            else:
                continue
        except ValueError:
            continue
        if date(1900, 1, 1) <= d <= date.today():
            return d.isoformat()
    return None


def valid_iso(value: str | None) -> str | None:
    if not value:
        return None
    try:
        d = date.fromisoformat(value[:10])
    except ValueError:
        return None
    return d.isoformat() if date(1900, 1, 1) <= d <= date.today() else None


def is_english(text: str) -> bool:
    f = fold(text[:4000])
    en = sum(f.count(w) for w in (" the ", " and ", " patient ", " with ", " was "))
    ro = sum(f.count(w) for w in (" si ", " pacient", " cu ", " pentru ", " este "))
    return en >= ro


# ─────────────────────────────────────────────────────────── vocabulary (EN → RO, classification)

DX_RO: tuple[tuple[str, str, str], ...] = (
    # (folded EN/RO pattern, Romanian name, specialty id)
    ("arterial hypertension", "hipertensiune arterială", "cardiology"),
    ("hypertension", "hipertensiune arterială", "cardiology"),
    ("hipertensiune", "hipertensiune arterială", "cardiology"),
    ("type 1 diabetes", "diabet zaharat tip 1", "endocrinology"),
    ("type i diabetes", "diabet zaharat tip 1", "endocrinology"),
    ("diabetes mellitus type 1", "diabet zaharat tip 1", "endocrinology"),
    ("type 2 diabetes", "diabet zaharat tip 2", "endocrinology"),
    ("type ii diabetes", "diabet zaharat tip 2", "endocrinology"),
    ("diabetes mellitus type 2", "diabet zaharat tip 2", "endocrinology"),
    ("diabetic ketoacidosis", "cetoacidoză diabetică", "endocrinology"),
    ("diabet zaharat tip 1", "diabet zaharat tip 1", "endocrinology"),
    ("diabet zaharat tip 2", "diabet zaharat tip 2", "endocrinology"),
    ("hypothyroidism", "hipotiroidism", "endocrinology"),
    ("hipotiroidism", "hipotiroidism", "endocrinology"),
    ("hyperthyroidism", "hipertiroidism", "endocrinology"),
    ("influenza", "gripă", "infectious_diseases"),
    ("gripa", "gripă", "infectious_diseases"),
    ("pneumonia", "pneumonie", "pulmonology"),
    ("pneumonie", "pneumonie", "pulmonology"),
    ("intracerebral hemorrhage", "hemoragie intracerebrală", "neurology"),
    ("intracerebral haemorrhage", "hemoragie intracerebrală", "neurology"),
    ("hemoragie intracerebrala", "hemoragie intracerebrală", "neurology"),
    ("ischemic stroke", "accident vascular cerebral ischemic", "neurology"),
    ("ischaemic stroke", "accident vascular cerebral ischemic", "neurology"),
    ("accident vascular cerebral", "accident vascular cerebral", "neurology"),
    ("maisonneuve fracture", "fractură Maisonneuve", "orthopedics"),
    ("bimalleolar", "fractură bimaleolară de gleznă", "orthopedics"),
    ("trimalleolar", "fractură trimaleolară de gleznă", "orthopedics"),
    ("ankle fracture", "fractură de gleznă", "orthopedics"),
    ("distal humeral fracture", "fractură humerală distală", "orthopedics"),
    ("distal humerus fracture", "fractură humerală distală", "orthopedics"),
    ("humeral fracture", "fractură de humerus", "orthopedics"),
    ("fractura", "fractură", "orthopedics"),
    ("fracture", "fractură", "orthopedics"),
    ("asthma", "astm bronșic", "pulmonology"),
    ("heart failure", "insuficiență cardiacă", "cardiology"),
    ("atrial fibrillation", "fibrilație atrială", "cardiology"),
    ("myocardial infarction", "infarct miocardic", "cardiology"),
    ("chronic kidney disease", "boală cronică de rinichi", "nephrology"),
    ("anemia", "anemie", "hematology"),
    ("hyperlipidemia", "hiperlipidemie", "cardiology"),
    ("obesity", "obezitate", "endocrinology"),
)

TRAUMA_TERMS = ("fractur", "trauma", "traumat", "accident", "injury", "contusion", "luxat", "dislocation", "entorsa", "sprain")
CATEGORY_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("discharge_summary", ("discharge summary", "date of discharge", "discharge date", "bilet de iesire", "scrisoare medicala",
                           "externare", "data externarii", "discharged")),
    ("surgery", ("operative report", "protocol operator", "operation note", "procedure note", "interventie chirurgicala")),
    ("imaging_report", ("radiology report", "imaging report", "ct scan report", "mri report", "buletin radiologic",
                        "examen imagistic", "ecografie", "radiografie", "computer tomograf")),
    ("lab_result", ("buletin de analize", "laboratory report", "lab results", "rezultate analize", "analize medicale",
                    "hemoleucograma", "complete blood count")),
    ("prescription", ("reteta", "prescription", "rx ", "prescriptie")),
    ("vaccination", ("vaccination record", "certificat de vaccinare", "vaccin administrat", "immunization record")),
    ("consultation", ("consultation", "consultatie", "outpatient visit", "clinic visit", "fisa de consultatie")),
)

CATEGORY_TITLE = {
    "discharge_summary": "Externare", "lab_result": "Analize de laborator", "consultation": "Consultație",
    "trauma": "Externare", "surgery": "Intervenție chirurgicală", "prescription": "Rețetă medicală",
    "imaging_report": "Investigație imagistică", "vaccination": "Vaccinare", "other": "Document medical",
}


def ro_condition(name: str | None) -> tuple[str | None, str | None]:
    """(Romanian name, specialty id) for a known condition, else (None, None)."""
    f = fold(name)
    for pattern, ro, spec in DX_RO:
        if pattern in f:
            return ro, spec
    return None, None


def classify(text: str) -> str:
    f = fold(text[:6000])
    for category, terms in CATEGORY_RULES:
        if any(t in f for t in terms):
            if category == "discharge_summary":
                hit = _field(_lines([text]), DIAGNOSIS_LABELS)
                head = fold(hit[0] if hit else "")
                if any(t in head for t in TRAUMA_TERMS):
                    return "trauma"
            return category
    if len(lab_extraction.parse_lab_values(text)) >= 5:
        return "lab_result"
    return "other"


# ─────────────────────────────────────────────────────────── local (no AI) extraction

HEADING_RE = re.compile(r"^(?P<label>[A-ZĂÂÎȘȚ][A-Za-zăâîșțĂÂÎȘȚ'’ /()&-]{2,60}):\s*(?P<rest>.*)$")
DIAGNOSIS_LABELS = ("diagnosis", "primary diagnosis", "admission diagnosis", "discharge diagnosis", "final diagnosis",
                    "principal diagnosis", "diagnostic", "diagnostic principal", "diagnostic la externare",
                    "diagnostic de trimitere", "diagnosis at discharge")
SECONDARY_LABELS = ("secondary diagnoses", "secondary diagnosis", "comorbidities", "diagnostice secundare")
MED_SECTIONS = ("discharge medications", "medications at discharge", "medications on discharge", "discharge medication",
                "medication at discharge", "tratament la externare", "medicatie la externare", "recomandari terapeutice")
FOLLOW_SECTIONS = ("follow-up", "follow up", "follow-up appointments", "follow-up and recommendations", "follow-up care",
                   "follow-up and instructions", "follow-up and outpatient care", "control", "controale")
RECO_SECTIONS = ("recommendations", "discharge instructions", "instructions for patient", "specific instructions",
                 "discharge plan", "recomandari", "screenings and recommendations")
INVEST_SECTIONS = ("diagnostic workup", "imaging", "imaging and findings", "diagnostic evaluation", "diagnostic assessment",
                   "investigatii", "investigatii paraclinice")
PROCEDURE_LABELS = ("procedures performed", "procedures", "surgical intervention", "procedure", "interventii",
                    "interventie chirurgicala", "surgery")
REASON_LABELS = ("reason for admission", "chief complaint", "motivul internarii", "motivul prezentarii", "reason for visit")
INSTITUTION_LABELS = ("hospital", "institution", "facility", "spital", "unitate", "clinica", "department")
PHYSICIAN_LABELS = ("attending physician", "admitting physician", "consulting physician", "physician", "medic curant",
                    "medic", "prepared by", "doctor")
ALLERGY_LABELS = ("allergies", "alergii", "known allergies")
NAME_LABELS = ("patient name", "name", "nume", "nume pacient", "pacient")
DOB_LABELS = ("date of birth", "dob", "data nasterii", "birth date")
DISCHARGE_DATE_LABELS = ("date of discharge", "discharge date", "data externarii")
ADMISSION_DATE_LABELS = ("date of admission", "admission date", "data internarii")
DOC_DATE_LABELS = ("date", "data", "report date", "data emiterii")


BULLET_RE = re.compile(r"^[^\w\[(\"'„]+")
RUNNING_RE = re.compile(r"^(Generated \d{4}-\d{2}-\d{2}.*|Page \d+( of \d+)?|Pagina \d+.*|Record ID:.*)$", re.I)


def clean_pages(pages: list[str]) -> list[str]:
    """Drops running headers / footers (lines repeated at the top of several pages, generator stamps, record ids)
    so they are never read as clinical data — and never sent to Gemini (fewer tokens)."""
    heads: dict[str, int] = {}
    for text in pages:
        for raw in [ln.strip() for ln in text.splitlines() if ln.strip()][:5]:
            heads[raw] = heads.get(raw, 0) + 1
    repeated = {h for h, n in heads.items() if n >= 2 and len(pages) >= 2}
    out = []
    for text in pages:
        keep = [ln for ln in text.splitlines() if ln.strip() and ln.strip() not in repeated and not RUNNING_RE.match(ln.strip())]
        out.append("\n".join(keep))
    return out


def _lines(pages: list[str]) -> list[tuple[int, str]]:
    out = []
    for p, text in enumerate(pages, start=1):
        for raw in text.splitlines():
            line = BULLET_RE.sub("", " ".join(raw.split()))
            if line:
                out.append((p, line))
    return out


def _paragraphs(lines: list[tuple[int, str]]) -> list[tuple[int, str]]:
    """Joins wrapped lines, then splits into sentences / numbered points (each ≤ 300 chars)."""
    blocks: list[tuple[int, str]] = []
    for page, line in lines:
        if blocks and not re.match(r"^(\d+[.)]\s|[A-Z][A-Za-z ]{2,40}:)", line) and (not blocks[-1][1].endswith((".", ":")) or re.search(r"\b(Dr|Mr|Mrs|Ms|St|Prof)\.$", blocks[-1][1])):
            blocks[-1] = (blocks[-1][0], f"{blocks[-1][1]} {line}")
        else:
            blocks.append((page, line))
    out = []
    for page, block in blocks:
        for part in re.split(r"(?<!\bDr\.)(?<!\bMr\.)(?<!Mrs\.)(?<!\bMs\.)(?<!\bSt\.)(?<!\bvs\.)(?<=[.])\s+(?=\d+\.\s|[A-Z])", block):
            part = part.strip(" -")
            if len(part) > 8:
                out.append((page, part[:300]))
    return out


def _field_values(text: str, labels: tuple[str, ...]) -> list[str]:
    out = []
    for raw in text.splitlines():
        m = HEADING_RE.match(" ".join(raw.split()))
        if m and fold(m.group("label")) in labels and m.group("rest").strip():
            out.append(m.group("rest").strip())
    return out


def _field(lines: list[tuple[int, str]], labels: tuple[str, ...]) -> tuple[str, int, str] | None:
    """(value, page, line) of the first `Label: value` line (value may be on the next line)."""
    for i, (page, line) in enumerate(lines):
        m = HEADING_RE.match(line)
        if m and fold(m.group("label")) in labels:
            rest = m.group("rest").strip()
            if not rest and i + 1 < len(lines) and not HEADING_RE.match(lines[i + 1][1]):
                rest = lines[i + 1][1]
                line = f"{line} {rest}"
            if rest:
                return rest, page, line
    return None


def _section(lines: list[tuple[int, str]], labels: tuple[str, ...], limit: int = 14) -> list[tuple[int, str]]:
    """Lines under a heading (until the next heading)."""
    out: list[tuple[int, str]] = []
    for i, (_page, line) in enumerate(lines):
        m = HEADING_RE.match(line)
        if m and fold(m.group("label")) in labels:
            if m.group("rest").strip():
                out.append((lines[i][0], m.group("rest").strip()))
            for page, nxt in lines[i + 1:]:
                h = HEADING_RE.match(nxt)
                if h and not re.match(r"^\s*[-•▪\d]", nxt) and len(h.group("label")) > 3 and _is_heading(h.group("label")):
                    break
                if re.match(r"^(PATIENT DISCHARGE SUMMARY|Page \d+|Generated \d{4})", nxt) or "synthetic data" in nxt:
                    continue
                out.append((page, nxt))
                if len(out) >= limit:
                    break
            if out:
                return out
    return out


KNOWN_HEADINGS = set(DIAGNOSIS_LABELS + SECONDARY_LABELS + MED_SECTIONS + FOLLOW_SECTIONS + RECO_SECTIONS + INVEST_SECTIONS
                     + PROCEDURE_LABELS + REASON_LABELS + ALLERGY_LABELS) | {
    "hospital course", "history of present illness", "physical examination and findings", "patient education",
    "summary and prognosis", "prognosis", "summary", "progress", "treatment and management", "management",
    "hospital course and management", "physician's signature", "physician signature", "signature",
    "discharge condition", "education", "functional status at discharge", "recovery and rehabilitation",
    "treatment summary", "management and treatment", "history and physical examination", "admission summary",
    "patient information", "patient details", "evolutie", "tratament", "epicriza", "istoric", "prepared by", "date",
    "note", "signed", "conclusion", "discharge summary", "chief complaint", "education provided", "vaccinations",
    "complications screening", "diagnostic findings", "physical examination and diagnostic findings"}


def _is_heading(label: str) -> bool:
    return fold(label) in KNOWN_HEADINGS


def _sentences(lines: list[tuple[int, str]]) -> list[tuple[int, str]]:
    out = []
    for page, line in _paragraphs(lines):
        for s in re.split(r"(?<!\bDr\.)(?<!\bMr\.)(?<!Mrs\.)(?<!\bMs\.)(?<=[.;])\s+(?=[A-Z0-9])", line):
            s = s.strip(" -•▪")
            if len(s) > 3:
                out.append((page, s))
    return out


DOSE_RE = re.compile(r"(\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|g|ml|mL|units?|IU|UI|unit[aă]ți)(?:/\w+)?)", re.I)
MED_NAME_RE = re.compile(r"^([A-Za-zăâîșțĂÂÎȘȚ][A-Za-zăâîșțĂÂÎȘȚ\- ()]{1,60}?)\s*(?=\d|:|,|\(|$)")


def _parse_med(line: str) -> tuple[str, str | None, str | None] | None:
    line = line.strip(" -•▪\t")
    if re.match(r"^(patient|the patient|he |she |continue|avoid|do not|no )", line, re.I):
        return None
    m = MED_NAME_RE.match(line)
    if not m:
        return None
    name = m.group(1).strip(" (")
    if len(name) < 3 or len(name.split()) > 4:
        return None
    dose = DOSE_RE.search(line)
    if not dose and not name[0].isupper():
        return None
    if re.search(r"\b(clinic|appointment|weeks?|days?|months?|follow|doctor|dr)\b", name, re.I):
        return None
    rest = line[m.end():]
    if dose:
        rest = line[dose.end():]
    freq = clip(rest.strip(" :,.-"), 160)
    if not dose and not re.search(r"(daily|twice|once|every|tablet|zilnic|pe zi|ori/zi|as needed)", line, re.I):
        return None
    return name, dose.group(1) if dose else None, freq


def _certainty(sentence: str) -> str:
    f = fold(sentence)
    if re.search(r"\b(rule[sd]? out|ruled out|exclus|infirmat|negative for|no evidence of|without evidence)\b", f):
        return "ruled_out"
    if re.search(r"\b(suspect|suspected|possible|probable|likely|query|presumed|suspiciune|posibil|probabil)\b", f):
        return "suspected"
    if re.search(r"\b(history of|past medical history|known|previous|antecedente|cunoscut)\b", f):
        return "history"
    return "confirmed"


def _item(kind: str, label: str, page: int, excerpt: str, *, status: str | None = None, detail: str | None = None,
          when: str | None = None, uncertain: bool = False, value: dict | None = None) -> ExtractedItem:
    label = clip(label, 200) or "-"
    return ExtractedItem(key=fingerprint(kind, label, when, status), kind=kind, label=label, detail=clip(detail, 400),
                         status=status, date=when, value=value or {},
                         source=SourceRef(page=page, excerpt=clip(excerpt, 300), verified=True), uncertain=uncertain)


def local_identity(pages: list[str]) -> dict:
    lines = _lines(pages)
    english = is_english("\n".join(pages))
    name = _field(lines, NAME_LABELS)
    dob = _field(lines, DOB_LABELS)
    raw_dob = dob[0] if dob else None
    sex = None
    f = fold("\n".join(pages)[:5000])
    if re.search(r"\b\d{1,3}[- ]year[- ]old (male|man)\b|\bsex: m(ale)?\b|\bsex masculin\b", f):
        sex = "male"
    elif re.search(r"\b\d{1,3}[- ]year[- ]old (female|woman)\b|\bsex: f(emale)?\b|\bsex feminin\b", f):
        sex = "female"
    return {
        "name": unbracket(name[0]) if name else None,
        "name_placeholder": bool(name and is_placeholder(name[0])) or bool(name and "john doe" in fold(name[0])),
        "birth_date": parse_date(unbracket(raw_dob), english) if raw_dob and not is_placeholder(raw_dob) else None,
        "birth_placeholder": bool(raw_dob and is_placeholder(raw_dob)),
        "sex": sex,
        "synthetic": bool(SYNTHETIC_RE.search("\n".join(pages))),
    }


def analyze_locally(pages: list[str]) -> ImportExtraction:
    text = "\n".join(pages)
    lines = _lines(pages)
    english = is_english(text)
    items: list[ExtractedItem] = []
    to_verify: list[str] = []

    def date_of(labels: tuple[str, ...]) -> str | None:
        hit = _field(lines, labels)
        if not hit:
            return None
        if is_placeholder(hit[0]) and not parse_date(unbracket(hit[0]), english):
            to_verify.append("placeholder_values")
        return parse_date(unbracket(hit[0]), english)

    discharge, admission = date_of(DISCHARGE_DATE_LABELS), date_of(ADMISSION_DATE_LABELS)
    doc_date = None
    for page, line in reversed(lines):
        m = HEADING_RE.match(line)
        if m and fold(m.group("label")) in DOC_DATE_LABELS:
            doc_date = parse_date(unbracket(m.group("rest")), english)
            if doc_date:
                break
    doc_date = doc_date or discharge or lab_extraction.find_document_date(text)
    event_date = discharge or admission or doc_date

    # diagnoses (labelled lines first, then documented conditions in the text)
    seen: set[str] = set()
    for labels, default_status in ((DIAGNOSIS_LABELS, None), (SECONDARY_LABELS, "confirmed")):
        hit = _field(lines, labels)
        if not hit:
            continue
        value, page, line = hit
        parts = [p.strip(" .") for p in re.split(r",|;| and (?=[A-Z])", value) if p.strip(" .")] if default_status else [value.strip(" .")]
        for part in parts[:8]:
            clean = unbracket(part) or part
            if is_placeholder(part) and not ro_condition(clean)[0]:
                continue
            status = default_status or _certainty(clean)
            if status == "suspected" and "," in value and not default_status:
                status = "confirmed"  # a list with one "suspected" element: certainty per element below
            for sub in ([clean] if default_status else re.split(r",\s*including\s+|;\s*", clean)):
                k = fold(sub)[:60]
                if k and k not in seen:
                    seen.add(k)
                    if ro_condition(sub)[0]:
                        seen.add(fold(ro_condition(sub)[0]))
                    items.append(_item("diagnosis", sub.strip(" ."), page, line, status=_certainty(sub) if not default_status else status,
                                       when=event_date))
    if not any(i.kind == "diagnosis" for i in items):
        # No labelled diagnosis: documented conditions in the narrative, ranked by how often they are mentioned.
        # Always marked uncertain (the patient must verify); a mere mention is not a diagnosis.
        found: dict[str, dict] = {}
        for page, sentence in _sentences(lines):
            f = fold(sentence)
            if re.search(r"family history", f):
                continue
            for pattern, ro, _spec in DX_RO:
                if pattern in f and not (ro in found and found[ro]["last"] == sentence):
                    entry = found.setdefault(ro, {"count": 0, "label": pattern, "hits": [], "last": None})
                    entry["count"] += 1
                    entry["last"] = sentence
                    entry["hits"].append((page, sentence, _certainty(sentence),
                                          bool(re.search(r"diagnosed with|diagnosis of|confirm|positive for|conclusive for|consistent with|diagnostic de", f))))
        ranked = sorted(found.items(), key=lambda kv: -kv[1]["count"])
        for ro, entry in ranked[:4]:
            if fold(ro) in seen:
                continue
            strong = [h for h in entry["hits"] if h[3] and h[2] not in ("history", "ruled_out")]
            history = [h for h in entry["hits"] if h[2] == "history"]
            suspected = [h for h in entry["hits"] if h[2] == "suspected"]
            ruled = [h for h in entry["hits"] if h[2] == "ruled_out" and h[3] is False]
            if strong:
                page, sentence, status = strong[0][0], strong[0][1], "confirmed"
            elif history and len(history) == len(entry["hits"]):
                page, sentence, status = history[0][0], history[0][1], "history"
            elif suspected:
                page, sentence, status = suspected[0][0], suspected[0][1], "suspected"
            elif ruled and len(ruled) == len(entry["hits"]):
                continue
            else:
                continue  # only mentioned
            seen.add(fold(ro))
            label = entry["label"].title() if english else ro
            items.append(_item("diagnosis", label, page, sentence, status=status,
                               when=event_date if status == "confirmed" else None, uncertain=True))
    # history mentioned in the narrative ("past medical history significant for X") → history, never active
    for page, sentence in _sentences(lines):
        m = re.search(r"(?<!family )(?:past medical history (?:significant for|of)|history of|antecedente(?: de)?)\s+([A-Za-z0-9 ,\-]+?)(?:,| was| and|\.|$)",
                      sentence, re.I)
        if m and not re.search(r"family history|no significant", sentence, re.I):
            label = m.group(1).strip()
            ro = ro_condition(label)[0]
            if 3 < len(label) < 60 and ro and fold(ro) not in seen and fold(label)[:60] not in seen:
                seen.add(fold(ro))
                items.append(_item("diagnosis", label, page, sentence, status="history"))

    reason = _field(lines, REASON_LABELS)
    if reason:
        items.append(_item("reason", reason[0].split(". ")[0], reason[1], reason[2]))
    else:
        for page, sentence in _sentences(lines):
            m = re.search(r"(?:with|presented with) (?:complaints of |a \d+-day history of |a sudden onset of )?(.{8,200}?)(?:\.|$)", sentence)
            if m and re.search(r"admitted|presented", sentence, re.I):
                items.append(_item("reason", m.group(1), page, sentence))
                break

    for page, line in _section(lines, MED_SECTIONS, 12):
        med = _parse_med(line)
        if med:
            name, dose, freq = med
            items.append(_item("medication", name, page, line, status="at_discharge", detail=" · ".join(x for x in (dose, freq) if x),
                               when=event_date, value={"dose": dose, "frequency": freq}))

    allergy = _field(lines, ALLERGY_LABELS)
    if allergy and not re.search(r"\b(none|no known|nkda|nu se cunosc|fara)\b", allergy[0], re.I) and not is_placeholder(allergy[0]):
        for part in re.split(r",|;", allergy[0])[:6]:
            if part.strip():
                items.append(_item("allergy", part.strip(" ."), allergy[1], allergy[2]))

    proc = _field(lines, ("procedures performed", "procedures", "interventii", "proceduri", "interventii efectuate"))
    # Only short, affirmative lists ("MRI Brain, Echocardiography") — never a sentence that may say it was NOT done.
    if proc and not re.search(r"\b(not|no|against|declined|deferred|without|refuz|nu s-a)\b", proc[0], re.I):
        for part in re.split(r",|;", proc[0])[:8]:
            if 2 < len(part.strip()) < 60 and len(part.split()) <= 6 and re.match(r"^[A-ZĂÂÎȘȚ]", part.strip()) \
                    and not re.match(r"^(On|In|At|The|Pe|In data)\b", part.strip()):
                items.append(_item("procedure", part.strip(" ."), proc[1], proc[2], when=event_date))

    labs_text = set()
    for page, line in _section(lines, INVEST_SECTIONS, 14):
        m = re.match(r"^[-•▪\s]*([A-Z][A-Za-z0-9 ()/'-]{2,50}):\s*(.{2,200})$", line)
        if m and not DOSE_RE.search(m.group(2)) and not re.search(r"\d+(?:[.,]\d+)?\s*(mg/dl|mmol|g/dl|%|u/l|mmhg|mm hg)", m.group(2), re.I):
            items.append(_item("investigation", m.group(1).strip(), page, line, detail=m.group(2)))
        else:
            labs_text.add(line)

    follow = _paragraphs(_section(lines, FOLLOW_SECTIONS, 16))
    for page, sentence in follow[:6]:
        when = parse_date(sentence.replace("[", "").replace("]", ""), english)
        if when or re.search(r"follow[- ]?up|appointment|control|reassess|scheduled|programat", sentence, re.I):
            items.append(_item("follow_up", sentence, page, sentence, when=when))
    for page, sentence in _paragraphs(_section(lines, RECO_SECTIONS, 16))[:6]:
        if not re.search(r"follow[- ]?up appointment|scheduled for", sentence, re.I):
            items.append(_item("recommendation", sentence, page, sentence))

    # labs: existing local parser, with the page each value was read on
    labs: list[ExtractedLab] = []
    for p, page_text in enumerate(pages, start=1):
        for v in lab_extraction.parse_lab_values(page_text):
            labs.append(ExtractedLab(
                key=fingerprint("lab", v["name"], v["value"], event_date), name=v["name"], value=v["value"],
                unit=v.get("unit"), reference_range=v.get("reference_range"), measured_at=event_date,
                source=SourceRef(page=p, excerpt=clip(v.get("source_line"), 300), verified=True),
                uncertain=bool(v.get("needs_review"))))
    for page, line in _lines(pages):
        m = re.match(r"^[-•▪\s]*([A-Z][A-Za-z ()-]{2,50}):\s*(\d+(?:[.,]\d+)?)\s*(mg/dL|mmol/L|g/dL|%|U/L|ng/mL|mIU/L|µIU/mL|pg/mL)\b", line)
        if m and not any(fold(lab.name) == fold(m.group(1)) for lab in labs):
            labs.append(ExtractedLab(key=fingerprint("lab", m.group(1), m.group(2), event_date), name=m.group(1).strip()[:80],
                                     value=m.group(2), unit=m.group(3), measured_at=event_date,
                                     source=SourceRef(page=page, excerpt=clip(line, 300), verified=True)))

    inst = _field(lines, INSTITUTION_LABELS)
    phys = _field(lines, PHYSICIAN_LABELS)
    if PLACEHOLDER_RE.search(text) and "placeholder_values" not in to_verify and re.search(r"\[[^\]]+\]", text):
        to_verify.append("placeholder_values")
    if not event_date:
        to_verify.append("no_date")
    if not any(i.kind == "diagnosis" for i in items) and classify(text) in ("discharge_summary", "trauma", "consultation"):
        to_verify.append("no_diagnosis_found")
    return ImportExtraction(
        category=classify(text), event_date=event_date, document_date=doc_date,
        institution=clip(unbracket(inst[0]), 160) if inst and not is_placeholder(inst[0]) else None,
        physician=clip(unbracket(phys[0]), 120) if phys and not is_placeholder(phys[0]) else None,
        items=_dedupe(items), labs=_dedupe_labs(labs), to_verify=sorted(set(to_verify)), page_count=len(pages) or 1)


def _dedupe(items: list[ExtractedItem]) -> list[ExtractedItem]:
    seen, out = set(), []
    for i in items:
        if i.key not in seen:
            seen.add(i.key)
            out.append(i)
    return out[:300]


def _dedupe_labs(labs: list[ExtractedLab]) -> list[ExtractedLab]:
    seen, out = set(), []
    for lab in labs:
        if lab.key not in seen:
            seen.add(lab.key)
            out.append(lab)
    return out[:200]


# ─────────────────────────────────────────────────────────── Gemini

GEMINI_SYSTEM = """You extract structured data from ONE medical document for the patient who uploaded it. The document text
is given page by page ("=== PAGE n ==="). Rules — follow all of them:
1. Use ONLY what is written in this document. Never invent or infer a diagnosis, value, date, dose, institution or
   person. If something is not written, leave it null / empty and, if important, add a short note to to_verify.
2. Every item must have page (the page number where it is written) and excerpt (a SHORT exact quote, max 200
   characters, copied verbatim from that page) that supports it.
3. Diagnoses: certainty "confirmed" only if the document states it as a diagnosis; "suspected" for suspected /
   possible / probable / to rule out; "ruled_out" if excluded; "history" for past history / comorbidities mentioned
   as background. Never upgrade a suspicion to confirmed.
4. Medications: context is when they were documented (at_discharge, during_stay, prior, prescribed). They describe
   the past — never state that a treatment is current or active today.
5. Lab values: name, value, unit and reference range exactly as written; no unit conversion, no interpretation.
6. category: discharge_summary, lab_result, consultation, trauma (accident / injury / fracture hospitalisation),
   surgery (operative report), prescription, imaging_report, vaccination or other.
7. specialty: one of {specialties} or null.
8. title_ro: a short natural ROMANIAN title (max 70 characters) describing the document, e.g.
   "Externare pentru hipertensiune arterială", "Analize de sânge – martie 2024", "Consultație cardiologică".
   Use the main documented diagnosis; never a suspected one as if confirmed.
9. Dates as YYYY-MM-DD only when the full date is written; placeholders like [Date] or MM/DD/YYYY → null.
10. patient_name / patient_birth_date / patient_sex: only as written in the document (null for placeholders).
Medication fields: name without strength, strength, administered dose, frequency and duration are separate. Use null for missing fields.
11. No advice, no new recommendations, no severity judgement. Recommendations / follow_ups only if written."""


def gemini_prompt_contents(pages: list[str], max_chars: int, terms: list[NerTerm] | None = None) -> tuple[str, bool]:
    parts, used, truncated = [], 0, False
    for n, text in enumerate(pages, start=1):
        block = f"=== PAGE {n} ===\n{text.strip()}\n"
        if used + len(block) > max_chars:
            parts.append(block[: max(0, max_chars - used)])
            truncated = True
            break
        parts.append(block)
        used += len(block)
    contents = "".join(parts)
    if not terms or truncated:
        return contents, truncated

    # Point to passages already present in the primary payload.
    # Keep the context in the original page instead of repeating it.
    heading = "\nUnverified hints. Read the cited page for negation and history. Cite the original text, never a hint.\n"
    remaining = min(800, max_chars - len(contents)) - len(heading)
    hints = []
    seen = set()
    for term in terms:
        page = term.page or (1 if len(pages) == 1 else 0)
        if not 1 <= page <= len(pages):
            continue
        context = " ".join(term.context.split())
        word = term.text.strip()
        if not (word and word in context and 12 <= len(context) <= 220):
            continue
        if context not in " ".join(pages[page - 1].split()):
            continue
        key = (page, fold(word))
        if key in seen:
            continue
        if len(word) > 60 or len(word.split()) > 8:
            continue
        line = f"Page {page}: {word}\n"
        if len(line) > remaining:
            continue
        seen.add(key)
        hints.append(line)
        remaining -= len(line)
        if len(hints) == 4:
            break
    return contents + (heading + "".join(hints) if hints else ""), truncated


def system_prompt() -> str:
    return GEMINI_SYSTEM.format(specialties=", ".join(sorted(BY_ID)))


def _verify(page: int | None, excerpt: str | None, pages: list[str]) -> tuple[int | None, bool]:
    """(page where the excerpt really is, verified). Short / missing excerpts are never verified."""
    q = fold(excerpt)
    if len(q) < 4:
        return page, False
    probe = q[:120]
    if page and 1 <= page <= len(pages) and probe in fold(pages[page - 1]):
        return page, True
    for n, text in enumerate(pages, start=1):
        if probe in fold(text):
            return n, True
    return page, False


def from_gemini(doc: GeminiDocument, pages: list[str]) -> tuple[ImportExtraction, dict]:
    items: list[ExtractedItem] = []
    labs: list[ExtractedLab] = []
    to_verify = [clip(t, 200) for t in doc.to_verify if clip(t, 200)]
    unverified = 0

    def src(page: int, excerpt: str) -> tuple[SourceRef, bool]:
        nonlocal unverified
        real_page, ok = _verify(page, excerpt, pages)
        if not ok:
            unverified += 1
        return SourceRef(page=real_page, excerpt=clip(excerpt, 300), verified=ok), not ok

    event = valid_iso(doc.event_date)
    for d in doc.diagnoses:
        s, bad = src(d.page, d.excerpt)
        items.append(ExtractedItem(key=fingerprint("diagnosis", d.name, event, d.certainty), kind="diagnosis",
                                   label=d.name, status=d.certainty, date=event, source=s, uncertain=bad or d.certainty != "confirmed"))
    for kind, group in (("symptom", doc.symptoms), ("investigation", doc.investigations), ("procedure", doc.procedures),
                        ("recommendation", doc.recommendations), ("follow_up", doc.follow_ups),
                        ("vaccination", doc.vaccinations), ("reason", [doc.reason] if doc.reason else [])):
        for g in group:
            s, bad = src(g.page, g.excerpt)
            when = valid_iso(g.date)
            items.append(ExtractedItem(key=fingerprint(kind, g.text, when), kind=kind, label=clip(g.text, 200) or "-",
                                       date=when, source=s, uncertain=bad))
    for m in doc.medications:
        s, bad = src(m.page, m.excerpt)
        items.append(ExtractedItem(key=fingerprint("medication", m.name, m.dose, m.context), kind="medication", label=m.name,
                                   status=m.context, detail=" · ".join(x for x in (m.strength, m.dose, m.frequency, m.duration) if x) or None,
                                   date=event, value={"strength": m.strength, "dose": m.dose, "frequency": m.frequency, "duration": m.duration}, source=s, uncertain=bad))
    for a in doc.allergies:
        s, bad = src(a.page, a.excerpt)
        items.append(ExtractedItem(key=fingerprint("allergy", a.substance), kind="allergy", label=a.substance,
                                   detail=a.reaction, source=s, uncertain=bad))
    for lab in doc.labs:
        s, bad = src(lab.page, lab.excerpt)
        when = valid_iso(lab.date) or event
        labs.append(ExtractedLab(key=fingerprint("lab", lab.name, lab.value, when), name=lab.name, value=lab.value, unit=lab.unit,
                                 reference_range=lab.reference_range, measured_at=when, source=s, uncertain=bad))
    if unverified:
        to_verify.append("unverified_sources")
    if doc.event_date and not event:
        to_verify.append("invalid_date")
    extraction = ImportExtraction(
        category=doc.category, specialty=doc.specialty if doc.specialty in BY_ID else None,
        proposed_title=clip(doc.title_ro, 120) or "", event_date=event, document_date=valid_iso(doc.document_date) or event,
        institution=clip(doc.institution, 160) if not is_placeholder(doc.institution) else None,
        physician=clip(doc.physician, 120) if not is_placeholder(doc.physician) else None,
        items=_dedupe(items), labs=_dedupe_labs(labs), to_verify=sorted(set(t for t in to_verify if t)),
        page_count=len(pages) or 1)
    identity = {"name": None if is_placeholder(doc.patient_name) else doc.patient_name,
                "birth_date": valid_iso(doc.patient_birth_date), "sex": doc.patient_sex}
    return extraction, identity


def gemini_usable(doc: GeminiDocument, pages: list[str]) -> bool:
    """A cheap-model answer worth keeping: a title and at least some verifiable content."""
    if not doc.title_ro.strip():
        return False
    total = len(doc.diagnoses) + len(doc.medications) + len(doc.labs) + len(doc.procedures) + len(doc.investigations)
    if total == 0:
        return len("".join(pages)) < 400  # a near-empty document may legitimately have nothing
    verified = sum(_verify(d.page, d.excerpt, pages)[1] for d in doc.diagnoses + doc.medications)  # type: ignore[operator]
    return verified > 0 or not (doc.diagnoses or doc.medications)


# ─────────────────────────────────────────────────────────── finishing (both paths)

MONTH_RO = ("ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie",
            "noiembrie", "decembrie")


def _month_year(iso: str | None) -> str | None:
    if not iso:
        return None
    return f"{MONTH_RO[int(iso[5:7]) - 1]} {iso[:4]}"


def smart_title(ex: ImportExtraction) -> str:
    """Natural Romanian title from documented data only (main CONFIRMED diagnosis, else the category)."""
    confirmed = [i for i in ex.items if i.kind == "diagnosis" and i.status == "confirmed" and i.include]
    main = confirmed[0].label if confirmed else None
    ro = ro_condition(main)[0] if main else None
    dx = ro or (main if main and not is_english(f" the {main} and ") else None) or main
    when = _month_year(ex.event_date)
    c = ex.category
    if c in ("discharge_summary", "trauma") and dx:
        return f"Externare pentru {dx[0].lower() + dx[1:] if ro else dx}"[:120]
    if c == "consultation":
        spec = BY_ID.get(ex.specialty or "")
        base = f"Consultație {spec.name_ro.lower()}" if spec else "Consultație"
        return (f"{base} – {dx}" if dx else (f"{base} – {when}" if when else base))[:120]
    if c == "surgery":
        proc = next((i.label for i in ex.items if i.kind == "procedure"), None)
        return (f"Intervenție chirurgicală: {proc}" if proc else CATEGORY_TITLE[c])[:120]
    if c == "lab_result":
        return (f"Analize de laborator – {when}" if when else "Analize de laborator")[:120]
    if c == "imaging_report":
        inv = next((i.label for i in ex.items if i.kind == "investigation"), None)
        return (f"Investigație imagistică: {inv}" if inv else CATEGORY_TITLE[c])[:120]
    base = CATEGORY_TITLE.get(c, "Document medical")
    if dx and c != "other":
        return f"{base} – {dx}"[:120]
    return (f"{base} – {when}" if when else base)[:120]


def finalize(ex: ImportExtraction, pages: list[str] | None = None) -> ImportExtraction:
    if not ex.specialty:
        for i in sorted(ex.items, key=lambda x: x.status != "confirmed"):
            if i.kind == "diagnosis" and i.status in ("confirmed", "suspected"):
                spec = ro_condition(i.label)[1]
                if spec:
                    ex.specialty = spec
                    break
    if ex.category == "other" and pages:
        ex.category = classify("\n".join(pages))  # type: ignore[assignment]
    if not ex.proposed_title or not ex.proposed_title.strip():
        ex.proposed_title = smart_title(ex)
    order = {"diagnosis": 0, "allergy": 1, "medication": 2, "procedure": 3, "investigation": 4, "reason": 5, "symptom": 6,
             "recommendation": 7, "follow_up": 8, "vaccination": 9}
    ex.items.sort(key=lambda i: order.get(i.kind, 10))
    return ex
