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
"""
import hashlib
import re
from datetime import UTC, datetime

from app.schemas.care import TreatmentPlan
from app.schemas.document import MedicalDocument
from app.schemas.patient import PatientRecord
from app.schemas.smart_care import Appointment
from app.services.medical_summary import latest_labs

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
           dose_reports: list[dict] | None = None) -> dict:
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

    if labs is not None:
        for lab in latest_labs(labs):
            res = {"resourceType": "Observation", "id": "obs-" + hashlib.sha1(f"{lab.name}|{lab.unit}".encode()).hexdigest()[:16],
                   "meta": {"source": f"{SYSTEM}:document_lab_values"}, "status": "unknown",
                   "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category",
                                             "code": "laboratory"}]}],
                   "code": {"text": lab.name}, "subject": subject}
            number = _num(lab.value)
            if number is not None:
                res["valueQuantity"] = {"value": number, **({"unit": lab.unit} if lab.unit else {})}
            else:
                res["valueString"] = f"{lab.value} {lab.unit or ''}".strip()
            if lab.reference_range:
                res["referenceRange"] = [{"text": lab.reference_range}]
            if lab.date:
                res["effectiveDateTime"] = lab.date
            entries.append(_entry(res))

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
        entries.append(_entry({
            "resourceType": "DocumentReference", "id": _safe(f"doc-{doc.id}"), "identifier": [_id("document", doc.id)],
            "meta": {"source": f"{SYSTEM}:medical_documents"}, "status": "current", "type": {"text": doc.type},
            "subject": subject, "date": doc.uploaded_at, "description": doc.title,
            "content": [{"attachment": {k: v for k, v in {"contentType": doc.mime_type, "title": doc.title,
                                                          "url": doc.file_url}.items() if v}}]}))

    return {"resourceType": "Bundle", "type": "collection", "timestamp": datetime.now(UTC).isoformat(),
            "entry": entries}
