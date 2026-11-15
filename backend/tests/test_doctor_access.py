"""Doctor Access & Consent (demo store + doctor-role gate). The same rules in Postgres are covered by the SQL
scenarios run against the migration (allowed / expired / revoked / isolation / no self-extension)."""
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import doctor_access_service as svc
from app.services import lab_extraction, supabase_repo
from app.services.demo_data import DEMO_PATIENT_ID
from app.services.medical_summary import build_summary, latest_labs
from tests.test_supabase_auth import auth, make_token, supabase_mode  # noqa: F401  (fixture)

client = TestClient(app)
API = "/api/v1/doctor-access"
DOCTOR = "doc_demo_001"


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    svc.reset_demo()
    monkeypatch.setattr(lab_extraction, "_demo_values", {})
    yield
    svc.reset_demo()


def grant(scopes, hours=24, **who):
    who = who or {"doctorId": DOCTOR}
    return client.post(f"{API}/grants", json={**who, "scopes": scopes, "durationHours": hours})


def test_without_consent_doctor_sees_nothing():
    assert client.get(f"{API}/patients").json() == []
    view = client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()
    assert view["status"] == "none" and view["summary"] is None and view["patientName"] is None


def test_verified_doctor_directory_and_code():
    assert [d["doctorCode"] for d in client.get(f"{API}/doctors").json()] == ["DR-DEMO01"]
    assert client.get(f"{API}/doctors", params={"q": "zzz"}).json() == []
    assert grant(["profile"], doctorCode="dr-demo01").status_code == 201  # code, case-insensitive
    assert grant(["profile"], doctorCode="DR-NOPE00").status_code == 404
    assert grant(["profile"], doctorId="pat_demo_001").status_code == 404  # not a doctor / self
    assert client.get(f"{API}/me").json() == {"fullName": "Dr. Alex Test", "doctorCode": "DR-DEMO01"}


@pytest.mark.parametrize("body", [
    {"doctorId": DOCTOR, "scopes": ["profile"], "durationHours": 48},          # only 1 / 24 / 168
    {"doctorId": DOCTOR, "scopes": ["xrays"], "durationHours": 1},             # unknown section
    {"doctorId": DOCTOR, "scopes": [], "durationHours": 1},                    # nothing shared
    {"scopes": ["profile"], "durationHours": 1},                               # no doctor
    {"doctorId": DOCTOR, "doctorCode": "DR-DEMO01", "scopes": ["profile"], "durationHours": 1},
])
def test_invalid_grants_are_rejected(body):
    assert client.post(f"{API}/grants", json=body).status_code == 422
    assert client.get(f"{API}/grants").json()["grants"] == []


def test_allowed_sections_only():
    lab_extraction.demo_save(DEMO_PATIENT_ID, "doc_x", [{"name": "Glicemie", "value": "98", "unit": "mg/dL"}])
    g = grant(["labs", "profile"]).json()
    assert g["status"] == "active" and g["scopes"] == ["labs", "profile"] and g["doctorName"] == "Dr. Alex Test"
    view = client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()
    assert view["status"] == "ok" and view["patientName"]
    s = view["summary"]
    assert s["basics"] is not None and s["allergies"] is not None and s["medications"] is not None
    assert [lab["name"] for lab in s["latestLabs"]] == ["Glicemie"]
    assert s["documents"] is None and view["documents"] is None  # 'documents' not shared → not even fetched
    doc_id = "doc_001"
    res = client.get(f"{API}/patients/{DEMO_PATIENT_ID}/documents/{doc_id}/file")
    assert res.status_code == 403  # file of a section that was not shared


def test_documents_only_hides_profile_and_labs():
    grant(["documents"], hours=1)
    view = client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()
    s = view["summary"]
    assert s["basics"] is None and s["allergies"] is None and s["latestLabs"] is None and view["labs"] is None
    assert view["documents"] is not None
    assert all("/doctor-access/patients/" in d["fileUrl"] for d in view["documents"])


def test_expired_access_returns_status_without_data():
    g = grant(["profile", "documents", "labs"], hours=1).json()
    for stored in svc._grants:
        if stored.id == g["id"]:
            stored.created_at -= timedelta(hours=2)
            stored.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    view = client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()
    assert view["status"] == "expired" and view["summary"] is None and view["documents"] is None
    assert client.get(f"{API}/patients").json()[0]["status"] == "expired"
    assert client.get(f"{API}/patients/{DEMO_PATIENT_ID}/documents/doc_001/file").status_code == 403
    assert client.post(f"{API}/grants/{g['id']}/revoke").status_code == 404  # nothing active to revoke


def test_revoke_is_immediate_and_logged():
    g = grant(["profile"], hours=168).json()
    assert client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()["status"] == "ok"
    assert client.post(f"{API}/grants/{g['id']}/revoke").status_code == 204
    view = client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()
    assert view["status"] == "revoked" and view["summary"] is None and view["labs"] is None
    overview = client.get(f"{API}/grants").json()
    assert overview["grants"][0]["status"] == "revoked"
    assert {e["event"] for e in overview["events"]} == {"granted", "viewed", "revoked", "denied"}
    assert client.post(f"{API}/grants/{g['id']}/revoke").status_code == 404


def test_regrant_replaces_instead_of_stacking():
    grant(["profile", "labs"], hours=168)
    grant(["documents"], hours=1)
    grants = client.get(f"{API}/grants").json()["grants"]
    assert [g["status"] for g in grants] == ["active", "revoked"]
    view = client.get(f"{API}/patients/{DEMO_PATIENT_ID}").json()
    assert view["scopes"] == ["documents"] and view["summary"]["basics"] is None


def test_other_patients_and_doctors_are_isolated():
    other = svc._Grant(patient_id="pat_other", doctor_id="doc_other", scopes=["profile"],
                       expires_at=datetime.now(UTC) + timedelta(hours=1))
    svc._grants.append(other)
    assert client.get(f"{API}/patients").json() == []  # doc_demo_001 sees no other doctor's patients
    assert client.get(f"{API}/patients/pat_other").json()["status"] == "none"
    assert client.get(f"{API}/grants").json()["grants"] == []  # the demo patient doesn't see others' grants
    assert client.post(f"{API}/grants/{other.id}/revoke").status_code == 404  # nor revoke them


def test_patient_search_by_name():
    grant(["profile"])
    name = client.get(f"{API}/patients").json()[0]["fullName"]
    assert len(client.get(f"{API}/patients", params={"q": name.split()[0].lower()}).json()) == 1
    assert client.get(f"{API}/patients", params={"q": "nobody"}).json() == []


def test_doctor_routes_need_doctor_role_from_profiles(supabase_mode, monkeypatch):  # noqa: F811
    monkeypatch.setattr(supabase_repo, "get_role", lambda _u: "patient")
    token = make_token(user_metadata={"role": "doctor"})  # client-editable metadata is ignored
    for path in ("/patients", "/me", f"/patients/{DEMO_PATIENT_ID}"):
        assert supabase_mode.get(f"{API}{path}", headers=auth(token)).status_code == 403


def test_missing_migration_is_a_clear_503(supabase_mode, monkeypatch):  # noqa: F811
    def boom(*_a, **_k):
        raise supabase_repo.DoctorAccessUnavailable("Doctor access is not set up yet")

    monkeypatch.setattr(supabase_repo, "patient_doctor_access", boom)
    res = supabase_mode.get(f"{API}/grants", headers=auth(make_token()))
    assert res.status_code == 503 and "not set up" in res.json()["detail"]


def test_summary_never_mixes_units_and_keeps_values_verbatim():
    labs = [
        {"name": "Glicemie", "value": "98", "unit": "mg/dL", "measured_at": "2026-08-20"},
        {"name": "Glicemie", "value": "112", "unit": "mg/dl", "measured_at": "2026-10-02"},
        {"name": "glicemie", "value": "6,2", "unit": "mmol/L", "measured_at": "2026-11-05"},
        {"name": "Hemoglobină", "value": "13,5", "unit": "g/dL", "document_date": "2026-10-02"},
        {"name": "Hemoglobina", "value": "12,1", "unit": "g/dL", "measured_at": "2026-11-05"},
    ]
    got = {(lab.name, lab.unit): (lab.value, lab.measurements) for lab in latest_labs(labs)}
    assert got == {("Glicemie", "mg/dl"): ("112", 2), ("glicemie", "mmol/L"): ("6,2", 1),
                   ("Hemoglobina", "g/dL"): ("12,1", 2)}
    empty = build_summary(None, None, None)
    assert empty.basics is None and empty.documents is None and empty.latest_labs is None


def test_patient_own_summary():
    res = client.get("/api/v1/patients/me/summary")
    assert res.status_code == 200 and res.json()["basics"] is not None and res.json()["latestLabs"] == []


def test_voice_summary_needs_profile_consent():
    body = {"patientId": DEMO_PATIENT_ID, "language": "en"}
    assert client.post("/api/v1/voice/summary", json=body).status_code == 403  # no consent
    grant(["labs"])
    assert client.post("/api/v1/voice/summary", json=body).status_code == 403  # profile not shared
    grant(["profile"])
    assert client.post("/api/v1/voice/summary", json=body).status_code == 200
