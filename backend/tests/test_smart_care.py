"""Smart Care — every symptom, patient and doctor here is FICTIVE. Gemini is replaced by a fake; no network."""
import logging
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.smart_care import GeminiSpecialty, GeminiTriage
from app.services import appointment_service, gemini_client, intelligence_service, patient_service, specialty_catalog
from app.services import smart_care_service, supabase_repo, triage_safety
from app.services.demo_data import DEMO_PATIENT_ID, demo_patient
from tests.test_supabase_auth import auth, make_token, supabase_mode  # noqa: F401  (fixture)

client = TestClient(app)
API = "/api/v1/smart-care"
MIGRATION = Path(__file__).resolve().parents[2] / "supabase/migrations/20261117000000_smart_care_appointments.sql"


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    intelligence_service.reset_demo()
    appointment_service.reset_demo()
    monkeypatch.setitem(patient_service._patients, DEMO_PATIENT_ID, demo_patient())
    monkeypatch.setattr(settings, "gemini_api_key", "test-key-not-real")
    yield
    intelligence_service.reset_demo()
    appointment_service.reset_demo()


class FakeGemini:
    def __init__(self, draft: GeminiTriage | Exception):
        self.draft = draft
        self.calls: list[dict] = []

    def __call__(self, model, system, contents, label, repair=None):
        self.calls.append({"model": model, "system": system, "contents": contents, "label": label, "repair": repair})
        if isinstance(self.draft, Exception):
            raise self.draft
        return self.draft


def use_gemini(monkeypatch, draft) -> FakeGemini:
    fake = FakeGemini(draft)
    monkeypatch.setattr(gemini_client, "generate_structured", fake)
    return fake


def consent():
    assert client.put("/api/v1/intelligence/consent", json={"granted": True}).json()["granted"]


def triage(symptoms: str, **extra):
    return client.post(f"{API}/triage", json={"symptoms": symptoms, "confirmed": True, **extra})


DRAFT = GeminiTriage(
    symptom_summary="Tuse de 2 săptămâni și oboseală.",
    suggested_specialties=[GeminiSpecialty(specialty_id="pulmonology", reason="Tusea persistentă este evaluată de pneumologie."),
                           GeminiSpecialty(specialty_id="family_medicine", reason="Medicul de familie poate face o primă evaluare.")],
    reasoning="Simptomele raportate țin de căile respiratorii.",
    clarification_questions=[],
    warning_signs=["Mergeți la urgențe dacă apare dificultate mare la respirat."],
    recommended_next_step="Programați o consultație la pneumologie.",
)


# ─────────────────────────────────────────────────────────── catalog

def test_catalog_matches_the_migration_seed():
    sql = MIGRATION.read_text(encoding="utf-8")
    seeded = set(re.findall(r"\('([a-z_]+)',\s*'", sql.split("insert into public.medical_specialties", 1)[1].split(";", 1)[0]))
    assert seeded == set(specialty_catalog.BY_ID)


def test_manual_search_without_ai_ignores_diacritics():
    names = [s["id"] for s in client.get(f"{API}/specialties", params={"q": "neurolog"}).json()]
    assert names == ["neurology"]
    assert client.get(f"{API}/specialties", params={"q": "inimă"}).json()[0]["id"] == "cardiology"
    assert len(client.get(f"{API}/specialties").json()) == len(specialty_catalog.CATALOG)
    en = client.get(f"{API}/specialties", params={"q": "skin", "lang": "en"}).json()
    assert en[0] == {"id": "dermatology", "name": "Dermatology"}


# ─────────────────────────────────────────────────────────── emergency rules (no Gemini)

@pytest.mark.parametrize("text, code", [
    ("Am o durere puternică în piept de o oră", "chest_pain"),
    ("Nu pot să respir și mă sufoc", "breathing"),
    ("Mi s-a strâmbat gura și vorbesc greu", "stroke"),
    ("Tatăl meu a leșinat acum", "unconscious"),
    ("I have chest pain and feel sweaty", "chest_pain"),
    ("Mi s-a umflat gâtul după o înțepătură", "anaphylaxis"),
    ("Mă gândesc să mă sinucid", "suicidal"),
])
def test_red_flags_return_112_without_calling_gemini(monkeypatch, text, code):
    consent()
    fake = use_gemini(monkeypatch, DRAFT)
    body = triage(text).json()
    assert body["status"] == "emergency" and body["aiUsed"] is False
    assert body["emergency"]["level"] == "call_112" and code in body["emergency"]["codes"]
    assert body["specialties"] == [] and fake.calls == []


def test_emergency_works_even_without_consent_or_key(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    assert triage("chest pain since this morning").json()["status"] == "emergency"


def test_red_flag_in_a_clarification_answer_is_caught(monkeypatch):
    consent()
    fake = use_gemini(monkeypatch, DRAFT)
    body = triage("Tuse de câteva zile", answers=[{"question": "Mai aveți și altceva?", "answer": "nu pot sa respir"}]).json()
    assert body["status"] == "emergency" and fake.calls == []


@pytest.mark.parametrize("text", ["Nu am durere în piept, doar tuse", "no chest pain, just a cough", "fără leșin, doar amețeală"])
def test_negated_red_flags_are_not_emergencies(text):
    assert triage_safety.detect(text) == (None, [])


def test_urgent_signs_are_attached_to_the_ai_result(monkeypatch):
    consent()
    use_gemini(monkeypatch, DRAFT)
    body = triage("Am febră de 40 și tuse").json()
    assert body["status"] == "ok" and body["emergency"] == {"level": "urgent", "codes": ["high_fever"]}


# ─────────────────────────────────────────────────────────── consent, configuration, failures

def test_unconfirmed_symptoms_are_refused(monkeypatch):
    fake = use_gemini(monkeypatch, DRAFT)
    assert client.post(f"{API}/triage", json={"symptoms": "Tuse", "confirmed": False}).status_code == 422
    assert fake.calls == []


def test_no_ai_consent_means_nothing_is_sent(monkeypatch):
    fake = use_gemini(monkeypatch, DRAFT)
    body = triage("Tuse de două săptămâni").json()
    assert body["status"] == "no_consent" and fake.calls == []


def test_gemini_not_configured(monkeypatch):
    consent()
    monkeypatch.setattr(settings, "gemini_api_key", "")
    fake = use_gemini(monkeypatch, DRAFT)
    assert triage("Tuse de două săptămâni").json()["status"] == "not_configured" and fake.calls == []


@pytest.mark.parametrize("error", [gemini_client.GeminiTimeout(), gemini_client.GeminiFailed()])
def test_gemini_unavailable_returns_failed_and_manual_search_still_works(monkeypatch, error):
    consent()
    use_gemini(monkeypatch, error)
    body = triage("Tuse de două săptămâni").json()
    assert body["status"] == "failed" and body["specialties"] == []
    assert body["failureReason"] == ("timeout" if isinstance(error, gemini_client.GeminiTimeout) else "error")
    assert client.get(f"{API}/specialties/family_medicine/doctors").status_code == 200


def test_gemini_rate_limited_is_429(monkeypatch):
    consent()
    use_gemini(monkeypatch, gemini_client.GeminiRateLimited())
    assert triage("Tuse de două săptămâni").status_code == 429


# ─────────────────────────────────────────────────────────── AI output rules

def test_payload_is_minimal_and_history_only_with_consent(monkeypatch):
    consent()
    fake = use_gemini(monkeypatch, DRAFT)
    triage("Tuse de două săptămâni")
    sent = fake.calls[0]["contents"]
    assert '"history"' not in sent and "Maria" not in sent and '"catalog"' in sent
    body = triage("Tuse de două săptămâni", useHistory=True).json()
    sent = fake.calls[1]["contents"]
    assert body["historyUsed"] is True and '"history"' in sent and "Maria" not in sent and "Ionescu" not in sent


def test_ok_result_uses_catalog_names(monkeypatch):
    consent()
    use_gemini(monkeypatch, DRAFT)
    body = triage("Tuse de două săptămâni și oboseală").json()
    assert body["status"] == "ok" and body["aiUsed"] is True
    assert [s["id"] for s in body["specialties"]] == ["pulmonology", "family_medicine"]
    assert body["specialties"][0]["name"] == "Pneumologie"


def test_invented_specialties_and_doctors_are_dropped(monkeypatch):
    consent()
    use_gemini(monkeypatch, GeminiTriage(
        symptom_summary="Durere de genunchi.",
        suggested_specialties=[GeminiSpecialty(specialty_id="orthopedics", reason="Durerea articulară este evaluată de ortopedie."),
                               GeminiSpecialty(specialty_id="orthopedics", reason="duplicat"),
                               GeminiSpecialty(specialty_id="rheumatology", reason="Reumatologia evaluează articulațiile."),
                               GeminiSpecialty(specialty_id="family_medicine", reason="Primă evaluare."),
                               GeminiSpecialty(specialty_id="neurology", reason="Prea multe.")]))
    body = triage("Mă doare genunchiul de o lună").json()
    assert [s["id"] for s in body["specialties"]] == ["orthopedics", "rheumatology", "family_medicine"]
    assert body["discarded"] == 2  # duplicate + 4th specialty


def test_invented_ids_are_dropped(monkeypatch):
    consent()
    use_gemini(monkeypatch, GeminiTriage(symptom_summary="x", suggested_specialties=[
        GeminiSpecialty(specialty_id="sports_medicine_dr_popescu", reason="x"),
        GeminiSpecialty(specialty_id="orthopedics", reason="Durerea articulară este evaluată de ortopedie.")]))
    body = triage("Mă doare genunchiul de o lună").json()
    assert [s["id"] for s in body["specialties"]] == ["orthopedics"] and body["discarded"] == 1


def test_only_unknown_ids_fall_back_to_family_medicine(monkeypatch):
    consent()
    use_gemini(monkeypatch, GeminiTriage(symptom_summary="x", suggested_specialties=[GeminiSpecialty(specialty_id="magic", reason="x")]))
    assert [s["id"] for s in triage("Mă simt ciudat").json()["specialties"]] == ["family_medicine"]


def test_diagnoses_percentages_scores_and_treatment_are_removed(monkeypatch):
    consent()
    use_gemini(monkeypatch, GeminiTriage(
        symptom_summary="Aveți pneumonie.",
        suggested_specialties=[GeminiSpecialty(specialty_id="pulmonology", reason="Probabilitate 80% de infecție.")],
        reasoning="Scor de severitate 7/10.",
        warning_signs=["Luați paracetamol 500 mg.", "Mergeți la urgențe dacă febra nu scade."],
        recommended_next_step="Începeți tratament cu antibiotic."))
    body = triage("Tuse și febră").json()
    text = str(body).lower()
    for bad in ("pneumonie", "80%", "scor", "paracetamol", "antibiotic"):
        assert bad not in text
    assert body["specialties"][0]["id"] == "pulmonology" and body["specialties"][0]["reason"] == ""
    assert body["warningSigns"] == ["Mergeți la urgențe dacă febra nu scade."]
    assert body["discarded"] == 5


def test_ambiguous_symptoms_get_at_most_three_questions(monkeypatch):
    consent()
    use_gemini(monkeypatch, GeminiTriage(
        symptom_summary="Oboseală.", suggested_specialties=[GeminiSpecialty(specialty_id="family_medicine", reason="Evaluare generală.")],
        clarification_questions=["De când?", "Aveți febră?", "Ați slăbit?", "Dormiți bine?", "Altceva?"]))
    body = triage("Mă simt obosită").json()
    assert body["clarificationQuestions"] == ["De când?", "Aveți febră?", "Ați slăbit?"]
    answers = [{"question": q, "answer": "de o lună"} for q in body["clarificationQuestions"]]
    assert triage("Mă simt obosită", answers=answers).json()["clarificationQuestions"] == []
    assert triage("Mă simt obosită", answers=answers + answers[:1]).status_code == 422


def test_nothing_medical_is_logged(monkeypatch, caplog):
    consent()
    use_gemini(monkeypatch, DRAFT)
    with caplog.at_level(logging.DEBUG):
        triage("Tuse foarte specifică XYZ123")
    assert "XYZ123" not in caplog.text


def test_schema_sent_to_gemini_has_no_length_keywords():
    schema = str(gemini_client.gemini_schema(GeminiTriage))
    assert "maxLength" not in schema and "maxItems" not in schema and "specialty_id" in schema


# ─────────────────────────────────────────────────────────── doctors & booking (demo store)

def test_doctors_for_a_specialty_with_real_availability():
    docs = client.get(f"{API}/specialties/pulmonology/doctors").json()
    assert [d["id"] for d in docs] == ["doc_demo_002"] and docs[0]["freeSlots"] > 0 and docs[0]["nextSlot"]


def test_no_doctors_and_no_availability_cases():
    assert client.get(f"{API}/specialties/dermatology/doctors").json() == []
    neuro = client.get(f"{API}/specialties/neurology/doctors").json()
    assert neuro[0]["freeSlots"] == 0 and neuro[0]["nextSlot"] is None
    assert client.get(f"{API}/specialties/not_a_specialty/doctors").status_code == 404


def _book(doctor="doc_demo_002", specialty="pulmonology"):
    slot = client.get(f"{API}/doctors/{doctor}/slots").json()[0]
    res = client.post(f"{API}/appointments", json={"slotId": slot["id"], "specialtyId": specialty, "note": "Tuse (fictiv)"})
    return slot, res


def test_full_flow_request_propose_accept():
    slot, res = _book("doc_demo_001", "cardiology")
    assert res.status_code == 201
    appt = res.json()
    assert appt["status"] == "requested" and appt["startsAt"] == slot["startsAt"] and appt["specialtyName"] == "Cardiologie"
    # the booked slot is no longer offered
    assert slot["id"] not in [s["id"] for s in client.get(f"{API}/doctors/doc_demo_001/slots").json()]
    assert client.post(f"{API}/appointments", json={"slotId": slot["id"]}).status_code == 409

    inbox = client.get(f"{API}/doctor/appointments").json()
    assert inbox[0]["id"] == appt["id"] and inbox[0]["patientName"] == "Maria Ionescu"
    other = client.get(f"{API}/doctor/free-slots").json()[0]
    proposed = client.post(f"{API}/doctor/appointments/{appt['id']}/respond",
                           json={"action": "propose", "slotId": other["id"], "note": "Mai târziu"}).json()
    assert proposed["status"] == "proposed" and proposed["proposedStartsAt"] == other["startsAt"]
    # responding twice is not allowed
    assert client.post(f"{API}/doctor/appointments/{appt['id']}/respond", json={"action": "accept"}).status_code == 409

    done = client.post(f"{API}/appointments/{appt['id']}/action", json={"action": "accept_proposal"}).json()
    assert done["status"] == "confirmed" and done["startsAt"] == other["startsAt"] and done["proposedStartsAt"] is None


def test_doctor_accepts_or_rejects_and_patient_cancels():
    _, res = _book("doc_demo_001", "family_medicine")
    a = res.json()
    assert client.post(f"{API}/doctor/appointments/{a['id']}/respond", json={"action": "accept"}).json()["status"] == "confirmed"
    assert client.post(f"{API}/appointments/{a['id']}/action", json={"action": "cancel"}).json()["status"] == "cancelled"
    assert client.post(f"{API}/appointments/{a['id']}/action", json={"action": "cancel"}).status_code == 409

    _, res = _book("doc_demo_001", "family_medicine")
    b = res.json()
    assert client.post(f"{API}/doctor/appointments/{b['id']}/respond", json={"action": "reject"}).json()["status"] == "rejected"
    assert client.post(f"{API}/doctor/appointments/{b['id']}/respond", json={"action": "propose"}).status_code == 422


def test_patient_declines_a_proposal_and_doctor_cannot_answer_other_doctors_requests():
    _, res = _book()  # addressed to doc_demo_002; the demo doctor is doc_demo_001
    a = res.json()
    assert client.post(f"{API}/doctor/appointments/{a['id']}/respond", json={"action": "accept"}).status_code == 404
    assert client.post(f"{API}/appointments/{a['id']}/action", json={"action": "accept_proposal"}).status_code == 409
    assert client.post(f"{API}/appointments/{a['id']}/action", json={"action": "decline_proposal"}).status_code == 409


def test_doctor_publishes_and_removes_availability():
    from datetime import UTC, datetime, timedelta
    day = (datetime.now(UTC) + timedelta(days=20)).replace(hour=12, minute=0, second=0, microsecond=0)
    res = client.post(f"{API}/doctor/availability", json={"startsAt": day.isoformat(),
                                                          "endsAt": (day + timedelta(hours=2)).isoformat(), "slotMinutes": 30})
    assert res.status_code == 201 and res.json() == {"added": 4}
    again = client.post(f"{API}/doctor/availability", json={"startsAt": day.isoformat(),
                                                            "endsAt": (day + timedelta(hours=2)).isoformat(), "slotMinutes": 30})
    assert again.json() == {"added": 0}
    mine = [s for s in client.get(f"{API}/doctor/availability").json() if s["startsAt"].startswith(day.date().isoformat())]
    assert len(mine) == 4
    assert client.delete(f"{API}/doctor/availability/{mine[0]['id']}").status_code == 204
    past = client.post(f"{API}/doctor/availability", json={"startsAt": "2020-01-01T10:00:00+00:00",
                                                           "endsAt": "2020-01-01T11:00:00+00:00"})
    assert past.status_code == 422
    naive = client.post(f"{API}/doctor/availability", json={"startsAt": day.replace(tzinfo=None).isoformat(),
                                                            "endsAt": (day + timedelta(hours=1)).replace(tzinfo=None).isoformat()})
    assert naive.status_code == 422


# ─────────────────────────────────────────────────────────── Supabase mode

def test_missing_migration_is_503(supabase_mode, monkeypatch):  # noqa: F811
    monkeypatch.setattr(supabase_repo, "get_role", lambda _u: "patient")

    class Res:
        status_code = 404

    monkeypatch.setattr(supabase_repo, "_request", lambda *a, **k: Res())
    r = supabase_mode.get(f"{API}/specialties/cardiology/doctors", headers=auth(make_token()))
    assert r.status_code == 503


def test_supabase_status_mapping(supabase_mode, monkeypatch):  # noqa: F811
    monkeypatch.setattr(supabase_repo, "request_appointment", lambda *a: {"status": "slot_unavailable"})
    r = supabase_mode.post(f"{API}/appointments", json={"slotId": "x"}, headers=auth(make_token()))
    assert r.status_code == 409
    monkeypatch.setattr(supabase_repo, "request_appointment", lambda *a: {"status": "not_patient"})
    assert supabase_mode.post(f"{API}/appointments", json={"slotId": "x"}, headers=auth(make_token())).status_code == 403


def test_doctor_routes_need_the_doctor_role(supabase_mode, monkeypatch):  # noqa: F811
    monkeypatch.setattr(supabase_repo, "get_role", lambda _u: "patient")
    assert supabase_mode.get(f"{API}/doctor/appointments", headers=auth(make_token())).status_code == 403


def test_service_rejects_unconfirmed_directly():
    from app.core.security import CurrentUser
    from app.schemas.smart_care import TriageRequest
    with pytest.raises(ValueError):
        smart_care_service.triage(CurrentUser(id=DEMO_PATIENT_ID, role="patient"),
                                  TriageRequest(symptoms="Tuse", confirmed=False))


def test_transcribe_needs_explicit_elevenlabs_consent(monkeypatch):
    files = {"file": ("v.m4a", b"fake-audio", "audio/mp4")}
    assert client.post(f"{API}/transcribe", files=files).status_code == 422
    monkeypatch.setattr(settings, "elevenlabs_api_key", "")
    body = client.post(f"{API}/transcribe", files=files, data={"elevenlabsConsent": "true"}).json()
    assert body["isDemo"] is True and body["transcript"]


def test_transcribe_uses_only_elevenlabs(monkeypatch):
    from app.services import intake_service
    monkeypatch.setattr(settings, "elevenlabs_api_key", "test-not-real")
    calls = []

    async def fake(audio, name, ctype):
        calls.append(name)
        return "Tuse de o săptămână", "ro"

    monkeypatch.setattr(intake_service, "transcribe", fake)
    monkeypatch.setattr(intake_service, "structure", lambda *_: (_ for _ in ()).throw(AssertionError("no Gemini")))
    body = client.post(f"{API}/transcribe", files={"file": ("v.m4a", b"x", "audio/mp4")}, data={"elevenlabsConsent": "true"}).json()
    assert body == {"transcript": "Tuse de o săptămână", "language": "ro", "isDemo": False} and calls == ["v.m4a"]



# ─────────────────────────────────────────────────────────── real client: retries and repair (fake SDK, no network)

def _fake_sdk(monkeypatch, behaviour):
    from types import SimpleNamespace

    from google import genai

    class FakeClient:
        def __init__(self, **kwargs):
            self.models = SimpleNamespace(generate_content=behaviour)

        def close(self):
            pass

    monkeypatch.setattr(genai, "Client", FakeClient)


def _api_error(code):
    from google.genai import errors
    return errors.APIError(code, {"error": {"code": code, "message": "fictive", "status": "UNAVAILABLE"}})


VALID = '{"symptom_summary": "Tuse.", "suggested_specialties": [{"specialty_id": "pulmonology", "reason": "Tuse persistentă."}]}'


def test_overloaded_gemini_is_retried(monkeypatch):
    from types import SimpleNamespace
    monkeypatch.setattr(gemini_client, "RETRY_DELAYS", (0, 0))
    calls = []

    def flaky(**_k):
        calls.append(1)
        if len(calls) < 3:
            raise _api_error(503)
        return SimpleNamespace(text=VALID)

    _fake_sdk(monkeypatch, flaky)
    consent()
    body = triage("Tuse de două săptămâni").json()
    assert body["status"] == "ok" and body["specialties"][0]["id"] == "pulmonology" and len(calls) == 3


def test_still_overloaded_after_retries_is_busy(monkeypatch):
    monkeypatch.setattr(gemini_client, "RETRY_DELAYS", (0, 0))
    calls = []

    def down(**_k):
        calls.append(1)
        raise _api_error(503)

    _fake_sdk(monkeypatch, down)
    consent()
    body = triage("Tuse de două săptămâni").json()
    assert body["status"] == "failed" and body["failureReason"] == "busy" and len(calls) == 3


def test_bad_request_is_not_retried(monkeypatch):
    calls = []

    def bad(**_k):
        calls.append(1)
        raise _api_error(400)

    _fake_sdk(monkeypatch, bad)
    consent()
    assert triage("Tuse de două săptămâni").json()["failureReason"] == "error" and len(calls) == 1


def test_over_long_answer_is_trimmed_not_rejected(monkeypatch):
    import json as _json
    from types import SimpleNamespace
    answer = {"symptom_summary": "x" * 900, "reasoning": "y" * 1200,
              "suggested_specialties": [{"specialty_id": "pulmonology", "reason": "z" * 500}] * 7,
              "clarification_questions": ["De când?"] * 8, "warning_signs": ["Semn."] * 9, "recommended_next_step": "w" * 400,
              "extra_field": "ignored"}
    _fake_sdk(monkeypatch, lambda **_k: SimpleNamespace(text=_json.dumps(answer)))
    consent()
    body = triage("Tuse de două săptămâni").json()
    assert body["status"] == "ok" and [s["id"] for s in body["specialties"]] == ["pulmonology"]
    assert len(body["clarificationQuestions"]) == 3 and len(body["symptomSummary"]) == 600


def test_non_json_answer_is_invalid(monkeypatch):
    from types import SimpleNamespace
    _fake_sdk(monkeypatch, lambda **_k: SimpleNamespace(text="nu e JSON"))
    consent()
    assert triage("Tuse de două săptămâni").json()["failureReason"] == "invalid"
