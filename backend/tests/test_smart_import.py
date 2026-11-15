"""Universal Smart Import + Document Library (demo mode; Gemini always faked — no network)."""
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.smart_import import GeminiDocument
from app.services import (
    document_intelligence as di,
    gemini_client,
    identity_check,
    import_parsers,
    intelligence_service,
    patient_service,
    smart_import_service,
)

client = TestClient(app)
FIX = Path(__file__).parent / "fixtures" / "smart_import"
F_HTA = "004_cardiovascular_arterial-hypertension_11.pdf"
F_FLU = "245_infectious-diseases_influenza_49.pdf"


@pytest.fixture(autouse=True)
def _isolated(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "documents_storage_dir", tmp_path / "documents")
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(settings, "gemini_document_escalation_model", "")
    smart_import_service.reset_demo()
    intelligence_service.reset_demo()
    record = patient_service.get_patient("pat_demo_001")
    docs, history = list(record.documents), list(record.history)
    meds = [t.model_copy() for t in record.treatments]
    yield
    record.documents, record.history, record.treatments = docs, history, meds


class FakeGemini:
    """Replaces gemini_client.generate_structured; counts calls and reports token usage."""

    def __init__(self, answer=None, error=None, by_model=None):
        self.calls: list[str] = []
        self.answer, self.error, self.by_model = answer, error, by_model or {}

    def __call__(self, model, system, contents, label, repair=None, *, model_override=None, usage=None, max_output_tokens=0):
        self.calls.append(model_override)
        assert "=== PAGE 1 ===" in contents and len(contents) <= settings.gemini_document_max_input_chars
        if usage is not None:
            usage.update(prompt_tokens=1200, output_tokens=300)
        outcome = self.by_model.get(model_override, self.error or self.answer)
        if isinstance(outcome, Exception):
            raise outcome
        return model.model_validate(outcome)


def enable_ai(monkeypatch, fake: FakeGemini, consent: bool = True):
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(gemini_client, "generate_structured", fake)
    monkeypatch.setattr(intelligence_service, "get_consent", lambda user: SimpleNamespace(granted=consent))


def upload(name: str | None = None, content: bytes | None = None, filename: str | None = None, mime="application/pdf",
           mapping: dict | None = None):
    content = content if content is not None else (FIX / name).read_bytes()
    data = {"csvMapping": json.dumps(mapping)} if mapping else {}
    return client.post("/api/v1/imports", files={"file": (filename or name or "f", content, mime)}, data=data)


def confirm_body(preview: dict, **over) -> dict:
    ex = preview["extraction"]
    return {"title": ex["proposedTitle"], "category": ex["category"], "specialty": ex["specialty"],
            "eventDate": ex["eventDate"], "institution": ex["institution"], "items": ex["items"], "labs": ex["labs"],
            "identityConfirmed": True, **over}


def kinds(preview: dict, kind: str) -> list[dict]:
    return [i for i in preview["extraction"]["items"] if i["kind"] == kind]


# ─────────────────────────────────────────────────────────── local pipeline on the demo PDFs (no AI)

def test_discharge_classification_title_diagnosis_medication_dates():
    res = upload(F_HTA)
    assert res.status_code == 201, res.text
    p = res.json()
    ex = p["extraction"]
    assert p["sourceFormat"] == "pdf_text" and p["method"] == "local_fallback" and p["fallbackReason"] == "not_configured"
    assert ex["category"] == "discharge_summary" and ex["specialty"] == "cardiology"
    assert ex["proposedTitle"] == "Externare pentru hipertensiune arterială"
    assert ex["eventDate"] == "2023-06-12" and ex["documentDate"] == "2023-06-12"
    dx = {d["label"]: d["status"] for d in kinds(p, "diagnosis")}
    assert dx["Arterial Hypertension"] == "confirmed"
    assert dx["Type 2 Diabetes Mellitus"] == "history"  # past history is never an active / confirmed diagnosis
    meds = {m["label"]: m for m in kinds(p, "medication")}
    assert set(meds) == {"Lisinopril", "Hydrochlorothiazide"}
    assert all(m["status"] == "at_discharge" for m in meds.values())  # historical context, not "active"
    assert "10 mg" in meds["Lisinopril"]["detail"]
    assert all(i["source"]["page"] and i["source"]["excerpt"] and i["source"]["verified"] for i in ex["items"])
    assert p["originalFilename"] == F_HTA and p["status"] == "preview"


@pytest.mark.parametrize("name,category,title,specialty", [
    ("041_cardiovascular_arterial-hypertension_45.pdf", "discharge_summary", "Externare pentru hipertensiune arterială", "cardiology"),
    ("111_endocrinology_type-1-diabetes_18.pdf", "discharge_summary", "Externare pentru diabet zaharat tip 1", "endocrinology"),
    (F_FLU, "discharge_summary", "Externare pentru gripă", "infectious_diseases"),
    ("292_neurology_intracerebral-hemorrhage_46.pdf", "discharge_summary", "Externare pentru hemoragie intracerebrală", "neurology"),
    ("304_neurology_ischemic-stroke_11.pdf", "discharge_summary", "Externare pentru accident vascular cerebral ischemic", "neurology"),
    ("354_traumatology_ankle-fractures_11.pdf", "trauma", "Externare pentru fractură de gleznă", "orthopedics"),
    ("404_traumatology_distal-humeral-fractures_11.pdf", "trauma", "Externare pentru fractură humerală distală", "orthopedics"),
])
def test_demo_pdfs_titles_and_categories(name, category, title, specialty):
    p = upload(name).json()
    ex = p["extraction"]
    assert (ex["category"], ex["proposedTitle"], ex["specialty"]) == (category, title, specialty)
    assert ex["eventDate"] and ex["eventDate"].startswith("2023-")
    assert p["isDemo"] is True and p["identity"]["status"] == "demo"  # synthetic → demo context only


def test_suspected_stays_suspected():
    p = upload("354_traumatology_ankle-fractures_11.pdf").json()
    statuses = {d["label"]: d["status"] for d in kinds(p, "diagnosis")}
    assert any("Maisonneuve" in k and v == "suspected" for k, v in statuses.items())


def test_placeholders_are_flagged_not_used():
    p = upload(F_FLU).json()
    ex = p["extraction"]
    assert "placeholder_values" in ex["toVerify"]
    assert "placeholder_identity" in p["identity"]["reasons"] and p["identity"]["documentName"] is None
    follow = kinds(p, "follow_up")
    assert any(f["date"] == "2023-04-19" for f in follow)  # date inside [..] read, bracket text kept as written


def test_stroke_procedures_and_medication():
    p = upload("304_neurology_ischemic-stroke_11.pdf").json()
    assert {x["label"] for x in kinds(p, "procedure")} == {"MRI Brain", "Echocardiography", "Mechanical Thrombectomy"}
    assert {"Aspirin", "Clopidogrel", "Atorvastatin", "Metformin", "Lisinopril"} <= {m["label"] for m in kinds(p, "medication")}


def test_negated_surgery_is_not_a_procedure():
    p = upload("292_neurology_intracerebral-hemorrhage_46.pdf").json()
    assert kinds(p, "procedure") == []  # "decided against surgical evacuation" must not become a procedure


# ─────────────────────────────────────────────────────────── confirmation, history vs active, idempotency

def test_confirm_integrates_as_historical_never_active():
    before = [t.model_copy() for t in patient_service.get_patient("pat_demo_001").treatments]
    p = upload(F_HTA).json()
    # identity is "demo" → explicit confirmation required
    body = confirm_body(p, identityConfirmed=False)
    assert client.post(f"/api/v1/imports/{p['id']}/confirm", json=body).json()["detail"] == "identity_confirmation_required"
    res = client.post(f"/api/v1/imports/{p['id']}/confirm", json=confirm_body(p, title="Externare HTA iunie 2023"))
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "confirmed"

    # the medical profile / active medication are untouched
    assert patient_service.get_patient("pat_demo_001").treatments == before
    record = client.get("/api/v1/care/record", params={"view": "category"}).json()
    meds = next(s for s in record["sections"] if s["category"] == "medication")["items"]
    imported = [m for m in meds if m["provenance"] == "document_facts"]
    assert {m["title"] for m in imported} == {"Lisinopril", "Hydrochlorothiazide"}
    assert all(m["status"] == "historical" and not m["pinned"] for m in imported)
    conditions = next(s for s in record["sections"] if s["category"] == "conditions")["items"]
    hta = next(c for c in conditions if c["title"] == "Arterial Hypertension")
    assert hta["documentId"] == p["documentId"] and hta["sourceExcerpt"]  # record → document link + source

    # library + document detail (document → record data)
    lib = client.get("/api/v1/library").json()
    doc = next(d for d in lib["documents"] if d["id"] == p["documentId"])
    assert doc["title"] == "Externare HTA iunie 2023" and doc["originalFilename"] == F_HTA
    assert doc["processingStatus"] == "confirmed" and doc["eventDate"] == "2023-06-12"
    detail = client.get(f"/api/v1/library/{p['documentId']}").json()
    assert detail["importId"] == p["id"] and len(detail["facts"]) >= 4

    # timeline uses the event date of the document
    history = client.get("/api/v1/patients/me").json()["history"]
    assert any(e.get("documentId") == p["documentId"] and e["date"].startswith("2023-06-12") for e in history)


def test_confirm_twice_is_idempotent_and_corrections_are_kept():
    p = upload(F_HTA).json()
    items = p["extraction"]["items"]
    items[0] = {**items[0], "label": "Hipertensiune arterială"}
    body = confirm_body(p, items=items)
    client.post(f"/api/v1/imports/{p['id']}/confirm", json=body)
    client.post(f"/api/v1/imports/{p['id']}/confirm", json=body)
    facts = client.get(f"/api/v1/library/{p['documentId']}").json()["facts"]
    assert len(facts) == len({f["label"] + (f["status"] or "") for f in facts})
    corrected = next(f for f in facts if f["label"] == "Hipertensiune arterială")
    assert corrected["edited"] is True
    history = client.get(f"/api/v1/imports/{p['id']}").json()["history"]
    assert [h["action"] for h in history].count("confirmed") == 2


def test_excluded_items_are_not_saved():
    p = upload(F_HTA).json()
    items = [{**i, "include": i["kind"] != "medication"} for i in p["extraction"]["items"]]
    client.post(f"/api/v1/imports/{p['id']}/confirm", json=confirm_body(p, items=items))
    facts = client.get(f"/api/v1/library/{p['documentId']}").json()["facts"]
    assert not [f for f in facts if f["kind"] == "medication"]


def test_reject_removes_the_unconfirmed_document():
    p = upload(F_HTA).json()
    assert client.post(f"/api/v1/imports/{p['id']}/reject").json()["status"] == "rejected"
    assert all(d["id"] != p["documentId"] for d in client.get("/api/v1/library").json()["documents"])
    again = upload(F_HTA).json()  # re-import after reject: new preview, stored analysis reused
    assert again["status"] == "preview" and again["documentId"]


def test_duplicate_import_returns_the_same_preview(monkeypatch):
    first = upload(F_HTA).json()
    second = upload(F_HTA, filename="copie.pdf").json()
    assert second["id"] == first["id"] and second["cached"] is True
    assert sum(1 for d in client.get("/api/v1/library").json()["documents"] if d["id"] == first["documentId"]) == 1


# ─────────────────────────────────────────────────────────── identity

def test_identity_rules():
    profile = {"full_name": "Maria Ionescu", "date_of_birth": "1991-04-17", "sex": "female"}
    assert identity_check.check({"name": "Maria Ionescu", "birth_date": "1991-04-17"}, profile).status == "match"
    only_name = identity_check.check({"name": "IONESCU MARIA"}, profile)
    assert only_name.status == "unverified" and only_name.requires_confirmation  # same name alone is not enough
    assert identity_check.check({"name": "Maria Ionescu", "birth_date": "1980-01-01"}, profile).status == "mismatch"
    assert identity_check.check({"name": "Andrei Pop"}, profile).status == "mismatch"
    assert identity_check.check({"name": "[John Doe]"}, profile).status == "insufficient"
    assert identity_check.check({"name": "John Doe", "birth_date": None}, profile).status == "insufficient"
    assert identity_check.check({}, profile, synthetic=True).status == "demo"


def fhir_bundle(name="Maria Ionescu", dob="1991-04-17") -> dict:
    return {"resourceType": "Bundle", "type": "collection", "entry": [
        {"resource": {"resourceType": "Patient", "id": "p1", "name": [{"given": [name.split()[0]], "family": name.split()[1]}],
                      "birthDate": dob, "gender": "female"}},
        {"resource": {"resourceType": "Condition", "id": "c1",
                      "code": {"coding": [{"system": "http://hl7.org/fhir/sid/icd-10", "code": "I10", "display": "Essential hypertension"}]},
                      "verificationStatus": {"coding": [{"code": "confirmed"}]}, "clinicalStatus": {"coding": [{"code": "active"}]},
                      "recordedDate": "2024-03-02"}},
        {"resource": {"resourceType": "Condition", "id": "c2", "code": {"text": "Angină pectorală"},
                      "verificationStatus": {"coding": [{"code": "provisional"}]}, "recordedDate": "2024-03-02"}},
        {"resource": {"resourceType": "Observation", "id": "o1", "code": {"text": "Glicemie"},
                      "valueQuantity": {"value": 104, "unit": "mg/dL"}, "effectiveDateTime": "2024-03-01",
                      "referenceRange": [{"low": {"value": 70}, "high": {"value": 110}}]}},
        {"resource": {"resourceType": "MedicationStatement", "id": "m1", "status": "active",
                      "medicationCodeableConcept": {"text": "Amlodipină 5 mg"}, "effectiveDateTime": "2024-03-02"}},
        {"resource": {"resourceType": "AllergyIntolerance", "id": "a1", "code": {"text": "Penicilină"}}},
    ]}


def test_fhir_json_is_parsed_locally_and_exported(monkeypatch):
    fake = FakeGemini(error=AssertionError("Gemini must not be called for FHIR"))
    enable_ai(monkeypatch, fake)
    p = upload(content=json.dumps(fhir_bundle()).encode(), filename="export.json", mime="application/json").json()
    assert fake.calls == [] and p["method"] == "local" and p["sourceFormat"] == "fhir_json"
    assert p["identity"]["status"] == "match"
    dx = {d["label"]: d for d in kinds(p, "diagnosis")}
    assert dx["Essential hypertension"]["status"] == "confirmed"
    assert dx["Essential hypertension"]["value"]["coding"][0]["code"] == "I10"
    assert dx["Angină pectorală"]["status"] == "suspected"
    assert kinds(p, "medication")[0]["status"] == "prior"  # documented "active" ≠ active today
    assert p["extraction"]["labs"][0] == {**p["extraction"]["labs"][0], "name": "Glicemie", "value": "104",
                                          "unit": "mg/dL", "referenceRange": "70-110", "measuredAt": "2024-03-01"}
    assert any(c["code"] == "allergy_not_in_profile" for c in p["contradictions"])
    body = confirm_body(p, identityConfirmed=False)  # clear match → no extra confirmation needed
    assert client.post(f"/api/v1/imports/{p['id']}/confirm", json=body).status_code == 200

    bundle = client.get("/api/v1/care/fhir").json()
    res = [e["resource"] for e in bundle["entry"]]
    cond = next(r for r in res if r["resourceType"] == "Condition" and r["code"].get("text") == "Angină pectorală")
    assert cond["verificationStatus"]["coding"][0]["code"] == "provisional"
    ms = next(r for r in res if r["resourceType"] == "MedicationStatement" and r["meta"]["source"].endswith("document_facts"))
    assert ms["status"] == "unknown"
    icd = next(r for r in res if r["resourceType"] == "Condition" and r["code"].get("text") == "Essential hypertension")
    assert icd["code"]["coding"][0]["code"] == "I10"
    labs = client.get("/api/v1/documents/lab-values").json()
    assert any(v["name"] == "Glicemie" and v["documentId"] == p["documentId"] for v in labs)


def test_fhir_other_patient_is_a_mismatch():
    p = upload(content=json.dumps(fhir_bundle("Andrei Pop", "1975-02-02")).encode(), filename="x.json",
               mime="application/json").json()
    assert p["identity"]["status"] == "mismatch"
    body = confirm_body(p, identityConfirmed=False)
    assert client.post(f"/api/v1/imports/{p['id']}/confirm", json=body).status_code == 409


def test_fhir_ndjson_and_validation():
    lines = "\n".join(json.dumps(e["resource"]) for e in fhir_bundle()["entry"])
    p = upload(content=lines.encode(), filename="data.ndjson", mime="application/x-ndjson").json()
    assert p["sourceFormat"] == "fhir_ndjson" and len(kinds(p, "diagnosis")) == 2
    bad = upload(content=b'{"resourceType": "Bundle", "entry": [{"resource": {"id": 1}}]}', filename="b.json",
                 mime="application/json")
    assert bad.status_code == 422 and bad.json()["detail"] == "fhir_invalid_entry"
    assert upload(content=b'{"hello": 1}', filename="c.json", mime="application/json").json()["detail"] == "fhir_missing_resource_type"


# ─────────────────────────────────────────────────────────── CSV

def test_csv_auto_mapping_ro_headers():
    csv = "Analiza;Rezultat;UM;Interval referinta;Data recoltarii\nHemoglobina;13,5;g/dL;12-16;12.03.2024\nTSH;2,1;mUI/L;0,4-4;12.03.2024\n"
    p = upload(content=csv.encode(), filename="analize.csv", mime="text/csv").json()
    assert p["sourceFormat"] == "csv" and p["method"] == "local" and p["extraction"]["category"] == "lab_result"
    assert [(lab["name"], lab["value"], lab["unit"], lab["measuredAt"]) for lab in p["extraction"]["labs"]] == [
        ("Hemoglobina", "13,5", "g/dL", "2024-03-12"), ("TSH", "2,1", "mUI/L", "2024-03-12")]
    assert p["extraction"]["proposedTitle"] == "Analize de laborator – martie 2024"


def test_csv_configurable_mapping():
    csv = "col_a,col_b,col_c\nGlucose,98,mg/dL\n"
    assert upload(content=csv.encode(), filename="x.csv", mime="text/csv").json()["detail"] == "csv_mapping_required"
    p = upload(content=csv.encode(), filename="x.csv", mime="text/csv",
               mapping={"name": "col_a", "value": "col_b", "unit": "col_c"}).json()
    assert p["extraction"]["labs"][0]["name"] == "Glucose"


# ─────────────────────────────────────────────────────────── Gemini: consent, fallback, cache, budget

def gemini_answer(**over) -> dict:
    doc = {
        "category": "discharge_summary", "specialty": "cardiology", "title_ro": "Externare pentru hipertensiune arterială",
        "event_date": "2023-06-12", "document_date": "2023-06-12", "institution": None, "physician": "Dr. Jane Smith",
        "patient_name": None, "patient_birth_date": None, "patient_sex": "male",
        "diagnoses": [
            {"name": "Hipertensiune arterială", "certainty": "confirmed", "page": 1, "excerpt": "Diagnosis: Arterial Hypertension"},
            {"name": "Insuficiență cardiacă", "certainty": "confirmed", "page": 1, "excerpt": "severe heart failure noted"}],
        "medications": [{"name": "Lisinopril", "dose": "10 mg", "frequency": "o dată pe zi", "context": "at_discharge",
                         "page": 1, "excerpt": "Lisinopril 10 mg: Take 1 tablet by mouth once daily"}],
        "labs": [{"name": "Fasting Plasma Glucose", "value": "146", "unit": "mg/dL", "reference_range": None, "date": None,
                  "page": 1, "excerpt": "Fasting Plasma Glucose: 146 mg/dL"}],
        "follow_ups": [{"text": "Control la clinica de hipertensiune", "date": "2023-06-26", "page": 2,
                        "excerpt": "follow-up appointment in the hypertension clinic"}],
    }
    return {**doc, **over}


def test_gemini_with_consent_sources_are_verified(monkeypatch):
    fake = FakeGemini(answer=gemini_answer())
    enable_ai(monkeypatch, fake)
    p = upload(F_HTA).json()
    assert p["method"] == "gemini" and fake.calls == [settings.gemini_document_model]
    dx = {d["label"]: d for d in kinds(p, "diagnosis")}
    assert dx["Hipertensiune arterială"]["source"]["verified"] is True
    invented = dx["Insuficiență cardiacă"]  # excerpt not in the document → flagged for verification
    assert invented["source"]["verified"] is False and invented["uncertain"] is True
    assert "unverified_sources" in p["extraction"]["toVerify"]
    assert kinds(p, "follow_up")[0]["date"] == "2023-06-26"
    usage = client.get("/api/v1/imports/usage").json()
    assert usage["todayCalls"] == 1 and usage["todayTokens"] == 1500 and usage["todayCostUsd"] > 0


def test_cache_means_fewer_ai_calls(monkeypatch):
    fake = FakeGemini(answer=gemini_answer())
    enable_ai(monkeypatch, fake)
    first = upload(F_HTA).json()
    for _ in range(3):
        upload(F_HTA)
    client.get("/api/v1/library")
    client.get(f"/api/v1/library/{first['documentId']}")
    client.get("/api/v1/care/record")
    client.get("/api/v1/patients/me/summary")
    assert len(fake.calls) == 1  # one analysis; record / library opening never calls Gemini
    client.post(f"/api/v1/imports/{first['id']}/reanalyze")  # explicit request → one more call
    assert len(fake.calls) == 2


def test_no_consent_no_ai(monkeypatch):
    fake = FakeGemini(answer=gemini_answer())
    enable_ai(monkeypatch, fake, consent=False)
    p = upload(F_HTA).json()
    assert fake.calls == [] and p["method"] == "local_fallback" and p["fallbackReason"] == "no_consent"


def test_reupload_after_consent_uses_gemini_once(monkeypatch):
    fake = FakeGemini(answer=gemini_answer())
    enable_ai(monkeypatch, fake, consent=False)
    first = upload(F_HTA).json()
    assert first["method"] == "local_fallback" and fake.calls == []
    enable_ai(monkeypatch, fake, consent=True)
    again = upload(F_HTA).json()
    assert again["method"] == "gemini" and again["id"] == first["id"] and len(fake.calls) == 1
    assert upload(F_HTA).json()["cached"] is True and len(fake.calls) == 1  # now cached with the AI result


def test_gemini_unavailable_falls_back_to_local(monkeypatch):
    fake = FakeGemini(error=gemini_client.GeminiFailed("busy"))
    enable_ai(monkeypatch, fake)
    p = upload(F_HTA).json()
    assert p["method"] == "local_fallback" and p["fallbackReason"] == "ai_busy"
    assert p["extraction"]["proposedTitle"] == "Externare pentru hipertensiune arterială"
    assert client.get("/api/v1/imports/usage").json()["recent"][0]["status"] == "error"


def test_timeout_falls_back(monkeypatch):
    enable_ai(monkeypatch, FakeGemini(error=gemini_client.GeminiTimeout()))
    assert upload(F_HTA).json()["fallbackReason"] == "ai_timeout"


def test_budget_blocks_ai(monkeypatch):
    fake = FakeGemini(answer=gemini_answer())
    enable_ai(monkeypatch, fake)
    monkeypatch.setattr(settings, "ai_daily_budget_usd", 0.0)
    p = upload(F_HTA).json()
    assert fake.calls == [] and p["fallbackReason"] == "budget"


def test_escalation_only_when_cheap_model_fails(monkeypatch):
    monkeypatch.setattr(settings, "gemini_document_model", "cheap-model")
    monkeypatch.setattr(settings, "gemini_document_escalation_model", "strong-model")
    fake = FakeGemini(by_model={"cheap-model": gemini_client.GeminiFailed("invalid"), "strong-model": gemini_answer()})
    enable_ai(monkeypatch, fake)
    p = upload(F_HTA).json()
    assert fake.calls == ["cheap-model", "strong-model"] and p["model"] == "strong-model"
    ok = FakeGemini(answer=gemini_answer())  # usable answer (verifiable sources) → no escalation
    monkeypatch.setattr(gemini_client, "generate_structured", ok)
    client.post(f"/api/v1/imports/{p['id']}/reanalyze")
    assert ok.calls == ["cheap-model"]
    unusable = FakeGemini(answer=gemini_answer(diagnoses=[], medications=[], labs=[], follow_ups=[]))
    monkeypatch.setattr(gemini_client, "generate_structured", unusable)
    client.post(f"/api/v1/imports/{p['id']}/reanalyze")
    assert unusable.calls == ["cheap-model", "strong-model"]  # empty answer for a long document → escalated once


def test_input_is_truncated_to_the_limit():
    pages = ["x" * 5000, "y" * 5000]
    text, truncated = di.gemini_prompt_contents(pages, 6000)
    assert truncated and len(text) <= 6000 and "=== PAGE 2 ===" in text


def test_gemini_schema_has_no_unsupported_keys():
    schema = json.dumps(gemini_client.gemini_schema(GeminiDocument))
    assert "maxLength" not in schema and "maxItems" not in schema


# ─────────────────────────────────────────────────────────── demo isolation, library, formats

def test_demo_documents_only_in_demo_contexts(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://x.supabase.co")
    monkeypatch.setattr(settings, "supabase_publishable_key", "pk")
    monkeypatch.setattr(settings, "allow_demo_documents", None)
    monkeypatch.setattr(settings, "app_env", "production")
    real = SimpleNamespace(full_name="Maria Ionescu")
    assert smart_import_service.demo_allowed(real) is False
    assert smart_import_service.demo_allowed(SimpleNamespace(full_name="[DEMO] Pacient test")) is True
    monkeypatch.setattr(settings, "app_env", "development")
    assert smart_import_service.demo_allowed(real) is True


def test_demo_documents_are_not_exported_with_real_data():
    from app.services import fhir_service, import_repo
    p = upload(F_HTA).json()
    client.post(f"/api/v1/imports/{p['id']}/confirm", json=confirm_body(p))
    user = SimpleNamespace(id="pat_demo_001")
    record = patient_service.get_patient("pat_demo_001")
    facts = import_repo.list_facts(user)
    assert facts and all(f["is_demo"] for f in facts)
    real = fhir_service.bundle("pat_demo_001", record, record.documents, [], [], [], facts=facts, include_demo=False)
    assert not any(p["documentId"] in json.dumps(e) for e in real["entry"])
    demo = fhir_service.bundle("pat_demo_001", record, record.documents, [], [], [], facts=facts, include_demo=True)
    assert any(p["documentId"] in json.dumps(e) for e in demo["entry"])


def test_library_filters_sort_and_title_edit():
    a = upload(F_HTA).json()
    b = upload("354_traumatology_ankle-fractures_11.pdf").json()
    lib = client.get("/api/v1/library", params={"category": "trauma"}).json()["documents"]
    assert [d["id"] for d in lib] == [b["documentId"]]
    assert client.get("/api/v1/library", params={"q": "hipertensiune"}).json()["documents"][0]["id"] == a["documentId"]
    by_date = client.get("/api/v1/library", params={"sort": "date", "order": "asc", "from": "2023-01-01"}).json()["documents"]
    assert [d["id"] for d in by_date[:2]] == [a["documentId"], b["documentId"]]
    assert client.get("/api/v1/library", params={"specialty": "orthopedics"}).json()["documents"][0]["id"] == b["documentId"]
    patched = client.patch(f"/api/v1/library/{a['documentId']}", json={"title": "Externare iunie 2023"}).json()
    assert patched["document"]["title"] == "Externare iunie 2023" and patched["document"]["originalFilename"] == F_HTA
    assert client.get(f"/api/v1/documents/{a['documentId']}/file").content == (FIX / F_HTA).read_bytes()  # original kept


def test_unsupported_and_empty_files():
    assert upload(content=b"GIF89a....", filename="x.gif", mime="image/gif").status_code == 415
    assert upload(content=b"\x00\x01\x02binary", filename="x.bin", mime="application/octet-stream").json()["detail"] == "unsupported_format"
    assert upload(content=b"", filename="x.pdf").status_code == 400


def test_scanned_pdf_without_ocr_is_reported(monkeypatch):
    from app.services import lab_extraction
    from tests.test_lab_scanner import text_pdf
    monkeypatch.setattr(lab_extraction, "ocr_available", lambda: False)
    p = upload(content=text_pdf([]), filename="scan.pdf").json()
    assert p["sourceFormat"] == "pdf_scanned" and p["extraction"]["textFound"] is False
    assert "ocr_unavailable" in p["extraction"]["toVerify"]


def test_detect_formats():
    assert import_parsers.detect(b"%PDF-1.4") == "pdf"
    assert import_parsers.detect(b'{"resourceType":"Patient"}') == "fhir_json"
    assert import_parsers.detect(b'{"resourceType":"Patient"}\n{"resourceType":"Condition"}') == "fhir_ndjson"
    assert import_parsers.detect(b"a;b\n1;2", "x.csv") == "csv"


def test_ner_context_is_grounded_bounded_and_deduplicated():
    from app.schemas.smart_import import NerTerm

    page = "Patient denies diabetes. Aspirin was stopped in 2020."
    original, _ = di.gemini_prompt_contents([page], 600)
    good = NerTerm(kind="Disease", text="diabetes", start=15, end=23, page=1, context="Patient denies diabetes.")
    wrong = good.model_copy(update={"context": "Patient was diagnosed with diabetes."})
    misplaced = good.model_copy(update={"page": 2})
    assert di.gemini_prompt_contents([page], 600, [wrong, misplaced]) == (original, False)
    prompt, truncated = di.gemini_prompt_contents([page], 600, [good, good])
    assert not truncated and len(prompt) <= 600
    assert prompt.count("Page 1: diabetes") == 1
    assert "Unverified hints" in prompt
    assert di.gemini_prompt_contents([page], len(original), [good]) == (original, False)
    assert di.gemini_prompt_contents([page], 30, [good]) == di.gemini_prompt_contents([page], 30)


def test_ner_neither_triggers_ai_nor_creates_facts(monkeypatch):
    from app.schemas.smart_import import NerTerm
    from app.services import medical_ner

    term = NerTerm(kind="Chemical", text="Aspirin", start=0, end=7, page=1, context="Aspirin was stopped.")
    monkeypatch.setattr(medical_ner, "extract", lambda *args: [term])
    fake = FakeGemini(answer=gemini_answer())
    enable_ai(monkeypatch, fake, consent=False)
    preview = upload(F_HTA).json()
    assert preview["extraction"]["nerTerms"][0]["text"] == "Aspirin"
    malicious = {
        **preview["extraction"]["items"][0], "key": "forged-key", "kind": "medication", "label": "Aspirin",
        "status": "active", "source": {"page": 1, "excerpt": "Aspirin was stopped.", "verified": True},
    }
    body = confirm_body(preview, items=[malicious])
    assert client.post(f"/api/v1/imports/{preview['id']}/confirm", json=body).status_code == 200
    detail = client.get(f"/api/v1/library/{preview['documentId']}").json()
    assert not detail["facts"]
    assert fake.calls == []


def test_historical_ai_facts_keep_source_in_record(monkeypatch):
    enable_ai(monkeypatch, FakeGemini(answer=gemini_answer()))
    preview = upload(F_HTA).json()
    body = confirm_body(preview)
    for item in body["items"]:
        if item["label"] == "Insuficiență cardiacă":
            item["source"]["verified"] = True
    assert client.post(f"/api/v1/imports/{preview['id']}/confirm", json=body).status_code == 200
    detail = client.get(f"/api/v1/library/{preview['documentId']}").json()
    assert all(f["label"] != "Insuficiență cardiacă" for f in detail["facts"])
    record = client.get("/api/v1/care/record", params={"view": "chronological"}).json()
    medication = next(i for i in record["items"] if i["source"] == "document_fact" and i["title"] == "Lisinopril")
    assert medication["date"] == "2023-06-12"
    assert medication["documentId"] == preview["documentId"]
    assert medication["status"] == "historical" and not medication["pinned"]


@pytest.mark.parametrize("enabled", [False, True])
def test_ner_feature_flag_and_cache(monkeypatch, enabled):
    from app.schemas.smart_import import NerTerm
    from app.services import medical_ner

    calls = []
    ner_calls = []
    term = NerTerm(kind="Disease", text="Arterial Hypertension", start=0, end=21,
                   page=1, context="Diagnosis: Arterial Hypertension")
    def ner(*args):
        ner_calls.append(1)
        return [term]
    monkeypatch.setattr(medical_ner, "extract", ner)
    monkeypatch.setattr(settings, "gemini_document_ner_hints", enabled)

    def fake(model, system, contents, label, **kwargs):
        calls.append(contents)
        return model.model_validate(gemini_answer())
    enable_ai(monkeypatch, fake)
    first = upload(F_HTA).json()
    second = upload(F_HTA).json()
    assert first["extraction"]["nerTerms"] == second["extraction"]["nerTerms"]
    assert second["cached"] and second["id"] == first["id"]
    assert len(calls) == len(ner_calls) == 1
    assert ("Unverified hints." in calls[0]) is enabled


@pytest.mark.parametrize("code", [429, 503, 400])
def test_document_retry_policy(monkeypatch, code):
    import httpx
    from google import genai
    from google.genai import errors

    calls, waits = [], []

    def generate(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            response = httpx.Response(code, headers={"Retry-After": "2"})
            raise errors.APIError(code, {"error": {"message": "test"}}, response)
        return SimpleNamespace(text=json.dumps(gemini_answer()), usage_metadata=None)

    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(genai, "Client", lambda **kwargs: SimpleNamespace(
        models=SimpleNamespace(generate_content=generate), close=lambda: None))
    monkeypatch.setattr(gemini_client.time, "sleep", waits.append)
    if code == 400:
        with pytest.raises(gemini_client.GeminiFailed):
            gemini_client.generate_structured(GeminiDocument, "system", "text", "document_import")
        assert len(calls) == 1 and waits == []
    else:
        gemini_client.generate_structured(GeminiDocument, "system", "text", "document_import")
        assert len(calls) == 2 and waits == [2.0]


def test_resume_keeps_original_and_local_preview(monkeypatch):
    enable_ai(monkeypatch, FakeGemini(error=gemini_client.GeminiTimeout()))
    first = upload(F_HTA).json()
    assert first["fallbackReason"] == "ai_timeout" and first["documentId"]
    path = f"/api/v1/imports/{first['id']}/reanalyze"
    monkeypatch.setattr(gemini_client, "generate_structured", FakeGemini(error=gemini_client.GeminiFailed("busy")))
    again = client.post(path).json()
    assert again["fallbackReason"] == "ai_busy"
    assert again["documentId"] == first["documentId"] and again["extraction"] == first["extraction"]
    monkeypatch.setattr(gemini_client, "generate_structured", FakeGemini(answer=gemini_answer()))
    resumed = client.post(path).json()
    assert resumed["method"] == "gemini" and resumed["documentId"] == first["documentId"]


def test_strength_is_not_a_medication_name():
    from pydantic import ValidationError

    answer = gemini_answer()
    answer["medications"][0]["name"] = "hydrocortisone 1%"
    with pytest.raises(ValidationError):
        GeminiDocument.model_validate(answer)


@pytest.mark.parametrize("long_window", [False, True])
def test_gemini_backup_respects_quota_kind(monkeypatch, long_window):
    from google import genai
    from google.genai import errors

    keys = []
    def create(api_key, **kwargs):
        keys.append(api_key)
        def generate(**kwargs):
            if len(keys) == 1:
                quota = "GenerateRequestsPerDayPerProject" if long_window else "GenerateRequestsPerMinute"
                raise errors.APIError(429, {"error": {"message": "test", "details": [
                    {"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [{"quotaId": quota}]}
                ]}})
            return SimpleNamespace(text=json.dumps(gemini_answer()), usage_metadata=None)
        return SimpleNamespace(models=SimpleNamespace(generate_content=generate), close=lambda: None)
    monkeypatch.setattr(genai, "Client", create)
    monkeypatch.setattr(settings, "gemini_api_key", "primary-test")
    monkeypatch.setattr(settings, "gemini_backup_api_key", "backup-test")
    monkeypatch.setattr(gemini_client.time, "sleep", lambda delay: None)
    gemini_client.generate_structured(GeminiDocument, "system", "text", "document_import")
    assert keys == ["primary-test", "backup-test" if long_window else "primary-test"]
