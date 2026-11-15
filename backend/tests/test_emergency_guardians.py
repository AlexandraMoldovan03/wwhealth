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
    # the patient sees the refusal (no access, no revoke button) and may invite the same email again
    assert [(g["id"], g["status"]) for g in client.get(API).json()["guardians"]] == [(link_id, "declined")]
    new_id = invite().json()["id"]
    assert [(g["id"], g["status"]) for g in client.get(API).json()["guardians"]] == [(new_id, "pending")]


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


# ─────────────────────────────────────────────── two distinct patient accounts (A invites B)

ANA = CurrentUser(id=DEMO_PATIENT_ID, role="patient", email="ana@example.test")      # A: has a medical record
BOGDAN = CurrentUser(id="user_bogdan", role="patient", email="bogdan@example.test")  # B: a separate patient account
DOCTOR_API = "/api/v1/emergency"


def _token(user: CurrentUser, path: str) -> dict:
    as_user(user)
    res = client.post(path)
    assert res.status_code == 200, res.text
    return res.json()


def _status(token_id: str) -> str:
    as_user(ANA)
    return client.get(f"{DOCTOR_API}/tokens/{token_id}/status").json()["status"]


def test_two_accounts_link_is_one_directional():
    as_user(ANA)
    link_id = client.post(API, json={"email": "BOGDAN@example.test", "relation": "Frate"}).json()["id"]
    as_user(BOGDAN)
    assert [i["id"] for i in client.get(API).json()["invitations"]] == [link_id]
    assert client.post(f"{API}/{link_id}/accept").status_code == 204
    assert client.get(f"{API}/patients/{ANA.id}").status_code == 200        # B sees A's emergency passport
    assert client.get(API).json()["guardians"] == []                        # B invited nobody

    as_user(ANA)
    overview = client.get(API).json()
    assert [(g["email"], g["status"]) for g in overview["guardians"]] == [("bogdan@example.test", "active")]
    assert overview["protecting"] == [] and overview["invitations"] == []   # A gets nothing from B
    assert client.get(f"{API}/patients/{BOGDAN.id}").status_code == 404
    assert client.post(f"{API}/patients/{BOGDAN.id}/tokens").status_code == 404


def test_patient_and_guardian_both_generate_qr_newest_wins_and_is_logged():
    as_user(ANA)
    link_id = client.post(API, json={"email": "bogdan@example.test"}).json()["id"]
    as_user(BOGDAN)
    client.post(f"{API}/{link_id}/accept")

    own = _token(ANA, f"{DOCTOR_API}/tokens")                             # A: own QR
    by_guardian = _token(BOGDAN, f"{API}/patients/{ANA.id}/tokens")       # B: A's QR
    bogdan_own = _token(BOGDAN, f"{DOCTOR_API}/tokens")                   # B: own QR, separate patient
    assert _status(own["tokenId"]) == "revoked"                           # one active QR per patient
    assert _status(by_guardian["tokenId"]) == "active"
    assert es._store.tokens[es.hash_token(bogdan_own["token"])].patient_id == BOGDAN.id

    created = [e for e in es._store.log if e["event"] == "created" and e["patient_id"] == ANA.id]
    assert [e["actor_id"] for e in created] == [ANA.id, BOGDAN.id]       # who generated each code

    as_user(DOCTOR)
    redeemed = client.post(f"{DOCTOR_API}/redeem", json={"token": by_guardian["qrPayload"]})
    assert redeemed.status_code == 200
    for forbidden in ("documents", "xrays", "dateOfBirth"):
        assert forbidden not in redeemed.text                               # emergency data only


def test_revoke_blocks_generation_and_cancels_guardian_qr():
    as_user(ANA)
    link_id = client.post(API, json={"email": "bogdan@example.test"}).json()["id"]
    as_user(BOGDAN)
    client.post(f"{API}/{link_id}/accept")
    by_guardian = _token(BOGDAN, f"{API}/patients/{ANA.id}/tokens")

    as_user(ANA)
    assert client.post(f"{API}/{link_id}/revoke").status_code == 204
    assert _status(by_guardian["tokenId"]) == "revoked"
    assert any(e["event"] == "revoked" and e["reason"] == "guardian_access" for e in es._store.log)

    as_user(BOGDAN)
    assert client.post(f"{API}/patients/{ANA.id}/tokens").status_code == 404
    assert client.get(f"{API}/patients/{ANA.id}").status_code == 404
    as_user(DOCTOR)
    assert client.post(f"{DOCTOR_API}/redeem", json={"token": by_guardian["qrPayload"]}).status_code != 200


def test_guardian_stepping_down_cancels_their_qr_but_not_the_patients():
    as_user(ANA)
    link_id = client.post(API, json={"email": "bogdan@example.test"}).json()["id"]
    as_user(BOGDAN)
    client.post(f"{API}/{link_id}/accept")
    by_guardian = _token(BOGDAN, f"{API}/patients/{ANA.id}/tokens")
    as_user(BOGDAN)
    assert client.post(f"{API}/{link_id}/decline").status_code == 204
    assert _status(by_guardian["tokenId"]) == "revoked"
    own = _token(ANA, f"{DOCTOR_API}/tokens")
    assert _status(own["tokenId"]) == "active"


def test_health_reports_data_mode():
    body = client.get("/health").json()
    assert body["dataMode"] == "demo" and body["supabaseProject"] is None
