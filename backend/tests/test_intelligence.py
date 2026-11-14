"""AI Medical Intelligence — all medical data here is FICTIVE (demo patient). Gemini is replaced by a fake in tests:
the real client is exercised separately with a fake SDK client (timeout / invalid JSON), never over the network."""
import json
import logging
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import settings
from app.core.security import CurrentUser
from app.main import app
from app.schemas.intelligence import DraftStatement, GeminiDraft
from app.schemas.patient import PatientRecord
from app.services import ai_facts, doctor_access_service, gemini_client, lab_extraction, patient_service
from app.services import intelligence_service as svc
from app.services.demo_data import DEMO_PATIENT_ID, demo_patient
from tests.test_supabase_auth import auth, make_token, supabase_mode  # noqa: F401  (fixture)

client = TestClient(app)
API = "/api/v1/intelligence"
LAB_ID = ai_facts.lab_fact_id("Hemoglobina", "g/dL")


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    svc.reset_demo()
    doctor_access_service.reset_demo()
    monkeypatch.setattr(lab_extraction, "_demo_values", {})
    monkeypatch.setitem(patient_service._patients, DEMO_PATIENT_ID, demo_patient())
    monkeypatch.setattr(settings, "gemini_api_key", "test-key-not-real")
    yield
    svc.reset_demo()
    doctor_access_service.reset_demo()


class FakeGemini:
    """Records what would be sent and returns a fixed draft."""

    def __init__(self, draft: GeminiDraft | None = None, error: Exception | None = None):
        self.draft, self.error, self.calls = draft, error, []

    def __call__(self, facts_json: str, language: str) -> GeminiDraft:
        self.calls.append((facts_json, language))
        if self.error:
            raise self.error
        return self.draft or GeminiDraft(overview=DraftStatement(text="Astm documentat.", source_ids=["condition:dg1"]))


@pytest.fixture
def gemini(monkeypatch):
    fake = FakeGemini()
    monkeypatch.setattr(gemini_client, "generate_draft", fake)
    return fake


def fictive_profile():
    """Fictive: anaphylaxis allergy, an old surgery, an abnormal lab value."""
    client.patch("/api/v1/patients/me", json={
        "allergies": [{"id": "al1", "substance": "Penicillin", "reaction": "Skin rash", "severity": "moderate"},
                      {"substance": "Arahide", "reaction": "Anafilaxie", "severity": "severe"}],
        "surgeries": [{"name": "Apendicectomie", "date": "2009"}],
    })
    lab_extraction.demo_save(DEMO_PATIENT_ID, "doc1", [
        {"name": "Hemoglobina", "value": "10,9", "unit": "g/dL", "reference_range": "12 - 16", "measured_at": "2026-10-02"},
    ])


def consent(on=True):
    assert client.put(f"{API}/consent", json={"granted": on}).json()["granted"] is on


def items(view, category):
    return next(s for s in view["summary"]["sections"] if s["category"] == category)["items"]


# ─────────────────────────────────────────────────────────── schema

@pytest.mark.parametrize("raw", [
    "{}",                                                                           # overview missing
    '{"overview": {"text": "x", "source_ids": []}, "risk_score": 3}',              # extra field
    '{"overview": {"text": "' + "x" * 401 + '", "source_ids": []}}',               # too long
    '{"overview": {"text": "x", "source_ids": []}, "medications": "aspirin"}',     # wrong type
    "not json",
])
def test_gemini_schema_is_strict(raw):
    with pytest.raises(ValidationError):
        GeminiDraft.model_validate_json(raw)


# ─────────────────────────────────────────────────────────── consent / configuration

def test_without_consent_nothing_is_sent(gemini):
    assert client.get(f"{API}/me").json()["status"] == "no_consent"
    res = client.post(f"{API}/me/generate", json={"language": "ro"})
    assert res.status_code == 403 and gemini.calls == []


def test_not_configured_is_clear_and_never_simulated(monkeypatch, gemini):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    consent()
    view = client.get(f"{API}/me").json()
    assert view["status"] == "not_configured" and view["aiConfigured"] is False and view["summary"] is None
    assert client.post(f"{API}/me/generate", json={}).status_code == 503 and gemini.calls == []


def test_withdrawing_consent_deletes_the_saved_summary(gemini):
    consent()
    assert client.post(f"{API}/me/generate", json={}).json()["status"] == "ok"
    consent(False)
    assert client.get(f"{API}/me").json() == {"status": "no_consent", "aiConfigured": True, "consent": False,
                                              "summary": None, "patientName": None, "scopes": []}
    consent()
    assert client.get(f"{API}/me").json()["status"] == "none"  # not restored after re-consenting


# ─────────────────────────────────────────────────────────── minimisation + grounding

def test_only_minimal_facts_are_sent(gemini):
    fictive_profile()
    consent()
    client.post(f"{API}/me/generate", json={"language": "en"})
    facts_json, language = gemini.calls[0]
    assert language == "en"
    facts = json.loads(facts_json)
    sent = facts_json.lower()
    for private in ("maria", "ionescu", "1991-04-17", "@", "source_line"):
        assert private not in sent
    assert {f["kind"] for f in facts} == {"profile", "allergy", "condition", "medication", "surgery", "document", "lab"}
    assert next(f for f in facts if f["kind"] == "profile")["age_years"] > 0


def test_grounding_rejects_unsupported_claims(monkeypatch):
    fictive_profile()
    consent()
    fake = FakeGemini(GeminiDraft(
        overview=DraftStatement(text="Pacientă cu astm și alergie la arahide.", source_ids=["condition:dg1", "allergy:x"]),
        active_conditions=[
            DraftStatement(text="Astm bronșic persistent ușor (J45.30).", source_ids=["condition:dg1"]),       # ok
            DraftStatement(text="Diabet zaharat tip 2.", source_ids=["condition:dg1"]),                        # invented
            DraftStatement(text="Hipertensiune arterială.", source_ids=["condition:nope"]),                    # fake id
            DraftStatement(text="Astm cu infecție HIV (B20).", source_ids=["condition:dg1"]),                  # unknown ICD
        ],
        medications=[
            DraftStatement(text="Budesonide 200 mcg de 2 ori pe zi.", source_ids=["medication:tr1"]),          # ok
            DraftStatement(text="Se recomandă creșterea dozei de Budesonide.", source_ids=["medication:tr1"]),  # advice
        ],
        lab_findings=[
            DraftStatement(text="Hemoglobina 10,9 g/dL (12 - 16) la 2026-10-02.", source_ids=[LAB_ID]),        # ok
            DraftStatement(text="Hemoglobina scăzută.", source_ids=[LAB_ID]),                                  # no value
        ],
        critical_information=[DraftStatement(text="Risc crescut de complicații.", source_ids=["condition:dg1"])],
        surgical_history=[DraftStatement(text="Colecistectomie.", source_ids=["surgery:nope"])],
        missing_information=["Grupa sanguină nu este documentată.", "Se recomandă un control."],
    ))
    monkeypatch.setattr(gemini_client, "generate_draft", fake)
    view = client.post(f"{API}/me/generate", json={}).json()
    s = view["summary"]
    texts = [i["text"] for sec in s["sections"] for i in sec["items"] if i["origin"] == "ai"]
    assert "Astm bronșic persistent ușor (J45.30)." in texts
    assert "Budesonide 200 mcg de 2 ori pe zi." in texts
    assert "Hemoglobina 10,9 g/dL (12 - 16) la 2026-10-02." in texts
    assert "Grupa sanguină nu este documentată." in texts
    for bad in ("Diabet", "Hipertensiune", "HIV", "recomand", "Risc", "Colecistectomie", "Hemoglobina scăzută"):
        assert not any(bad in t for t in texts), bad
    assert s["discardedStatements"] == 8
    assert s["overview"].startswith("Pacientă")  # one real source is enough; the fake id is ignored
    assert s["overviewSourceIds"] == ["condition:dg1"]
    known = {src["id"] for src in s["sources"]}
    assert all(i in known for sec in s["sections"] for item in sec["items"] for i in item["sourceIds"])


def test_priority_follows_explicit_rules(gemini):
    fictive_profile()
    consent()
    view = client.post(f"{API}/me/generate", json={}).json()
    priority = items(view, "priority")
    assert [i["flag"] for i in priority] == ["anaphylaxis", "abnormal_lab"]  # anaphylaxis first, then abnormal lab
    assert "Arahide" in priority[0]["text"] and priority[0]["origin"] == "record"
    assert not any(i["sourceIds"][0].startswith("allergy:al1") for i in priority)  # moderate rash ≠ priority
    history = items(view, "history")
    assert [i["text"] for i in history] == ["Apendicectomie"]  # old surgery → history, not priority
    active = items(view, "active")
    assert {i["sourceIds"][0] for i in active} == {"condition:dg1", "medication:tr1"}  # listed even if Gemini skipped them
    lab = next(src for src in view["summary"]["sources"] if src["id"] == LAB_ID)
    assert lab["flag"] == "abnormal_lab" and lab["date"] == "2026-10-02" and lab["documentId"] == "doc1"


def test_incomplete_record_lists_what_is_missing():
    sheet = ai_facts.build_facts(PatientRecord(id="p_fictiv", full_name="Fictiv"), None, [])
    summary = ai_facts.assemble(GeminiDraft(overview=DraftStatement(text="Nimic documentat.", source_ids=[])), sheet,
                                language="ro", model="fake", generated_at="2026-11-14T00:00:00Z")
    verify = next(s for s in summary.sections if s.category == "verify").items
    assert {i.code for i in verify} == {"missing_blood_type", "missing_date_of_birth", "no_allergies_recorded",
                                        "documents_not_shared"}
    assert summary.overview == "" and summary.discarded_statements == 1
    assert all(not s.items for s in summary.sections if s.category != "verify")


def test_sensitive_diagnosis_is_stated_factually():
    record = PatientRecord(id="p_fictiv", full_name="Fictiv", diagnoses=[
        {"id": "d1", "name": "Infecție HIV", "icd10": "B20", "diagnosed_at": "2020-01-01", "status": "active"}])
    sheet = ai_facts.build_facts(record, None, None)
    draft = GeminiDraft(overview=DraftStatement(text="Infecție HIV documentată din 2020.", source_ids=["condition:d1"]),
                        active_conditions=[
                            DraftStatement(text="Infecție HIV (B20), activă din 2020-01-01.", source_ids=["condition:d1"]),
                            DraftStatement(text="Infecție HIV, prognostic rezervat, contagioasă.", source_ids=["condition:d1"])])
    s = ai_facts.assemble(draft, sheet, language="ro", model="fake", generated_at="x")
    active = next(x for x in s.sections if x.category == "active").items
    assert [i.text for i in active] == ["Infecție HIV (B20), activă din 2020-01-01."]
    assert not next(x for x in s.sections if x.category == "priority").items  # no invented severity


# ─────────────────────────────────────────────────────────── isolation

def test_patients_are_isolated(gemini):
    consent()
    client.post(f"{API}/me/generate", json={})
    other = CurrentUser(id="pat_fictiv_2", role="patient")
    assert svc.get_consent(other).granted is False
    assert svc.patient_view(other).status == "no_consent"
    svc.set_consent(other, True)
    assert svc.patient_view(other).summary is None  # never the demo patient's summary
    with pytest.raises(svc.AccessDenied):
        svc.patient_generate(other, "ro")  # no record of their own → nothing sent
    assert len(gemini.calls) == 1


# ─────────────────────────────────────────────────────────── doctor

def grant(scopes, hours=24):
    return client.post("/api/v1/doctor-access/grants",
                       json={"doctorId": "doc_demo_001", "scopes": scopes, "durationHours": hours}).json()


def test_doctor_needs_valid_consent_for_every_source_section(gemini):
    fictive_profile()
    consent()
    client.post(f"{API}/me/generate", json={})  # built from profile + documents + labs
    assert client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()["status"] == "none"  # no grant at all
    grant(["profile"])
    view = client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()
    assert view["status"] == "none" and view["summary"] is None  # saved summary also uses documents + labs
    grant(["profile", "documents", "labs"])
    view = client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()
    assert view["status"] == "ok" and view["summary"]["overview"] and view["patientName"]


def test_doctor_generate_uses_only_granted_sections_and_is_not_stored(gemini):
    fictive_profile()
    consent()
    grant(["labs"])
    view = client.post(f"{API}/patients/{DEMO_PATIENT_ID}/generate", json={"language": "ro"}).json()
    assert view["status"] == "ok" and view["summary"]["sourceScopes"] == ["labs"]
    kinds = {f["kind"] for f in json.loads(gemini.calls[-1][0])}
    assert kinds == {"lab"}  # no profile, allergies or documents were sent
    assert svc._summaries == {}


def test_doctor_generate_needs_patient_ai_consent(gemini):
    grant(["profile"])
    res = client.post(f"{API}/patients/{DEMO_PATIENT_ID}/generate", json={})
    assert res.status_code == 403 and gemini.calls == []
    assert client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()["status"] == "no_consent"


def test_expired_and_revoked_access_hide_the_summary(gemini):
    consent()
    client.post(f"{API}/me/generate", json={})
    g = grant(["profile", "documents", "labs"], hours=1)
    assert client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()["status"] == "ok"
    for stored in doctor_access_service._grants:
        stored.created_at -= timedelta(hours=2)
        stored.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    view = client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()
    assert view["status"] == "expired" and view["summary"] is None
    assert client.post(f"{API}/patients/{DEMO_PATIENT_ID}/generate", json={}).status_code == 403

    g = grant(["profile", "documents", "labs"])
    assert client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()["status"] == "ok"
    client.post(f"/api/v1/doctor-access/grants/{g['id']}/revoke")
    view = client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()
    assert view["status"] == "revoked" and view["summary"] is None
    assert client.post(f"{API}/patients/{DEMO_PATIENT_ID}/generate", json={}).status_code == 403


def test_doctor_routes_need_doctor_role(supabase_mode, monkeypatch):  # noqa: F811
    from app.services import supabase_repo
    monkeypatch.setattr(supabase_repo, "get_role", lambda _u: "patient")
    token = make_token(user_metadata={"role": "doctor"})
    assert supabase_mode.get(f"{API}/patients/{DEMO_PATIENT_ID}", headers=auth(token)).status_code == 403
    assert supabase_mode.post(f"{API}/patients/{DEMO_PATIENT_ID}/generate", json={}, headers=auth(token)).status_code == 403


def test_saved_summary_drops_items_whose_source_was_deleted(gemini):
    consent()
    client.post(f"{API}/me/generate", json={})
    client.patch("/api/v1/patients/me", json={"diagnoses": [], "treatments": []})
    view = client.get(f"{API}/me").json()
    assert view["summary"]["overview"] == ""  # it cited condition:dg1, which no longer exists
    assert items(view, "active") == []


# ─────────────────────────────────────────────────────────── failures

@pytest.mark.parametrize(("error", "status"), [
    (gemini_client.GeminiTimeout(), 504), (gemini_client.GeminiFailed(), 502), (gemini_client.GeminiRateLimited(), 429)])
def test_gemini_errors_are_clear(monkeypatch, error, status):
    consent()
    monkeypatch.setattr(gemini_client, "generate_draft", FakeGemini(error=error))
    res = client.post(f"{API}/me/generate", json={})
    assert res.status_code == status
    assert client.get(f"{API}/me").json()["status"] == "none"  # nothing simulated, nothing stored


def test_rate_limit(monkeypatch, gemini):
    monkeypatch.setattr(settings, "ai_summary_per_user_per_hour", 2)
    consent()
    assert [client.post(f"{API}/me/generate", json={}).status_code for _ in range(3)] == [200, 200, 429]
    assert len(gemini.calls) == 2


def _fake_sdk(monkeypatch, behaviour):
    from google import genai

    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            self.models = SimpleNamespace(generate_content=behaviour)

        def close(self):
            pass

    monkeypatch.setattr(genai, "Client", FakeClient)


def test_client_timeout_and_invalid_json_without_logging_content(monkeypatch, caplog):
    secret = "Arahide-anafilaxie-FICTIV"
    caplog.set_level(logging.DEBUG)

    def slow(**_k):
        raise httpx.ReadTimeout("timed out")

    _fake_sdk(monkeypatch, slow)
    with pytest.raises(gemini_client.GeminiTimeout):
        gemini_client.generate_draft(json.dumps([{"id": "allergy:1", "substance": secret}]), "ro")

    _fake_sdk(monkeypatch, lambda **_k: SimpleNamespace(text='{"overview": "not an object"}'))
    with pytest.raises(gemini_client.GeminiFailed):
        gemini_client.generate_draft(json.dumps([{"id": "allergy:1", "substance": secret}]), "ro")
    assert secret not in caplog.text


def test_client_sends_schema_and_parses_valid_json(monkeypatch):
    seen = {}

    def ok(**kwargs):
        seen.update(kwargs)
        return SimpleNamespace(text='{"overview": {"text": "x", "source_ids": ["profile:basics"]}}')

    _fake_sdk(monkeypatch, ok)
    draft = gemini_client.generate_draft("[]", "en")
    assert draft.overview.source_ids == ["profile:basics"]
    assert seen["config"].response_mime_type == "application/json"
    assert seen["config"].response_json_schema == gemini_client.gemini_schema(GeminiDraft)
    # Gemini rejects length / count limits; they stay only in the Pydantic validation.
    assert "maxLength" not in json.dumps(seen["config"].response_json_schema)
    assert "English" in seen["config"].system_instruction


def test_surgeries_in_profile_round_trip():
    res = client.patch("/api/v1/patients/me", json={"surgeries": [{"name": "Apendicectomie", "date": "2009", "notes": "fictiv"}]})
    assert res.status_code == 200 and res.json()["surgeries"][0]["name"] == "Apendicectomie"
    assert client.patch("/api/v1/patients/me", json={"surgeries": [{"name": "X", "date": "ieri"}]}).status_code == 422


def test_priority_item_is_not_duplicated_when_ai_cites_it(monkeypatch):
    fictive_profile()
    consent()
    al = next(a.id for a in patient_service.get_patient(DEMO_PATIENT_ID).allergies if a.substance == "Arahide")
    monkeypatch.setattr(gemini_client, "generate_draft", FakeGemini(GeminiDraft(
        overview=DraftStatement(text="x", source_ids=[]),
        critical_information=[DraftStatement(text="Alergie la arahide cu anafilaxie.", source_ids=[f"allergy:{al}"])])))
    priority = items(client.post(f"{API}/me/generate", json={}).json(), "priority")
    assert [(i["origin"], i["flag"]) for i in priority] == [("ai", "anaphylaxis"), ("record", "abnormal_lab")]
