"""Emergency guardians (demo store): invite → accept by the invited account → emergency data only → revoke."""
import pytest
from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.main import app
from app.services import emergency_guardian_service as svc
from app.services import emergency_service as es
from app.services import supabase_repo
from app.services.demo_data import DEMO_PATIENT_ID
from tests.test_supabase_auth import auth, make_token, supabase_mode  # noqa: F401  (fixture)

client = TestClient(app)
API = "/api/v1/emergency/guardians"

PATIENT = CurrentUser(id=DEMO_PATIENT_ID, role="patient", email="maria@example.test")
GUARDIAN = CurrentUser(id="user_guardian", role="patient", email="Andrei@Example.test")
STRANGER = CurrentUser(id="user_stranger", role="patient", email="someone@example.test")
DOCTOR = CurrentUser(id="doc_demo_001", role="doctor", email="doc@example.test")


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    svc.reset_demo()
    monkeypatch.setattr(es, "_store", es._Store())
    yield
    app.dependency_overrides.pop(get_current_user, None)
    svc.reset_demo()


def as_user(user: CurrentUser) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def invite(email: str = "andrei@example.test", relation: str = "Brother"):
    as_user(PATIENT)
    return client.post(API, json={"email": email, "relation": relation})


def accept_as_guardian() -> str:
    link_id = invite().json()["id"]
    as_user(GUARDIAN)
    assert client.post(f"{API}/{link_id}/accept").status_code == 204
    return link_id


def test_pending_invite_grants_nothing_until_the_invited_account_accepts():
    link_id = invite().json()["id"]
    assert client.get(API).json()["guardians"][0] | {"createdAt": None} == {
        "id": link_id, "email": "andrei@example.test", "relation": "Brother", "status": "pending",
        "guardianName": None, "createdAt": None, "respondedAt": None,
    }
    as_user(GUARDIAN)
    overview = client.get(API).json()
    assert [i["patientName"] for i in overview["invitations"]] == ["Maria Ionescu"]
    assert overview["protecting"] == []
    assert client.get(f"{API}/patients/{DEMO_PATIENT_ID}").status_code == 404


def test_only_the_invited_email_can_accept():
    link_id = invite().json()["id"]
    for user in (STRANGER, DOCTOR, PATIENT, CurrentUser(id="no_email", role="patient")):
        as_user(user)
        assert client.get(API).json()["invitations"] == []
        assert client.post(f"{API}/{link_id}/accept").status_code == 404
    as_user(STRANGER)
    assert client.get(f"{API}/patients/{DEMO_PATIENT_ID}").status_code == 404


def test_guardian_sees_who_they_protect_and_opens_only_emergency_data():
    accept_as_guardian()
    overview = client.get(API).json()
    assert overview["invitations"] == []
    assert [(p["patientId"], p["patientName"]) for p in overview["protecting"]] == [(DEMO_PATIENT_ID, "Maria Ionescu")]

    res = client.get(f"{API}/patients/{DEMO_PATIENT_ID}")
    assert res.status_code == 200 and res.headers["cache-control"].startswith("no-store")
    data = res.json()
    assert set(data) == {"patientName", "bloodType", "allergies", "conditions", "medications",
                         "emergencyContact", "accessedAt", "passport"}
    assert data["bloodType"] and data["allergies"]
    assert all(set(a) <= {"substance", "reaction", "severity"} for a in data["allergies"])
    assert all(set(m) <= {"name", "dosage", "frequency"} for m in data["medications"])
    assert data["passport"]["normalLabs"] == []  # normal labs never reach the emergency screen
    for forbidden in ("documents", "xrays", "dateOfBirth"):
        assert forbidden not in res.text

    # the patient sees the access in the emergency audit log, with the guardian as actor
    as_user(PATIENT)
    events = client.get("/api/v1/emergency/audit").json()
    assert events[0]["event"] == "viewed"
    assert client.get(API).json()["guardians"][0]["status"] == "active"


def test_guardian_generates_patient_qr_that_only_a_doctor_can_redeem():
    accept_as_guardian()
    res = client.post(f"{API}/patients/{DEMO_PATIENT_ID}/tokens")
    assert res.status_code == 200
    token = res.json()
    assert token["qrPayload"] == f"wwhealth://emergency/{token['token']}" and token["ttlSeconds"] == 300
    assert es._store.tokens[es.hash_token(token["token"])].patient_id == DEMO_PATIENT_ID

    redeemed = client.post("/api/v1/emergency/redeem", json={"token": token["qrPayload"]})  # demo doctor
    assert redeemed.status_code == 200 and redeemed.json()["bloodType"]

    as_user(STRANGER)
    assert client.post(f"{API}/patients/{DEMO_PATIENT_ID}/tokens").status_code == 404


def test_patient_revokes_access_immediately():
    link_id = accept_as_guardian()
    as_user(PATIENT)
    assert client.post(f"{API}/{link_id}/revoke").status_code == 204
    assert client.post(f"{API}/{link_id}/revoke").status_code == 404
    assert client.get(API).json()["guardians"] == []

    as_user(GUARDIAN)
    assert client.get(API).json()["protecting"] == []
    assert client.get(f"{API}/patients/{DEMO_PATIENT_ID}").status_code == 404
    assert client.post(f"{API}/patients/{DEMO_PATIENT_ID}/tokens").status_code == 404
    assert client.post(f"{API}/{link_id}/accept").status_code == 404  # a revoked invite cannot be reused


def test_other_users_cannot_revoke_and_guardian_can_step_down():
    link_id = accept_as_guardian()
    for user in (STRANGER, GUARDIAN):
        as_user(user)
        assert client.post(f"{API}/{link_id}/revoke").status_code == 404
    as_user(GUARDIAN)
    assert client.post(f"{API}/{link_id}/decline").status_code == 204
    assert client.get(f"{API}/patients/{DEMO_PATIENT_ID}").status_code == 404


def test_decline_pending_invitation():
    link_id = invite().json()["id"]
    as_user(STRANGER)
    assert client.post(f"{API}/{link_id}/decline").status_code == 404
    as_user(GUARDIAN)
    assert client.post(f"{API}/{link_id}/decline").status_code == 204
    assert client.post(f"{API}/{link_id}/accept").status_code == 404
    as_user(PATIENT)
    assert client.get(API).json()["guardians"] == []


@pytest.mark.parametrize(("email", "code"), [
    ("not-an-email", 422), ("maria@example.test", 422), ("MARIA@example.test", 422),
])
def test_invalid_invites(email, code):
    assert invite(email).status_code == code


def test_duplicates_and_limit():
    assert invite().status_code == 201
    assert invite(" ANDREI@example.test ").status_code == 409
    for i in range(4):
        assert invite(f"p{i}@example.test").status_code == 201
    assert invite("sixth@example.test").status_code == 409


def test_supabase_mode_uses_rpcs_and_masks_missing_migration(supabase_mode, monkeypatch):
    calls = []

    def fake_view(user, patient_id):
        calls.append((user.id, patient_id))
        return {"status": "ok", "accessed_at": "2026-11-15T10:00:00Z", "patient_name": "Ana",
                "blood_type": "O+", "allergies": [], "medications": [{"name": "X", "active": False}],
                "conditions": [{"name": "Old", "status": "resolved"}, {"name": "Asthma"}],
                "emergency_contact": {"name": "Ion", "phone": "1", "relation": "Son"}, "documents": ["leak"]}

    monkeypatch.setattr(supabase_repo, "guardian_emergency_view", fake_view)
    pid = "11111111-1111-1111-1111-111111111111"
    res = client.get(f"{API}/patients/{pid}", headers=auth(make_token()))
    assert res.status_code == 200
    body = res.json()
    assert body["conditions"] == [{"name": "Asthma", "icd10": None}] and body["medications"] == []
    assert "leak" not in res.text and calls and calls[0][1] == pid

    def missing(*_args):
        raise supabase_repo.EmergencyGuardiansUnavailable("Emergency contacts are not set up yet")

    monkeypatch.setattr(supabase_repo, "my_emergency_guardians", missing)
    assert client.get(API, headers=auth(make_token())).status_code == 503
