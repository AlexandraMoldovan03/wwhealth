"""Care Journey — every patient, doctor, medication and value here is FICTIVE. Gemini is faked; no network."""
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import CurrentUser
from app.main import app
from app.schemas.care import DoseMark, TreatmentCreate, TreatmentEnd, TreatmentUpdate, WeeklyHours
from app.schemas.doctor_access import GrantRequest
from app.services import (
    appointment_service,
    care_insights_service,
    consultation_service,
    doctor_access_service,
    fhir_service,
    gemini_client,
    intelligence_service,
    patient_service,
    record_views,
    schedule_service,
    supabase_repo,
    treatment_service,
)
from app.services.demo_data import DEMO_PATIENT_ID, demo_patient
from tests.test_supabase_auth import auth, make_token, supabase_mode  # noqa: F401  (fixture)

client = TestClient(app)
API = "/api/v1/care"
CARE = "/api/v1/smart-care"
DOCTOR = CurrentUser(id="doc_demo_001", role="doctor")
OTHER_DOCTOR = CurrentUser(id="doc_demo_999", role="doctor")
PATIENT = CurrentUser(id=DEMO_PATIENT_ID, role="patient")
MIGRATION = Path(__file__).resolve().parents[2] / "supabase/migrations/20261118000000_care_journey.sql"
WEEK = [{"weekday": d, "kind": "work", "start": "08:00", "end": "12:00"} for d in range(1, 8)]


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    for svc in (appointment_service, schedule_service, treatment_service, consultation_service, doctor_access_service,
                intelligence_service):
        svc.reset_demo()
    monkeypatch.setitem(patient_service._patients, DEMO_PATIENT_ID, demo_patient())
    monkeypatch.setattr(settings, "gemini_api_key", "test-key-not-real")
    yield
    for svc in (appointment_service, schedule_service, treatment_service, consultation_service, doctor_access_service):
        svc.reset_demo()


def grant(scopes=("profile", "documents", "labs")):
    return doctor_access_service.grant(PATIENT, GrantRequest(doctor_id="doc_demo_001", scopes=list(scopes), duration_hours=24))


def today_iso(offset=0) -> str:
    return (datetime.now(UTC).astimezone(schedule_service.zone("Europe/Bucharest")).date() + timedelta(days=offset)).isoformat()


def plan_body(**over) -> dict:
    body = {"patientId": DEMO_PATIENT_ID, "kind": "prescription", "medicationName": "Medicament Exemplu",
            "strength": "5 mg", "dosageForm": "comprimat", "doseAmount": 1, "doseUnit": "comprimat", "route": "oral",
            "scheduleType": "fixed_times", "timesOfDay": ["20:00", "08:00"], "startDate": today_iso(),
            "endDate": today_iso(10), "instructions": "După masă."}
    body.update(over)
    return body


# ─────────────────────────────────────────────────────────── 1. slots from the weekly schedule

def test_slots_exclude_breaks_and_days_without_hours():
    hours = [WeeklyHours(weekday=1, start="08:00", end="12:00"), WeeklyHours(weekday=1, kind="break", start="10:00", end="10:30")]
    now = datetime(2026, 11, 15, 12, 0, tzinfo=UTC)  # Sunday
    slots = schedule_service.generate_slots(hours, "Europe/Bucharest", 30, 7, now)
    tz = schedule_service.zone("Europe/Bucharest")
    local = [s.astimezone(tz) for s, _ in slots]
    assert local and all(d.isoweekday() == 1 for d in local)
    assert not any(d.hour == 10 and d.minute == 0 for d in local)
    assert len([d for d in local if d.date() == date(2026, 11, 16)]) == 7  # 8 slots minus the break


def test_slots_follow_the_daylight_saving_change():
    hours = [WeeklyHours(weekday=d, start="09:00", end="10:00") for d in range(1, 8)]
    now = datetime(2027, 3, 26, 0, 0, tzinfo=UTC)  # Romania moves to summer time on 28 March 2027
    slots = {s.date(): s for s, _ in schedule_service.generate_slots(hours, "Europe/Bucharest", 60, 4, now)}
    assert slots[date(2027, 3, 27)].hour == 7   # 09:00 EET  = 07:00 UTC
    assert slots[date(2027, 3, 29)].hour == 6   # 09:00 EEST = 06:00 UTC


def test_invalid_timezone_and_overlapping_hours_are_rejected():
    r = client.put(f"{API}/doctor/schedule", json={"timezone": "Mars/Olympus", "slotMinutes": 30, "hours": WEEK})
    assert r.status_code == 422
    r = client.put(f"{API}/doctor/schedule", json={"timezone": "Europe/Bucharest", "slotMinutes": 30, "hours": [
        {"weekday": 1, "start": "08:00", "end": "12:00"}, {"weekday": 1, "start": "11:00", "end": "13:00"}]})
    assert r.status_code == 422 and "overlapping" in r.json()["detail"]


# ─────────────────────────────────────────────────────────── 2. agenda, availability, overlaps

def _save_week(slot_minutes=30):
    r = client.put(f"{API}/doctor/schedule", json={"timezone": "Europe/Bucharest", "slotMinutes": slot_minutes,
                                                   "horizonDays": 14, "hours": WEEK})
    assert r.status_code == 200, r.text
    return r.json()


def test_schedule_generates_bookable_slots_and_agenda():
    res = _save_week()
    assert res["added"] > 0 and res["schedule"]["configured"]
    slots = client.get(f"{CARE}/doctors/doc_demo_001/slots").json()
    first = slots[0]
    booked = client.post(f"{CARE}/appointments", json={"slotId": first["id"], "specialtyId": "cardiology", "note": "Control"})
    assert booked.status_code == 201
    # same slot again → refused (no overlapping bookings)
    again = client.post(f"{CARE}/appointments", json={"slotId": first["id"], "specialtyId": None, "note": None})
    assert again.status_code == 409
    now = datetime.now(UTC)
    agenda = client.get(f"{API}/doctor/agenda", params={"from": now.isoformat(), "to": (now + timedelta(days=14)).isoformat()}).json()
    assert [a["id"] for a in agenda["appointments"]] == [booked.json()["id"]]
    assert any(s["booked"] for s in agenda["slots"]) and any(not s["booked"] for s in agenda["slots"])


def test_schedule_change_keeps_booked_slots_and_confirmed_appointments():
    _save_week()
    slot = client.get(f"{CARE}/doctors/doc_demo_001/slots").json()[0]
    appt = client.post(f"{CARE}/appointments", json={"slotId": slot["id"], "specialtyId": None, "note": None}).json()
    client.post(f"{CARE}/doctor/appointments/{appt['id']}/respond", json={"action": "accept"})
    res = client.put(f"{API}/doctor/schedule", json={"timezone": "Europe/Bucharest", "slotMinutes": 60, "horizonDays": 14,
                                                     "hours": [{"weekday": 6, "start": "15:00", "end": "16:00"}]})
    assert res.status_code == 200 and res.json()["removed"] > 0
    assert any(s.id == slot["id"] for s in appointment_service._slots)  # booked slot kept
    mine = client.get(f"{CARE}/appointments").json()
    assert mine[0]["status"] == "confirmed" and mine[0]["startsAt"] == slot["startsAt"]


def test_time_off_hides_slots_blocks_booking_and_reports_conflicts():
    _save_week()
    slots = client.get(f"{CARE}/doctors/doc_demo_001/slots").json()
    booked = client.post(f"{CARE}/appointments", json={"slotId": slots[0]["id"], "specialtyId": None, "note": None}).json()
    day_start, day_end = slots[0]["startsAt"], (datetime.fromisoformat(slots[0]["startsAt"]) + timedelta(hours=6)).isoformat()
    r = client.post(f"{API}/doctor/time-off", json={"kind": "day_off", "startsAt": day_start, "endsAt": day_end})
    assert r.status_code == 201 and r.json()["conflicts"] == 1  # reported, NOT cancelled
    after = client.get(f"{CARE}/doctors/doc_demo_001/slots").json()
    assert slots[1]["id"] not in {s["id"] for s in after}
    assert client.post(f"{CARE}/appointments", json={"slotId": slots[1]["id"], "specialtyId": None, "note": None}).status_code == 409
    assert client.get(f"{CARE}/appointments").json()[0]["id"] == booked["id"]
    assert client.delete(f"{API}/doctor/time-off/{r.json()['timeOff']['id']}").status_code == 204
    assert slots[1]["id"] in {s["id"] for s in client.get(f"{CARE}/doctors/doc_demo_001/slots").json()}


def test_doctor_endpoints_refuse_patients(supabase_mode, monkeypatch):  # noqa: F811
    monkeypatch.setattr(supabase_repo, "get_role", lambda user: "patient")
    token = auth(make_token())
    assert supabase_mode.get(f"{API}/doctor/schedule", headers=token).status_code == 403
    assert supabase_mode.post(f"{API}/doctor/treatments", headers=token, json=plan_body()).status_code == 403
    assert supabase_mode.get(f"{API}/doctor/consultations/x", headers=token).status_code == 403


# ─────────────────────────────────────────────────────────── 3. consultation sheet

def _booked_appointment() -> dict:
    slot = next(s for s in appointment_service._demo_free("doc_demo_001"))
    return client.post(f"{CARE}/appointments", json={"slotId": slot.id, "specialtyId": "pulmonology", "note": None}).json()


def test_preparation_goes_only_to_the_appointment_doctor_and_record_needs_consent():
    appt = _booked_appointment()
    prep = {"reason": "Tuse persistentă", "symptoms": "Tuse seara de 2 săptămâni", "questions": ["Pot face sport?", " "]}
    r = client.put(f"{API}/appointments/{appt['id']}/preparation", json=prep)
    assert r.status_code == 200 and r.json()["questions"] == ["Pot face sport?"]
    sheet = client.get(f"{API}/doctor/consultations/{appt['id']}").json()
    assert sheet["preparation"]["reason"] == "Tuse persistentă"
    assert sheet["grant"] is None and sheet["allergies"] is None and sheet["documents"] is None  # no consent → nothing
    with pytest.raises(consultation_service.NotFound):
        consultation_service.sheet(OTHER_DOCTOR, appt["id"], "ro")
    grant(("profile",))
    sheet = client.get(f"{API}/doctor/consultations/{appt['id']}").json()
    assert sheet["grant"]["status"] == "active"
    assert sheet["allergies"][0]["substance"] == "Penicillin"
    assert sheet["declaredMedication"][0]["name"] == "Budesonide inhaler"
    assert sheet["documents"] is None and sheet["labs"] is None  # only the shared sections


# ─────────────────────────────────────────────────────────── 4. prescriptions & treatments

def test_prescription_needs_explicit_access():
    r = client.post(f"{API}/doctor/treatments", json=plan_body())
    assert r.status_code == 403 and "not granted" in r.json()["detail"]


def test_create_update_end_with_full_version_history():
    grant()
    created = client.post(f"{API}/doctor/treatments", json=plan_body())
    assert created.status_code == 201, created.text
    plan = created.json()
    assert plan["status"] == "ACTIVE" and plan["current"]["timesOfDay"] == ["08:00", "20:00"] and plan["canEdit"]
    upd = client.put(f"{API}/doctor/treatments/{plan['id']}", json={**plan_body(doseAmount=2), "reason": "Doză ajustată"})
    assert upd.status_code == 200
    hist = upd.json()["history"]
    assert [v["version"] for v in hist] == [2, 1] and hist[0]["doseAmount"] == 2 and hist[1]["doseAmount"] == 1
    assert hist[0]["changeReason"] == "Doză ajustată" and hist[0]["changedByName"] == "Dr. Alex Test"
    with pytest.raises(treatment_service.Forbidden):
        treatment_service.update(OTHER_DOCTOR, plan["id"], TreatmentUpdate(**{k: v for k, v in plan_body().items()
                                                                               if k not in ("patientId", "kind")}))
    ended = client.post(f"{API}/doctor/treatments/{plan['id']}/end", json={"status": "discontinued", "reason": "Oprit"})
    assert ended.json()["status"] == "DISCONTINUED" and len(ended.json()["history"]) == 3
    assert client.put(f"{API}/doctor/treatments/{plan['id']}", json=plan_body()).status_code == 409
    overview = client.get(f"{API}/treatments").json()
    assert overview["active"] == [] and overview["finished"][0]["id"] == plan["id"]
    assert overview["declared"][0]["name"] == "Budesonide inhaler"  # patient-declared, kept apart


def test_as_needed_has_no_hours_and_fixed_times_need_hours():
    grant()
    assert client.post(f"{API}/doctor/treatments", json=plan_body(scheduleType="as_needed")).status_code == 422
    assert client.post(f"{API}/doctor/treatments", json=plan_body(timesOfDay=[])).status_code == 422
    ok = client.post(f"{API}/doctor/treatments", json=plan_body(scheduleType="as_needed", timesOfDay=[]))
    assert ok.status_code == 201
    assert client.get(f"{API}/reminders").json()["doses"] == []  # no invented reminder times


@pytest.mark.parametrize(("stored", "start", "end", "expected"), [
    ("active", "2026-11-20", None, "UPCOMING"),
    ("active", "2026-11-01", "2026-11-10", "COMPLETED"),
    ("active", "2026-11-01", "2026-11-30", "ACTIVE"),
    ("active", "2026-11-14", "2026-11-14", "ACTIVE"),
    ("discontinued", "2026-11-01", None, "DISCONTINUED"),
    ("cancelled", "2026-11-20", None, "CANCELLED"),
])
def test_treatment_status(stored, start, end, expected):
    assert treatment_service.compute_status(stored, start, end, date(2026, 11, 14)) == expected


# ─────────────────────────────────────────────────────────── 5. reminders & doses

def test_reminders_marks_and_rebuild_after_a_prescription_change():
    grant()
    plan = client.post(f"{API}/doctor/treatments", json=plan_body(timesOfDay=["00:01", "23:59"])).json()
    first = client.get(f"{API}/reminders").json()
    assert first["doses"] and all(d["planId"] == plan["id"] for d in first["doses"])
    assert len(first["doses"]) <= treatment_service.MAX_REMINDERS
    # arbitrary time → refused; documented time → stored as the patient's report
    assert client.post(f"{API}/doses", json={"planId": plan["id"], "scheduledFor": "2026-11-14T13:37:00Z", "status": "taken"}).status_code == 422
    dose = first["doses"][0]
    marked = client.post(f"{API}/doses", json={"planId": plan["id"], "scheduledFor": dose["scheduledFor"], "status": "skipped"})
    assert marked.status_code == 200 and marked.json()["status"] == "skipped"
    second = client.get(f"{API}/reminders").json()
    assert dose["scheduledFor"] not in {d["scheduledFor"] for d in second["doses"]}
    # a dose change → new hash → the app cancels old notifications and schedules the new ones
    client.put(f"{API}/doctor/treatments/{plan['id']}", json=plan_body(timesOfDay=["12:00"]))
    third = client.get(f"{API}/reminders").json()
    assert third["plansHash"] != first["plansHash"]
    assert {datetime.fromisoformat(d["scheduledFor"].replace("Z", "+00:00")).astimezone(
        schedule_service.zone("Europe/Bucharest")).strftime("%H:%M") for d in third["doses"]} == {"12:00"}
    client.post(f"{API}/doctor/treatments/{plan['id']}/end", json={"status": "cancelled"})
    assert client.get(f"{API}/reminders").json()["doses"] == []  # ended plan → old reminders cancelled


def test_dose_times_across_daylight_saving_and_time_zones():
    grant()
    plan = treatment_service.create(DOCTOR, TreatmentCreate(**plan_body(startDate="2027-03-27", endDate="2027-03-29",
                                                                        timesOfDay=["08:00"])))
    start, end = datetime(2027, 3, 26, tzinfo=UTC), datetime(2027, 3, 31, tzinfo=UTC)
    times = treatment_service.dose_times(plan, "Europe/Bucharest", start, end)
    assert [t.hour for t in times] == [6, 5, 5]  # 08:00 EET, then 08:00 EEST
    assert [t.hour for t in treatment_service.dose_times(plan, "Europe/London", start, end)] == [8, 7, 7]


def test_missed_doses_are_never_rescheduled_or_doubled():
    grant()
    plan = treatment_service.create(DOCTOR, TreatmentCreate(**plan_body(startDate=today_iso(-2), timesOfDay=["08:00"])))
    now = datetime.now(UTC)
    future = treatment_service.dose_times(plan, "Europe/Bucharest", now, now + timedelta(days=2))
    per_day = {}
    for t in future:
        per_day[t.date()] = per_day.get(t.date(), 0) + 1
    assert max(per_day.values()) == 1


def test_patient_cannot_mark_doses_of_someone_else():
    grant()
    plan = client.post(f"{API}/doctor/treatments", json=plan_body()).json()
    stranger = CurrentUser(id="pat_other", role="patient")
    with pytest.raises(treatment_service.NotFound):
        treatment_service.mark_dose(stranger, DoseMark(planId=plan["id"], scheduledFor=datetime.now(UTC).isoformat(), status="taken"))


# ─────────────────────────────────────────────────────────── 6. intelligent record

def test_relevance_pins_allergies_and_active_treatments_then_matches_reason():
    grant()
    client.post(f"{API}/doctor/treatments", json=plan_body())
    rec = client.get(f"{API}/record", params={"view": "relevance", "reason": "asthma control"}).json()
    first = [i["category"] for i in rec["items"][:3]]
    assert first[0] == "allergies" and set(first[1:]) == {"medication"}
    asthma = next(i for i in rec["items"] if i["category"] == "conditions")
    assert asthma["relevanceReason"] == "matches_reason" and asthma["verification"] == "patient_declared"
    assert not rec["insufficient"]
    nothing = client.get(f"{API}/record", params={"view": "relevance", "reason": "durere de genunchi"}).json()
    assert nothing["insufficient"] and nothing["items"][0]["category"] == "allergies"  # still never hidden


def test_chronological_and_category_views_keep_provenance_and_skip_empty_sections():
    grant()
    client.post(f"{API}/doctor/treatments", json=plan_body())
    chrono = client.get(f"{API}/record", params={"view": "chronological"}).json()["items"]
    dated = [i["date"] for i in chrono if i["date"]]
    assert dated == sorted(dated, reverse=True)
    prescribed = next(i for i in chrono if i["verification"] == "doctor_prescribed")
    assert prescribed["author"] == "Dr. Alex Test" and prescribed["provenance"] == "treatment_plans"
    doc = next(i for i in chrono if i["documentId"])
    assert doc["source"] == "uploaded_document" and doc["documentType"] == "lab_result"
    cats = [s["category"] for s in client.get(f"{API}/record", params={"view": "category"}).json()["sections"]]
    assert "allergies" in cats and "vaccinations" not in cats and "family_history" not in cats


def test_doctor_record_view_needs_consent():
    assert client.get(f"{API}/doctor/patients/{DEMO_PATIENT_ID}/record").status_code == 403
    grant(("documents",))
    rec = client.get(f"{API}/doctor/patients/{DEMO_PATIENT_ID}/record", params={"view": "category"}).json()
    assert {s["category"] for s in rec["sections"]} <= {"labs", "investigations", "hospitalizations", "medication"}
    assert all(i["verification"] == "document" for s in rec["sections"] for i in s["items"])


# ─────────────────────────────────────────────────────────── 7. FHIR

def test_fhir_bundle_maps_resources_without_inventing_codes():
    grant()
    client.post(f"{API}/doctor/treatments", json=plan_body())
    client.post(f"{API}/doctor/treatments", json=plan_body(kind="instructions", scheduleType="as_needed", timesOfDay=[]))
    b = client.get(f"{API}/fhir").json()
    types = [e["resource"]["resourceType"] for e in b["entry"]]
    assert b["resourceType"] == "Bundle" and "MedicationAdministration" not in types
    requests = [e["resource"] for e in b["entry"] if e["resource"]["resourceType"] == "MedicationRequest"]
    assert {r["intent"] for r in requests} == {"order", "plan"}
    assert all("CNAS" in r["note"][0]["text"] for r in requests)
    order = next(r for r in requests if r["intent"] == "order")
    assert order["dosageInstruction"][0]["timing"]["repeat"]["timeOfDay"] == ["08:00:00", "20:00:00"]
    assert "coding" not in order["medicationCodeableConcept"]
    statement = next(e["resource"] for e in b["entry"] if e["resource"]["resourceType"] == "MedicationStatement")
    patient_url = next(e["fullUrl"] for e in b["entry"] if e["resource"]["resourceType"] == "Patient")
    assert statement["informationSource"]["reference"] == patient_url  # resolves inside the Bundle
    fhir_service.validate(b)
    cond = next(e["resource"] for e in b["entry"] if e["resource"]["resourceType"] == "Condition")
    assert cond["code"]["coding"][0] == {"system": "http://hl7.org/fhir/sid/icd-10", "code": "J45.30"}
    assert {"AllergyIntolerance", "DocumentReference", "Patient"} <= set(types)


def test_fhir_dose_reports_are_statements_not_administrations():
    b = fhir_service.bundle("p1", None, None, None, None, None,
                            [{"plan_id": "plan-1", "scheduled_for": "2026-11-14T06:00:00Z", "status": "taken"}])
    res = b["entry"][1]["resource"]
    assert res["resourceType"] == "MedicationStatement" and res["status"] == "completed"
    assert res["basedOn"][0]["reference"] == "MedicationRequest/mr-plan-1"


def test_doctor_fhir_needs_consent():
    assert client.get(f"{API}/doctor/patients/{DEMO_PATIENT_ID}/fhir").status_code == 403
    grant(("profile",))
    types = {e["resource"]["resourceType"] for e in client.get(f"{API}/doctor/patients/{DEMO_PATIENT_ID}/fhir").json()["entry"]}
    assert "DocumentReference" not in types and "AllergyIntolerance" in types


# ─────────────────────────────────────────────────────────── 8. AI care insights (Gemini faked)

def _draft(**over):
    base = {
        "general_summary": {"text": "Astm documentat; alergie la Penicillin.", "source_ids": ["condition:dg1", "allergy:al1"]},
        "patient_summary": {"text": "Aveți documentat astm și o alergie.", "source_ids": ["condition:dg1"]},
        "clinical_summary": {"text": "Astm (J45.30), activ.", "source_ids": ["condition:dg1"]},
        "consultation_summary": {"text": "Pentru tuse: astm documentat.", "source_ids": ["condition:dg1"]},
        "timeline": [{"date": "2019-03-02", "title": "Astm diagnosticat", "source_ids": ["condition:dg1"]},
                     {"date": "2001-01-01", "title": "Inventat", "source_ids": ["condition:dg1"]}],
        "categories": [{"category": "allergies", "source_ids": ["allergy:al1", "ghost"]}, {"category": "made_up", "source_ids": ["allergy:al1"]}],
        "missing_information": ["Lipsește intervalul de referință"],
        "contradictions": [{"text": "O singură sursă", "source_ids": ["condition:dg1"]}],
        "terms": [{"term": "asthma", "explanation": "Afecțiune a căilor respiratorii."},
                  {"term": "sarcoidoza", "explanation": "Nu apare în dosar."}],
    }
    base.update(over)
    return care_insights_service.GeminiCareInsights.model_validate(base)


def test_insights_are_grounded_in_sources(monkeypatch):
    intelligence_service.set_consent(PATIENT, True)
    calls = []
    monkeypatch.setattr(gemini_client, "generate_structured", lambda *a, **k: calls.append(a) or _draft(
        clinical_summary={"text": "Risc crescut de complicații.", "source_ids": ["condition:dg1"]},
        patient_summary={"text": "Fără surse.", "source_ids": ["ghost"]}))
    r = client.post(f"{API}/insights", json={"language": "ro", "reason": "tuse"}).json()
    assert r["status"] == "ok" and r["generalSummary"]["sourceIds"] == ["condition:dg1", "allergy:al1"]
    assert r["clinicalSummary"] is None and r["patientSummary"] is None  # risk language / no sources dropped
    assert [e["date"] for e in r["timeline"]] == ["2019-03-02"]
    assert r["categories"] == {"allergies": ["allergy:al1"]}
    assert r["contradictions"] == [] and [t["term"] for t in r["terms"]] == ["asthma"]
    assert r["discardedStatements"] >= 4
    payload = calls[0][2]
    assert "Maria" not in payload and "1991-04-17" not in payload  # no name / birth date sent


def test_insights_need_consent_and_skip_gemini_on_emergency(monkeypatch):
    monkeypatch.setattr(gemini_client, "generate_structured", lambda *a, **k: pytest.fail("Gemini must not be called"))
    assert client.post(f"{API}/insights", json={"language": "ro"}).json()["status"] == "no_consent"
    intelligence_service.set_consent(PATIENT, True)
    r = client.post(f"{API}/insights", json={"language": "ro", "reason": "durere în piept și nu pot respira"}).json()
    assert r["status"] == "emergency" and r["emergency"]["level"] == "call_112"


def test_doctor_insights_need_grant(monkeypatch):
    monkeypatch.setattr(gemini_client, "generate_structured", lambda *a, **k: pytest.fail("Gemini must not be called"))
    assert client.post(f"{API}/doctor/patients/{DEMO_PATIENT_ID}/insights", json={"language": "ro"}).json()["status"] == "none"


# ─────────────────────────────────────────────────────────── 9. relevance helpers + migration

def test_relevance_is_not_a_severity_score():
    items = record_views.build_items(demo_patient(), [], [], [], [])
    rec = record_views.organize(items, "relevance", "HIV", None)
    assert all(i.relevance_reason in (None, "allergy_always", "active_treatment_always", "matches_reason", "matches_specialty")
               for i in rec.items)
    assert rec.insufficient


def test_migration_enforces_overlaps_immutability_and_rls():
    sql = MIGRATION.read_text()
    assert "exclude using gist (doctor_id extensions.gist_uuid_ops with =, blocking_range with &&)" in sql
    assert "treatment plan versions are immutable" in sql
    assert "disable row level security" not in sql.lower()
    assert "has_doctor_access(p_patient_id, 'profile')" in sql
    for table in ("doctor_schedule_settings", "doctor_weekly_hours", "doctor_time_off", "appointment_preparations",
                  "treatment_plans", "treatment_plan_versions", "medication_dose_log", "clinical_audit_log"):
        assert f"alter table public.{table}" in sql and "enable row level security" in sql
    assert "CNAS" in sql
