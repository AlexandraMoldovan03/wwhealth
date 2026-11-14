"""
Universal Smart Import — step 1: detect the format and parse it LOCALLY (no AI here).

  • PDF with a text layer → text per page (pypdf, existing lab_extraction pipeline)
  • scanned PDF / JPEG / PNG → existing OCR (lab_extraction.ocr_image / pdf_page_images) — not rebuilt
  • FHIR R4 JSON (Bundle or single resource) / NDJSON → validated, then mapped directly to structured items
    (codings kept); no AI call
  • CSV → parsed locally with an automatic or user-provided column mapping (lab results)

The file type is decided from the content, never from the client's Content-Type or file name alone.
"""
import csv
import hashlib
import io
import json
import re
from dataclasses import dataclass, field
from datetime import date

from app.schemas.smart_import import ExtractedItem, ExtractedLab, ImportExtraction, SourceRef
from app.services import lab_extraction


class ImportFormatError(ValueError):
    """`code` is safe to show (translated in the app)."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class ParsedDocument:
    source_format: str                     # pdf_text / pdf_scanned / image / fhir_json / fhir_ndjson / csv
    mime_type: str                         # stored mime type of the original
    pages: list[str] = field(default_factory=list)
    page_count: int = 1
    structured: ImportExtraction | None = None   # FHIR / CSV: already structured locally
    identity: dict = field(default_factory=dict)  # identifiers written in the document (name / birth_date / sex)


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def fingerprint(*parts: object) -> str:
    raw = "|".join(_fold(str(p)) for p in parts if p not in (None, ""))
    return hashlib.sha1(raw.encode()).hexdigest()[:20]


def _fold(text: str) -> str:
    import unicodedata
    stripped = "".join(c for c in unicodedata.normalize("NFD", text or "") if unicodedata.category(c) != "Mn")
    return " ".join(stripped.lower().split())


# ─────────────────────────────────────────────────────────── detection

def detect(content: bytes, filename: str = "") -> str:
    if content.startswith(b"%PDF-"):
        return "pdf"
    if content.startswith(b"\xff\xd8\xff") or content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image"
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ImportFormatError("unsupported_format") from exc
    stripped = text.lstrip()
    if stripped.startswith("{") or stripped.startswith("["):
        try:
            json.loads(text)
            return "fhir_json"
        except ValueError:
            lines = [ln for ln in text.splitlines() if ln.strip()]
            if lines and all(ln.lstrip().startswith("{") for ln in lines[:5]):
                return "fhir_ndjson"
            raise ImportFormatError("invalid_json") from None
    if filename.lower().endswith(".ndjson"):
        return "fhir_ndjson"
    first = stripped.splitlines()[0] if stripped else ""
    if filename.lower().endswith((".csv", ".tsv", ".txt")) or any(d in first for d in (",", ";", "\t")):
        return "csv"
    raise ImportFormatError("unsupported_format")


def parse(content: bytes, filename: str = "", csv_mapping: dict | None = None) -> ParsedDocument:
    kind = detect(content, filename)
    if kind == "pdf":
        return _parse_pdf(content)
    if kind == "image":
        mime = "image/jpeg" if content.startswith(b"\xff\xd8\xff") else "image/png"
        return _parse_image(content, mime)
    text = content.decode("utf-8-sig")
    if kind == "fhir_json":
        return parse_fhir(json.loads(text), "fhir_json")
    if kind == "fhir_ndjson":
        resources = []
        for n, line in enumerate(ln for ln in text.splitlines() if ln.strip()):
            try:
                resources.append(json.loads(line))
            except ValueError as exc:
                raise ImportFormatError("invalid_ndjson") from exc
            if n > 5000:
                raise ImportFormatError("too_many_resources")
        return parse_fhir({"resourceType": "Bundle", "type": "collection",
                           "entry": [{"resource": r} for r in resources]}, "fhir_ndjson")
    return parse_csv(text, csv_mapping)


# ─────────────────────────────────────────────────────────── PDF / images (existing OCR)

def _parse_pdf(content: bytes) -> ParsedDocument:
    try:
        pages, count = lab_extraction.extract_pages(content)
    except ValueError as exc:
        raise ImportFormatError("unreadable_pdf") from exc
    if any(p.strip() for p in pages):
        return ParsedDocument("pdf_text", "application/pdf", pages, count)
    if not lab_extraction.ocr_available():
        return ParsedDocument("pdf_scanned", "application/pdf", [], count)
    ocr = [lab_extraction.fix_ocr_units(lab_extraction.ocr_image(img)) for img in lab_extraction.pdf_page_images(content)]
    return ParsedDocument("pdf_scanned", "application/pdf", ocr, count)


def _parse_image(content: bytes, mime: str) -> ParsedDocument:
    text = lab_extraction.fix_ocr_units(lab_extraction.ocr_image(content)) if lab_extraction.ocr_available() else ""
    return ParsedDocument("image", mime, [text] if text.strip() else [], 1)


# ─────────────────────────────────────────────────────────── FHIR R4

FHIR_TYPES = {"Bundle", "Patient", "Condition", "Observation", "AllergyIntolerance", "MedicationStatement",
              "MedicationRequest", "Procedure", "Immunization", "Encounter", "DiagnosticReport", "DocumentReference",
              "Practitioner", "Organization", "Composition", "CarePlan", "Medication"}
MAX_RESOURCES = 2000


def _concept_text(concept: object) -> str | None:
    if not isinstance(concept, dict):
        return None
    if isinstance(concept.get("text"), str) and concept["text"].strip():
        return concept["text"].strip()
    for c in concept.get("coding") or []:
        if isinstance(c, dict) and (c.get("display") or c.get("code")):
            return str(c.get("display") or c.get("code")).strip()
    return None


def _codings(concept: object) -> list[dict]:
    if not isinstance(concept, dict):
        return []
    return [{k: c[k] for k in ("system", "code", "display") if isinstance(c.get(k), str)}
            for c in concept.get("coding") or [] if isinstance(c, dict)][:5]


def _status_code(concept: object) -> str | None:
    if isinstance(concept, dict):
        for c in concept.get("coding") or []:
            if isinstance(c, dict) and isinstance(c.get("code"), str):
                return c["code"]
    return None


def _date(value: object) -> str | None:
    if not isinstance(value, str) or len(value) < 10:
        return None
    try:
        d = date.fromisoformat(value[:10])
    except ValueError:
        return None
    return d.isoformat() if date(1900, 1, 1) <= d <= date.today() else None


def _first_date(res: dict, *keys: str) -> str | None:
    for k in keys:
        v = res.get(k)
        if isinstance(v, dict):
            v = v.get("start") or v.get("end")
        d = _date(v)
        if d:
            return d
    return None


def _clip(text: str | None, n: int) -> str | None:
    if text is None:
        return None
    text = " ".join(str(text).split())
    return text[:n] if text else None


def _validate_fhir(obj: object) -> list[dict]:
    if not isinstance(obj, dict) or not isinstance(obj.get("resourceType"), str):
        raise ImportFormatError("fhir_missing_resource_type")
    if obj["resourceType"] == "Bundle":
        entries = obj.get("entry")
        if entries is None:
            entries = []
        if not isinstance(entries, list):
            raise ImportFormatError("fhir_invalid_bundle")
        resources = []
        for e in entries:
            r = e.get("resource") if isinstance(e, dict) else None
            if not isinstance(r, dict) or not isinstance(r.get("resourceType"), str):
                raise ImportFormatError("fhir_invalid_entry")
            resources.append(r)
    else:
        resources = [obj]
    if not resources:
        raise ImportFormatError("fhir_empty")
    if len(resources) > MAX_RESOURCES:
        raise ImportFormatError("too_many_resources")
    if not any(r["resourceType"] in FHIR_TYPES for r in resources):
        raise ImportFormatError("fhir_unsupported_resources")
    return resources


def parse_fhir(obj: object, source_format: str) -> ParsedDocument:
    resources = _validate_fhir(obj)
    items: list[ExtractedItem] = []
    labs: list[ExtractedLab] = []
    identity: dict = {}
    to_verify: list[str] = []
    dates: list[str] = []
    patients: set[str] = set()

    def add(kind: str, label: str | None, res: dict, *, status: str | None = None, detail: str | None = None,
            when: str | None = None, value: dict | None = None):
        label = _clip(label, 200)
        if not label:
            return
        if when:
            dates.append(when)
        ref = f"{res['resourceType']}/{res.get('id')}" if res.get("id") else res["resourceType"]
        items.append(ExtractedItem(
            key=fingerprint(kind, label, when, status), kind=kind, label=label, detail=_clip(detail, 400),
            status=status, date=when, value=value or {}, source=SourceRef(excerpt=_clip(ref, 300), verified=True)))

    for r in resources:
        t = r["resourceType"]
        if t == "Patient":
            names = r.get("name") or []
            n = names[0] if names and isinstance(names[0], dict) else {}
            full = n.get("text") or " ".join([*(n.get("given") or []), n.get("family") or ""]).strip()
            patients.add(_fold(full) or str(r.get("id")))
            identity = {"name": full or None, "birth_date": _date(r.get("birthDate")),
                        "sex": r.get("gender") if r.get("gender") in ("female", "male") else None}
        elif t == "Condition":
            verification = _status_code(r.get("verificationStatus"))
            clinical = _status_code(r.get("clinicalStatus"))
            certainty = ("ruled_out" if verification in ("refuted", "entered-in-error")
                         else "suspected" if verification in ("provisional", "differential", "unconfirmed")
                         else "history" if clinical in ("inactive", "resolved", "remission")
                         else "confirmed")
            add("diagnosis", _concept_text(r.get("code")), r, status=certainty,
                when=_first_date(r, "onsetDateTime", "recordedDate", "onsetPeriod"),
                value={"coding": _codings(r.get("code")), "clinicalStatus": clinical, "verificationStatus": verification})
        elif t == "Observation":
            name = _concept_text(r.get("code"))
            q = r.get("valueQuantity")
            when = _first_date(r, "effectiveDateTime", "issued", "effectivePeriod")
            if name and isinstance(q, dict) and q.get("value") is not None:
                rr = (r.get("referenceRange") or [{}])[0] if isinstance(r.get("referenceRange"), list) else {}
                low, high = (rr.get("low") or {}).get("value"), (rr.get("high") or {}).get("value")
                ref = rr.get("text") or (f"{low}-{high}" if low is not None and high is not None else None)
                value = str(q["value"])[:20]
                labs.append(ExtractedLab(key=fingerprint("lab", name, value, when), name=name[:80], value=value,
                                         unit=_clip(q.get("unit") or q.get("code"), 20), reference_range=_clip(ref, 40),
                                         measured_at=when,
                                         source=SourceRef(excerpt=_clip(f"Observation/{r.get('id', '')}", 300), verified=True)))
                if when:
                    dates.append(when)
            elif name:
                text = r.get("valueString") or _concept_text(r.get("valueCodeableConcept"))
                add("investigation", name, r, detail=text, when=when, value={"coding": _codings(r.get("code"))})
        elif t == "AllergyIntolerance":
            reaction = None
            for rx in r.get("reaction") or []:
                for m in (rx.get("manifestation") or []) if isinstance(rx, dict) else []:
                    reaction = reaction or _concept_text(m)
            add("allergy", _concept_text(r.get("code")), r, detail=reaction,
                status=_status_code(r.get("verificationStatus")), when=_first_date(r, "recordedDate", "onsetDateTime"),
                value={"coding": _codings(r.get("code")), "criticality": r.get("criticality")})
        elif t in ("MedicationStatement", "MedicationRequest"):
            name = _concept_text(r.get("medicationCodeableConcept")) or _concept_text((r.get("medication") or {}).get("concept"))
            dosage = r.get("dosage") or r.get("dosageInstruction") or []
            dose_text = dosage[0].get("text") if dosage and isinstance(dosage[0], dict) else None
            # Documented status is kept for information only — imported medication is never "active today".
            add("medication", name, r, status="prescribed" if t == "MedicationRequest" else "prior", detail=dose_text,
                when=_first_date(r, "effectiveDateTime", "authoredOn", "effectivePeriod", "dateAsserted"),
                value={"coding": _codings(r.get("medicationCodeableConcept")), "documentedStatus": r.get("status")})
        elif t == "Procedure":
            add("procedure", _concept_text(r.get("code")), r,
                when=_first_date(r, "performedDateTime", "performedPeriod", "occurrenceDateTime"),
                value={"coding": _codings(r.get("code")), "documentedStatus": r.get("status")})
        elif t == "Immunization":
            add("vaccination", _concept_text(r.get("vaccineCode")), r,
                when=_first_date(r, "occurrenceDateTime", "recorded"), value={"coding": _codings(r.get("vaccineCode"))})
        elif t == "DiagnosticReport":
            add("investigation", _concept_text(r.get("code")), r, detail=r.get("conclusion"),
                when=_first_date(r, "effectiveDateTime", "issued", "effectivePeriod"), value={"coding": _codings(r.get("code"))})
        elif t == "Encounter":
            reason = next((_concept_text(c) for c in r.get("reasonCode") or [] if _concept_text(c)), None)
            if reason:
                add("reason", reason, r, when=_first_date(r, "period"))

    if len(patients) > 1:
        to_verify.append("multiple_patients")
    if not identity:
        to_verify.append("no_patient_identity")
    category = ("lab_result" if labs and not any(i.kind == "diagnosis" for i in items)
                else "vaccination" if items and all(i.kind == "vaccination" for i in items)
                else "other")
    event = max(dates) if dates else None
    extraction = ImportExtraction(
        category=category, proposed_title="", event_date=event, document_date=event, items=items[:300],
        labs=labs[:200], to_verify=to_verify, page_count=1)
    return ParsedDocument(source_format, "application/fhir+json" if source_format == "fhir_json" else "application/x-ndjson",
                          [], 1, extraction, identity)


# ─────────────────────────────────────────────────────────── CSV (lab results)

CSV_FIELDS = ("name", "value", "unit", "reference_range", "date")
CSV_SYNONYMS = {
    "name": ("analiza", "analize", "test", "parametru", "parameter", "name", "denumire", "investigatie", "analyte"),
    "value": ("valoare", "value", "rezultat", "result"),
    "unit": ("unitate", "unit", "um", "u.m.", "units"),
    "reference_range": ("interval", "referinta", "reference", "range", "valori normale", "normal", "ref"),
    "date": ("data", "date", "data recoltarii", "recoltat", "collected"),
}
MAX_CSV_ROWS = 1000


def auto_mapping(header: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    folded = [(_fold(h), h) for h in header]
    for f in CSV_FIELDS:
        for syn in CSV_SYNONYMS[f]:
            hit = next((orig for fh, orig in folded if fh == syn or fh.startswith(syn)), None)
            if hit and hit not in mapping.values():
                mapping[f] = hit
                break
    return mapping


def _csv_date(value: str) -> str | None:
    value = value.strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", value) or re.match(r"^(\d{1,2})[./](\d{1,2})[./](\d{4})$", value)
    if not m:
        return None
    try:
        y, mo, d = (int(m.group(1)), int(m.group(2)), int(m.group(3))) if len(m.group(1)) == 4 else (
            int(m.group(3)), int(m.group(2)), int(m.group(1)))
        dt = date(y, mo, d)
    except ValueError:
        return None
    return dt.isoformat() if date(1990, 1, 1) <= dt <= date.today() else None


def parse_csv(text: str, mapping: dict | None = None) -> ParsedDocument:
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    rows = list(csv.reader(io.StringIO(text), dialect))
    rows = [r for r in rows if any(c.strip() for c in r)]
    if len(rows) < 2:
        raise ImportFormatError("csv_empty")
    if len(rows) > MAX_CSV_ROWS + 1:
        raise ImportFormatError("csv_too_many_rows")
    header = [h.strip() for h in rows[0]]
    if mapping:
        cols = {f: mapping[f] for f in CSV_FIELDS if isinstance(mapping.get(f), str) and mapping[f] in header}
    else:
        cols = auto_mapping(header)
    if "name" not in cols or "value" not in cols:
        raise ImportFormatError("csv_mapping_required")
    idx = {f: header.index(c) for f, c in cols.items()}
    labs: list[ExtractedLab] = []
    to_verify: list[str] = []
    for line_no, r in enumerate(rows[1:], start=2):
        def cell(f: str) -> str:
            i = idx.get(f)
            return r[i].strip() if i is not None and i < len(r) else ""
        name, value = cell("name")[:80], cell("value")[:20]
        if not name or not value:
            continue
        when = _csv_date(cell("date")) if "date" in idx else None
        if "date" in idx and cell("date") and not when:
            to_verify.append("csv_invalid_date")
        labs.append(ExtractedLab(
            key=fingerprint("lab", name, value, when), name=name, value=value, unit=cell("unit")[:20] or None,
            reference_range=cell("reference_range")[:40] or None, measured_at=when,
            source=SourceRef(excerpt=f"CSV line {line_no}", verified=True)))
    if not labs:
        raise ImportFormatError("csv_empty")
    dates = [lab.measured_at for lab in labs if lab.measured_at]
    extraction = ImportExtraction(category="lab_result", event_date=max(dates) if dates else None,
                                  document_date=max(dates) if dates else None, labs=labs[:200],
                                  to_verify=sorted(set(to_verify)) + ([] if dates else ["no_date"]))
    return ParsedDocument("csv", "text/csv", [], 1, extraction, {})
