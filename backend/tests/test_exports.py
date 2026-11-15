"""FHIR R4 / IPS-inspired summary / CSV / PDF / ZIP exports: validity, consent, no unconfirmed diagnoses."""
import csv
import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.doctor_access import GrantRequest
from app.services import doctor_access_service, export_service, fhir_service, fhir_terminology, lab_extraction, patient_service
from app.services.demo_data import DEMO_PATIENT_ID, demo_patient
from app.core.security import CurrentUser

client = TestClient(app)
API = "/api/v1/care"
PATIENT = CurrentUser(id=DEMO_PATIENT_ID, role="patient")
LABS = [
    {"name": "Potasiu", "value": "6.8", "unit": "mmol/L", "reference_range": "3.5-5.1", "measured_at": "2025-03-01"},
    {"name": "Potasiu", "value": "4.2", "unit": "mmol/L", "reference_range": "3.5-5.1", "measured_at": "2024-01-10"},
    {"name": "Colesterol", "value": "180", "unit": "mg/dL", "reference_range": "< 200", "measured_at": "2025-03-01"},
    {"name": "=HYPERLINK(\"x\")", "value": "1", "unit": "", "reference_range": None, "measured_at": None},
]


@pytest.fixture(autouse=True)
def demo(monkeypatch):
    doctor_access_service.reset_demo()
    record = demo_patient()
    monkeypatch.setitem(patient_service._patients, DEMO_PATIENT_ID, record)
    doc_id = record.documents[0].id
    monkeypatch.setattr(lab_extraction, "_demo_values", {(DEMO_PATIENT_ID, doc_id): [dict(v) for v in LABS]})
    yield
    doctor_access_service.reset_demo()


def grant(scopes):
    doctor_access_service.grant(PATIENT, GrantRequest(doctor_id="doc_demo_001", scopes=list(scopes), duration_hours=24))


def resources(bundle, rtype=None):
    return [e["resource"] for e in bundle["entry"] if rtype is None or e["resource"]["resourceType"] == rtype]


def test_fhir_export_is_valid_r4_with_full_lab_history_and_reports():
    res = client.get(f"{API}/export/fhir")
    assert res.status_code == 200 and res.headers["content-type"].startswith("application/fhir+json")
    assert "attachment" in res.headers["content-disposition"] and res.headers["cache-control"].startswith("no-store")
    bundle = fhir_service.validate(res.json())
    obs = [o for o in resources(bundle, "Observation") if o["code"]["text"] == "Potasiu"]
    assert len(obs) == 2 and {o["status"] for o in obs} == {"final"}  # history, not only the latest value
    critical = next(o for o in obs if o["valueQuantity"]["value"] == 6.8)
    assert critical["code"]["coding"][0]["code"] == "2823-3"  # LOINC only with the matching unit
    assert critical["valueQuantity"]["system"] == "http://unitsofmeasure.org"
    assert critical["referenceRange"][0]["high"]["value"] == 5.1 and critical["interpretation"][0]["coding"][0]["code"] == "H"
    report = resources(bundle, "DiagnosticReport")[0]
    urls = {e["fullUrl"] for e in bundle["entry"]}
    assert report["status"] == "final" and all(r["reference"] in urls for r in report["result"])
    assert critical["derivedFrom"][0]["reference"] in urls  # link to the source DocumentReference


def test_terminology_is_conservative():
    assert fhir_terminology.loinc("Potasiu", "mEq/L") is None  # LOINC term defined for mmol/L only
    assert fhir_terminology.loinc("Glicemie", "mmol/L") is None
    assert fhir_terminology.loinc("Ferritina", "ng/mL") is None
    assert fhir_terminology.ucum("unități ciudate") is None


def test_validator_rejects_invalid_resources():
    bad = fhir_service.finalize({"resourceType": "Bundle", "type": "collection", "entry": [
        {"resource": {"resourceType": "Observation", "id": "a", "status": "nonsense", "code": {"text": "x"}}},
        {"resource": {"resourceType": "Observation", "id": "b", "status": "final"}},  # missing code
    ]})
    with pytest.raises(fhir_service.FhirValidationError) as err:
        fhir_service.validate(bad)
    assert len(err.value.errors) >= 2


def test_emergency_summary_document_excludes_unconfirmed_and_suspected():
    facts = [{"id": "f1", "document_id": "d1", "kind": "diagnosis", "label": "Neoplasm pulmonar", "status": "suspected"},
             {"id": "f2", "document_id": "d1", "kind": "diagnosis", "label": "Insuficiență cardiacă", "status": "confirmed"}]
    record = demo_patient()
    bundle = export_service.emergency_summary(DEMO_PATIENT_ID, record, LABS, facts)
    comp = bundle["entry"][0]["resource"]
    assert bundle["type"] == "document" and comp["resourceType"] == "Composition"
    assert comp["type"]["coding"][0]["code"] == "60591-5" and "not validated against the IPS profile" in comp["title"]
    labels = {r.get("code", {}).get("text") for r in resources(bundle, "Condition")}
    assert "Neoplasm pulmonar" not in labels and "Insuficiență cardiacă" not in labels  # suspected / not in profile
    assert "not included" in comp["text"]["div"]
    obs = {r["code"].get("text") for r in resources(bundle, "Observation")}
    assert "Potasiu" in obs and "Colesterol" not in obs  # critical result yes, normal result no


def test_emergency_summary_with_no_allergies_says_unknown():
    record = demo_patient().model_copy(update={"allergies": []})
    bundle = export_service.emergency_summary("p1", record, [], [])
    allergies = next(s for s in bundle["entry"][0]["resource"]["section"] if s["code"]["coding"][0]["code"] == "48765-2")
    assert allergies["emptyReason"]["coding"][0]["code"] == "unavailable" and "unknown" in allergies["text"]["div"]


def test_csv_history_is_complete_and_injection_safe():
    text = client.get(f"{API}/export/labs.csv").content.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    assert rows[0] == export_service.CSV_HEADER and len(rows) == 1 + len(LABS)
    pot = [r for r in rows if r[0] == "Potasiu"]
    assert [r[1] for r in pot] == ["4.2", "6.8"] and pot[1][4] == "H" and pot[1][2] == "mmol/L" and pot[1][3] == "3.5-5.1"
    assert any(r[0].startswith("'=") for r in rows)  # formula neutralised
    assert export_service._cell("-5.2") == "-5.2"


def test_pdf_and_zip():
    pdf = client.get(f"{API}/export/summary.pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    z = client.get(f"{API}/export/archive.zip")
    assert z.status_code == 200
    with zipfile.ZipFile(io.BytesIO(z.content)) as zf:
        names = set(zf.namelist())
        assert {"fhir/bundle.json", "fhir/emergency-summary.json", "labs.csv", "summary.pdf", "manifest.json"} <= names
        fhir_service.validate(json.loads(zf.read("fhir/bundle.json")))
        manifest = json.loads(zf.read("manifest.json"))
        assert manifest["fhir_version"] == "4.0.1" and isinstance(manifest["documents_not_included"], list)


def test_doctor_exports_need_consent_and_stay_within_scopes():
    for kind in ("fhir", "emergency-summary", "labs.csv", "summary.pdf", "archive.zip"):
        assert client.get(f"{API}/doctor/patients/{DEMO_PATIENT_ID}/export/{kind}").status_code == 403
    grant(["profile"])
    bundle = client.get(f"{API}/doctor/patients/{DEMO_PATIENT_ID}/export/fhir").json()
    types = {r["resourceType"] for r in resources(bundle)}
    assert "Observation" not in types and "DocumentReference" not in types and "AllergyIntolerance" in types
    text = client.get(f"{API}/doctor/patients/{DEMO_PATIENT_ID}/export/labs.csv").content.decode("utf-8-sig")
    assert text.strip() == ",".join(export_service.CSV_HEADER)  # labs not shared → header only
    with zipfile.ZipFile(io.BytesIO(client.get(f"{API}/doctor/patients/{DEMO_PATIENT_ID}/export/archive.zip").content)) as zf:
        manifest = json.loads(zf.read("manifest.json"))
        assert manifest["documents"] == [] and {"reason": "not_shared"} in manifest["documents_not_included"]
        assert not any(n.startswith("documents/") for n in zf.namelist())


def test_doctor_cannot_export_another_patient():
    grant(["profile", "labs", "documents"])
    assert client.get(f"{API}/doctor/patients/other-patient/export/fhir").status_code == 403
