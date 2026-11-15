"""
FHIR R4 export (Bundle, type "collection") of the data the caller may read. No invented codes:
  • a coding is added only when the source holds one (ICD-10 typed by the patient); otherwise `code.text` only;
  • units are copied as text (no UCUM code is guessed);
  • WWHealth prescriptions → MedicationRequest (intent "order"; treatment instructions → intent "plan"), with a note
    that they are not official CNAS e-prescriptions;
  • medication declared by the patient and the patient's own "taken / skipped" reports → MedicationStatement
    (informationSource = Patient). MedicationAdministration is NEVER produced from those reports;
  • Condition, Observation (confirmed lab values), Procedure (surgeries), Encounter (confirmed appointments),
    DocumentReference (uploaded documents). Every resource keeps its WWHealth identifier and meta.source.
  • facts the patient confirmed from imported documents (Smart Import): Condition (verificationStatus from the
    documented certainty — a suspicion stays "provisional"), AllergyIntolerance, Procedure, Immunization, Observation,
    and MedicationStatement with status "unknown" (historical, as documented — never "active"); each one points to
    its DocumentReference. Codings are copied only when the source (e.g. an imported FHIR file) had them.
  • demo / synthetic documents and their facts are exported only in demo mode, never with real (Supabase) data.
"""
import hashlib
import re
import uuid
from datetime import UTC, datetime

from app.schemas.care import TreatmentPlan
from app.schemas.document import MedicalDocument
from app.schemas.patient import PatientRecord
from app.schemas.smart_care import Appointment
from app.services import fhir_terminology as terms
from app.services.clinical_rules import lab_status, parse_number, parse_range

SYSTEM = "urn:wwhealth"
CNAS_NOTE = "Recorded in WWHealth. Not an official CNAS electronic prescription."
REQUEST_STATUS = {"UPCOMING": "active", "ACTIVE": "active", "COMPLETED": "completed", "DISCONTINUED": "stopped",
                  "CANCELLED": "cancelled"}


def _id(kind: str, value: str) -> dict:
    return {"system": f"{SYSTEM}:{kind}", "value": value}


def _safe(value: str) -> str:
    """FHIR ids: [A-Za-z0-9-.]{1,64}."""
    return re.sub(r"[^A-Za-z0-9.-]", "-", value)[:64]


def _entry(resource: dict) -> dict:
    return {"fullUrl": f"urn:uuid:{resource['resourceType']}-{resource['id']}", "resource": resource}


def _num(value: str) -> float | None:
    m = re.fullmatch(r"\s*(-?\d+(?:[.,]\d+)?)\s*", value or "")
    return float(m.group(1).replace(",", ".")) if m else None


def bundle(patient_id: str, record: PatientRecord | None, documents: list[MedicalDocument] | None,
           labs: list[dict] | None, plans: list[TreatmentPlan] | None, appointments: list[Appointment] | None,
           dose_reports: list[dict] | None = None, facts: list[dict] | None = None,
           include_demo: bool | None = None) -> dict:
    # Demo / synthetic documents are kept apart from real data: exported only in demo mode (no Supabase).
    if include_demo is None:
        from app.core.config import settings
        include_demo = not settings.supabase_enabled
    pid = _safe(patient_id)
    subject = {"reference": f"Patient/{pid}"}
    entries: list[dict] = []

    patient: dict = {"resourceType": "Patient", "id": pid, "identifier": [_id("patient", patient_id)]}
    if record is not None:
        if record.full_name:
            patient["name"] = [{"text": record.full_name}]
        if record.sex:
            patient["gender"] = {"female": "female", "male": "male", "other": "other"}[record.sex]
        if record.date_of_birth:
            patient["birthDate"] = record.date_of_birth[:10]
    entries.append(_entry(patient))

    if record is not None:
        for a in record.allergies:
            res = {"resourceType": "AllergyIntolerance", "id": _safe(f"al-{a.id}"),
                   "identifier": [_id("allergy", a.id)], "meta": {"source": f"{SYSTEM}:medical_profile"},
                   "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                                                  "code": "active"}]},
                   "code": {"text": a.substance}, "patient": subject, "asserter": subject}
            if a.reaction:
                res["reaction"] = [{"manifestation": [{"text": a.reaction}], "severity": a.severity}]
            entries.append(_entry(res))
        for d in record.diagnoses:
            code: dict = {"text": d.name}
            if d.icd10:
                code["coding"] = [{"system": "http://hl7.org/fhir/sid/icd-10", "code": d.icd10}]
            entries.append(_entry({
                "resourceType": "Condition", "id": _safe(f"cond-{d.id}"), "identifier": [_id("condition", d.id)],
                "meta": {"source": f"{SYSTEM}:medical_profile"},
                "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                                               "code": d.status}]},
                "code": code, "subject": subject, "onsetDateTime": d.diagnosed_at[:10], "asserter": subject}))
        for s in record.surgeries:
            res = {"resourceType": "Procedure", "id": _safe(f"proc-{s.id}"), "identifier": [_id("surgery", s.id)],
                   "meta": {"source": f"{SYSTEM}:medical_profile"}, "status": "completed",
                   "code": {"text": s.name}, "subject": subject, "asserter": subject}
            if s.date:
                res["performedDateTime"] = s.date
            if s.notes:
                res["note"] = [{"text": s.notes}]
            entries.append(_entry(res))
        for t in record.treatments:
            res = {"resourceType": "MedicationStatement", "id": _safe(f"ms-{t.id}"),
                   "identifier": [_id("declared-medication", t.id)], "meta": {"source": f"{SYSTEM}:medical_profile"},
                   "status": "active" if t.active else "stopped", "medicationCodeableConcept": {"text": t.name},
                   "subject": subject, "informationSource": subject,
                   "effectivePeriod": {k: v for k, v in {"start": t.start_date[:10], "end": (t.end_date or "")[:10]}.items() if v}}
            dosage = " ".join(x for x in (t.dosage, t.frequency) if x)
            if dosage:
                res["dosage"] = [{"text": dosage}]
            entries.append(_entry(res))

    for p in plans or []:
        v = p.current
        dosage: dict = {"text": " · ".join(x for x in (v.frequency_text, v.instructions) if x) or v.medication_name}
        repeat: dict = {"boundsPeriod": {k: val for k, val in {"start": v.start_date, "end": v.end_date}.items() if val}}
        if v.schedule_type == "fixed_times":
            repeat["timeOfDay"] = [f"{t}:00" for t in v.times_of_day]
        dosage["timing"] = {"repeat": repeat}
        if v.schedule_type == "as_needed":
            dosage["asNeededBoolean"] = True
        if v.route:
            dosage["route"] = {"text": v.route}
        if v.dose_amount is not None:
            quantity: dict = {"value": v.dose_amount}
            if v.dose_unit:
                quantity["unit"] = v.dose_unit
            dosage["doseAndRate"] = [{"doseQuantity": quantity}]
        medication = {"text": " ".join(x for x in (v.medication_name, v.strength, v.dosage_form) if x)}
        res = {"resourceType": "MedicationRequest", "id": _safe(f"mr-{p.id}"),
               "identifier": [_id("treatment-plan", p.id), *[i for i in getattr(p, "external_ids", []) if isinstance(i, dict)]],
               "meta": {"source": f"{SYSTEM}:treatment_plans", "versionId": str(v.version)},
               "status": REQUEST_STATUS[p.status], "intent": "order" if p.kind == "prescription" else "plan",
               "medicationCodeableConcept": medication, "subject": subject, "authoredOn": p.issued_at,
               "dosageInstruction": [dosage], "note": [{"text": CNAS_NOTE}]}
        if p.prescriber_name:
            res["requester"] = {"display": p.prescriber_name}
        if v.active_substance:
            res["note"].append({"text": f"Active substance: {v.active_substance}"})
        if p.appointment_id:
            res["encounter"] = {"reference": f"Encounter/{_safe('enc-' + p.appointment_id)}"}
        entries.append(_entry(res))

    for r in dose_reports or []:
        entries.append(_entry({
            "resourceType": "MedicationStatement", "id": _safe(f"dose-{r['plan_id'][:20]}-{r['scheduled_for'][:16]}"),
            "meta": {"source": f"{SYSTEM}:medication_dose_log"},
            "status": "completed" if r["status"] == "taken" else "not-taken",
            "basedOn": [{"reference": f"MedicationRequest/{_safe('mr-' + r['plan_id'])}"}],
            "medicationCodeableConcept": {"text": r.get("medication_name") or ""}, "subject": subject,
            "informationSource": subject, "effectiveDateTime": r["scheduled_for"],
            "note": [{"text": "Reported by the patient in WWHealth (not a clinical administration)."}]}))

    exported_docs = {d.id for d in documents or [] if include_demo or not d.is_demo}
    if labs is not None:
        entries.extend(lab_entries(labs, subject, exported_docs, {d.id: d for d in documents or []}))

    for a in appointments or []:
        if a.status != "confirmed":
            continue
        past = a.ends_at < datetime.now(UTC).isoformat()
        res = {"resourceType": "Encounter", "id": _safe(f"enc-{a.id}"), "identifier": [_id("appointment", a.id)],
               "meta": {"source": f"{SYSTEM}:appointments"}, "status": "unknown" if past else "planned",
               "class": {"system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "AMB"},
               "subject": subject, "period": {"start": a.starts_at, "end": a.ends_at}}
        if a.doctor_name:
            res["participant"] = [{"individual": {"display": a.doctor_name}}]
        if a.specialty_name:
            res["serviceType"] = {"text": a.specialty_name}
        entries.append(_entry(res))

    for doc in documents or []:
        if doc.is_demo and not include_demo:
            continue
        entries.append(_entry({
            "resourceType": "DocumentReference", "id": _safe(f"doc-{doc.id}"), "identifier": [_id("document", doc.id)],
            "meta": {"source": f"{SYSTEM}:medical_documents"}, "status": "current", "type": {"text": doc.type},
            "subject": subject, "date": doc.uploaded_at, "description": doc.title,
            "content": [{"attachment": {k: v for k, v in {"contentType": doc.mime_type, "title": doc.title,
                                                          "url": doc.file_url}.items() if v}}]}))

    entries.extend(_fact_entries([f for f in facts or [] if include_demo or not f.get("is_demo")], subject, exported_docs))
    return finalize({"resourceType": "Bundle", "type": "collection", "timestamp": datetime.now(UTC).isoformat(),
                     "entry": entries})


VERIFICATION = {"confirmed": "confirmed", "suspected": "provisional", "ruled_out": "refuted", "history": "confirmed"}
MED_CONTEXT_TEXT = {"at_discharge": "at discharge", "during_stay": "during the hospital stay", "prior": "before admission",
                    "prescribed": "prescribed", "unknown": "context not stated"}


def _fact_entries(facts: list[dict], subject: dict, exported_docs: set[str]) -> list[dict]:
    out = []
    for f in facts:
        doc_id = str(f["document_id"])
        doc_ref = {"reference": f"DocumentReference/{_safe('doc-' + doc_id)}"} if doc_id in exported_docs else None
        meta = {"source": f"{SYSTEM}:document_facts"}
        ident = [_id("document-fact", str(f["id"]))]
        code: dict = {"text": f["label"]}
        coding = (f.get("value") or {}).get("coding")
        if isinstance(coding, list) and coding:
            code["coding"] = [c for c in coding if isinstance(c, dict)][:5]
        when = str(f["event_date"])[:10] if f.get("event_date") else None
        note = [{"text": f"Confirmed by the patient from an imported document ({f.get('document_title') or doc_id})."}]
        kind, status = f["kind"], f.get("status")
        rid = _safe(f"fact-{f['id']}")
        if kind == "diagnosis":
            res = {"resourceType": "Condition", "id": rid, "identifier": ident, "meta": meta, "code": code,
                   "subject": subject, "verificationStatus": {"coding": [{
                       "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                       "code": VERIFICATION.get(status or "", "unconfirmed")}]}, "note": note}
            if status == "history":
                res["note"].append({"text": "Documented as past medical history."})
            if when:
                res["recordedDate"] = when
            if doc_ref:
                res["evidence"] = [{"detail": [doc_ref]}]
        elif kind == "allergy":
            res = {"resourceType": "AllergyIntolerance", "id": rid, "identifier": ident, "meta": meta, "code": code,
                   "patient": subject, "note": note}
            if f.get("detail"):
                res["reaction"] = [{"manifestation": [{"text": f["detail"]}]}]
        elif kind == "medication":
            res = {"resourceType": "MedicationStatement", "id": rid, "identifier": ident, "meta": meta,
                   "status": "unknown", "medicationCodeableConcept": code, "subject": subject,
                   "note": [*note, {"text": f"Historical: documented {MED_CONTEXT_TEXT.get(status or 'unknown', '')}; "
                                            "not verified as current medication."}]}
            if when:
                res["effectiveDateTime"] = when
            if f.get("detail"):
                res["dosage"] = [{"text": f["detail"]}]
            if doc_ref:
                res["derivedFrom"] = [doc_ref]
        elif kind == "procedure":
            res = {"resourceType": "Procedure", "id": rid, "identifier": ident, "meta": meta, "status": "completed",
                   "code": code, "subject": subject, "note": note}
            if when:
                res["performedDateTime"] = when
            if doc_ref:
                res["report"] = [doc_ref]
        elif kind == "vaccination":
            res = {"resourceType": "Immunization", "id": rid, "identifier": ident, "meta": meta, "status": "completed",
                   "vaccineCode": code, "patient": subject, "note": note,
                   **({"occurrenceDateTime": when} if when else {"occurrenceString": "as documented"})}
        elif kind == "investigation":
            res = {"resourceType": "Observation", "id": rid, "identifier": ident, "meta": meta, "status": "unknown",
                   "code": code, "subject": subject, "note": note}
            if f.get("detail"):
                res["valueString"] = f["detail"]
            if when:
                res["effectiveDateTime"] = when
            if doc_ref:
                res["derivedFrom"] = [doc_ref]
        else:
            continue  # recommendations / follow-ups / reasons stay in the document
        out.append(_entry(res))
    return out


# ─────────────────────────────────────────────────────────── lab history → Observation + DiagnosticReport

INTERPRETATION = {"high": ("H", "High"), "low": ("L", "Low"), "normal": ("N", "Normal")}
V2_0074 = "http://terminology.hl7.org/CodeSystem/v2-0074"


def _quantity(value: float, unit: str | None) -> dict:
    q: dict = {"value": value}
    if unit:
        q["unit"] = unit
        code = terms.ucum(unit)
        if code:
            q.update(system=terms.UCUM_SYSTEM, code=code)
    return q


def observation(row: dict, subject: dict, doc_ref: dict | None, index: int) -> dict:
    """One CONFIRMED lab value (the patient reviewed it) → Observation, status final. No unit conversion."""
    name, value, unit = str(row["name"]), str(row["value"]), row.get("unit") or None
    when = row.get("measured_at") or None
    key = "|".join(str(x) for x in (row.get("document_id"), name, unit, value, when, index))
    code: dict = {"text": name}
    coding = terms.loinc(name, unit)
    if coding:
        code["coding"] = [coding]
    res: dict = {"resourceType": "Observation", "id": "obs-" + hashlib.sha1(key.encode()).hexdigest()[:20],
                 "meta": {"source": f"{SYSTEM}:document_lab_values"}, "status": "final",
                 "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category",
                                           "code": "laboratory", "display": "Laboratory"}]}],
                 "code": code, "subject": subject}
    number = parse_number(value)
    if number is not None and not value.strip().startswith(("<", ">", "≤", "≥")):
        res["valueQuantity"] = _quantity(number, unit)
    else:
        res["valueString"] = f"{value} {unit or ''}".strip()
    rng = row.get("reference_range")
    if rng:
        ref: dict = {"text": str(rng)}
        bounds = parse_range(rng)
        if bounds:
            if bounds[0] is not None:
                ref["low"] = _quantity(bounds[0], unit)
            if bounds[1] is not None:
                ref["high"] = _quantity(bounds[1], unit)
        res["referenceRange"] = [ref]
        status = lab_status(value, rng)
        if status in INTERPRETATION:
            c, d = INTERPRETATION[status]
            res["interpretation"] = [{"coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", "code": c, "display": d}]}]
    if when:
        res["effectiveDateTime"] = str(when)[:10]
    elif row.get("document_date"):
        res["effectiveDateTime"] = str(row["document_date"])[:10]
        res["note"] = [{"text": "Measurement date not stated; the document date is used."}]
    if doc_ref:
        res["derivedFrom"] = [doc_ref]
    return res


def lab_entries(labs: list[dict], subject: dict, exported_docs: set[str], docs: dict) -> list[dict]:
    """Full history (every confirmed value), grouped per source document in a DiagnosticReport."""
    out: list[dict] = []
    by_doc: dict[str, list[dict]] = {}
    for index, row in enumerate(labs):
        if not row.get("name") or row.get("value") in (None, ""):
            continue
        doc_id = str(row.get("document_id") or "")
        doc_ref = {"reference": f"DocumentReference/{_safe('doc-' + doc_id)}"} if doc_id in exported_docs else None
        obs = observation(row, subject, doc_ref, index)
        out.append(_entry(obs))
        by_doc.setdefault(doc_id, []).append(obs)
    for doc_id, observations in by_doc.items():
        if not doc_id:
            continue
        dates = sorted(o["effectiveDateTime"] for o in observations if o.get("effectiveDateTime"))
        doc = docs.get(doc_id)
        title = (doc.title if doc else None) or next((r.get("document_title") for r in labs
                                                      if str(r.get("document_id")) == doc_id and r.get("document_title")), None)
        report: dict = {
            "resourceType": "DiagnosticReport", "id": _safe(f"dr-{doc_id}"), "identifier": [_id("document", doc_id)],
            "meta": {"source": f"{SYSTEM}:document_lab_values"}, "status": "final",
            "category": [{"coding": [{"system": V2_0074, "code": "LAB", "display": "Laboratory"}]}],
            "code": {"coding": [{"system": terms.LOINC_SYSTEM, "code": "11502-2", "display": "Laboratory report"}],
                     "text": title or "Laboratory report"},
            "subject": subject, "result": [{"reference": f"Observation/{o['id']}"} for o in observations],
        }
        if dates:
            report["effectivePeriod" if dates[0] != dates[-1] else "effectiveDateTime"] = (
                {"start": dates[0], "end": dates[-1]} if dates[0] != dates[-1] else dates[0])
        if doc_id in exported_docs and doc and doc.file_url:
            report["presentedForm"] = [{k: v for k, v in {"contentType": doc.mime_type, "title": doc.title,
                                                         "url": doc.file_url}.items() if v}]
        out.append(_entry(report))
    return out


# ─────────────────────────────────────────────────────────── references + validation

def _uuid_for(key: str) -> str:
    return "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, f"{SYSTEM}:{key}"))


def finalize(bundle: dict) -> dict:
    """fullUrl = urn:uuid (stable), and every in-bundle reference "Type/id" rewritten to it so it resolves in the Bundle.
    References to resources not in the Bundle stay as they are."""
    mapping = {}
    for e in bundle.get("entry", []):
        r = e["resource"]
        key = f"{r['resourceType']}/{r['id']}"
        mapping[key] = _uuid_for(key)
        e["fullUrl"] = mapping[key]

    def walk(node):
        if isinstance(node, dict):
            ref = node.get("reference")
            if isinstance(ref, str) and ref in mapping:
                node["reference"] = mapping[ref]
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    for e in bundle.get("entry", []):
        walk(e["resource"])
    return bundle


# Required bindings (R4) for the codes WWHealth emits — the models check structure/types, this checks the values.
REQUIRED_CODES: dict[str, dict[str, set[str]]] = {
    "Observation": {"status": {"registered", "preliminary", "final", "amended", "corrected", "cancelled", "entered-in-error", "unknown"}},
    "DiagnosticReport": {"status": {"registered", "partial", "preliminary", "final", "amended", "corrected", "appended",
                                    "cancelled", "entered-in-error", "unknown"}},
    "MedicationStatement": {"status": {"active", "completed", "entered-in-error", "intended", "stopped", "on-hold",
                                       "unknown", "not-taken"}},
    "MedicationRequest": {"status": {"active", "on-hold", "cancelled", "completed", "entered-in-error", "stopped", "draft",
                                     "unknown"},
                          "intent": {"proposal", "plan", "order", "original-order", "reflex-order", "filler-order",
                                     "instance-order", "option"}},
    "Procedure": {"status": {"preparation", "in-progress", "not-done", "on-hold", "stopped", "completed",
                             "entered-in-error", "unknown"}},
    "DocumentReference": {"status": {"current", "superseded", "entered-in-error"}},
    "Composition": {"status": {"preliminary", "final", "amended", "entered-in-error"}},
    "Encounter": {"status": {"planned", "arrived", "triaged", "in-progress", "onleave", "finished", "cancelled",
                             "entered-in-error", "unknown"}},
    "Immunization": {"status": {"completed", "entered-in-error", "not-done"}},
}
CODED_STATUS = {  # CodeableConcept statuses with a required value set
    ("Condition", "clinicalStatus"): {"active", "recurrence", "relapse", "inactive", "remission", "resolved"},
    ("Condition", "verificationStatus"): {"unconfirmed", "provisional", "differential", "confirmed", "refuted", "entered-in-error"},
    ("AllergyIntolerance", "clinicalStatus"): {"active", "inactive", "resolved"},
    ("AllergyIntolerance", "verificationStatus"): {"unconfirmed", "confirmed", "refuted", "entered-in-error"},
}


def _check_codes(res: dict) -> list[str]:
    bad = []
    for field, allowed in REQUIRED_CODES.get(res.get("resourceType", ""), {}).items():
        if field in res and res[field] not in allowed:
            bad.append(field)
    for (rtype, field), allowed in CODED_STATUS.items():
        if res.get("resourceType") == rtype and field in res:
            codes = [c.get("code") for c in (res[field] or {}).get("coding", [])]
            if not codes or any(c not in allowed for c in codes):
                bad.append(field)
    return bad


class FhirValidationError(Exception):
    def __init__(self, errors: list[str]):
        super().__init__(f"{len(errors)} FHIR validation error(s)")
        self.errors = errors


def validate(bundle: dict) -> dict:
    """Validates the Bundle and every resource against the FHIR R4B models of `fhir.resources` (R4-compatible for the
    resources used here), plus: unique fullUrls, in-bundle references resolve, document bundles start with a Composition.
    Raises FhirValidationError (messages without patient data)."""
    from fhir.resources.R4B import get_fhir_model_class
    from pydantic import ValidationError

    errors: list[str] = []
    entries = bundle.get("entry") or []
    urls = [e.get("fullUrl") for e in entries]
    if len(urls) != len(set(urls)):
        errors.append("duplicate fullUrl")
    known = set(urls)
    for i, e in enumerate(entries):
        res = e.get("resource") or {}
        try:
            get_fhir_model_class(res.get("resourceType", "")).model_validate(res)
        except (ValidationError, KeyError, ValueError) as exc:
            locs = sorted({".".join(str(x) for x in err.get("loc", ())) for err in getattr(exc, "errors", lambda: [])()})[:5]
            errors.append(f"entry[{i}] {res.get('resourceType')}: invalid {', '.join(locs) or type(exc).__name__}")
        bad = _check_codes(res)
        if bad:
            errors.append(f"entry[{i}] {res.get('resourceType')}: code not allowed in {', '.join(bad)}")

        def walk(node):
            if isinstance(node, dict):
                ref = node.get("reference")
                if isinstance(ref, str) and ref.startswith("urn:uuid:") and ref not in known:
                    errors.append(f"entry[{i}] unresolved reference")
                for v in node.values():
                    walk(v)
            elif isinstance(node, list):
                for v in node:
                    walk(v)
        walk(res)
    if bundle.get("type") == "document" and (not entries or entries[0]["resource"].get("resourceType") != "Composition"):
        errors.append("document bundle must start with a Composition")
    try:
        get_fhir_model_class("Bundle").model_validate(bundle)
    except Exception as exc:  # noqa: BLE001 — reported as a validation error
        errors.append(f"Bundle: {type(exc).__name__}")
    if errors:
        raise FhirValidationError(errors)
    return bundle
