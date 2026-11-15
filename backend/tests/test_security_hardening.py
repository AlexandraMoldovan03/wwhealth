"""Security hardening: recent sign-in for high-risk actions, role checks, rate limits / replay protection
on the emergency QR, and the account security status endpoint. MFA is not offered (no aal2 gate)."""
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core import rate_limit, security
from app.core.config import settings
from app.main import app
from app.schemas.patient import PatientRecord
from app.services import emergency_guardian_service as guardians
from app.services import emergency_service as es
from app.services import supabase_repo
from tests.test_supabase_auth import auth, make_token, supabase_mode  # noqa: F401  (fixture)

client = TestClient(app)
STALE = [{"method": "password", "timestamp": int(time.time()) - 3 * 86400}]
FRESH = [{"method": "password", "timestamp": int(time.time()) - 600},
         {"method": "oauth", "timestamp": int(time.time()) - 60}]


@pytest.fixture(autouse=True)
def fresh_store(monkeypatch):
    monkeypatch.setattr(es, "_store", es._Store())


# ─────────────────────────────────────────────── claims / no MFA gate

def test_auth_time_is_the_newest_sign_in_step():
    assert security.auth_time_from_claims({"amr": FRESH}) == FRESH[1]["timestamp"]
    assert security.auth_time_from_claims({"amr": "password"}) is None
    assert security.auth_time_from_claims({"amr": [{"method": "password", "timestamp": True}]}) is None
    assert security.auth_time_from_claims({}) is None


def test_password_session_is_enough_and_auth_service_is_not_called(supabase_mode, monkeypatch):
    def no_network(*_a, **_k):
        raise AssertionError("Supabase Auth must not be queried per request")
    monkeypatch.setattr(httpx, "get", no_network)
    monkeypatch.setattr(supabase_repo, "get_record", lambda user: PatientRecord(id=user.id, full_name="A"))
    for token in (make_token(), make_token(aal="aal1"), make_token(aal="aal2")):
        assert supabase_mode.get("/api/v1/patients/me", headers=auth(token)).status_code == 200


def test_security_status(supabase_mode):
    res = supabase_mode.get("/api/v1/security/status", headers=auth(make_token()))
    body = res.json()
    assert res.status_code == 200 and res.headers["cache-control"].startswith("no-store")
    assert body["recentAuth"] is True and set(body) == {"authAgeSeconds", "recentAuth", "reauthMaxAgeSeconds"}
    stale = supabase_mode.get("/api/v1/security/status", headers=auth(make_token(amr=STALE))).json()
    assert stale["recentAuth"] is False
    assert supabase_mode.get("/api/v1/security/status").status_code == 401


# ─────────────────────────────────────────────── recent sign-in for high-risk actions

def test_stale_session_cannot_add_an_emergency_contact(supabase_mode, monkeypatch):
    called = []
    monkeypatch.setattr(guardians, "invite", lambda *a: called.append(a) or "link-1")
    body = {"email": "andrei@example.test", "relation": "Brother"}
    res = supabase_mode.post("/api/v1/emergency/guardians", json=body, headers=auth(make_token(amr=STALE)))
    assert res.status_code == 403 and res.headers["x-wwhealth-step-up"] == "reauth" and not called
    assert supabase_mode.post("/api/v1/emergency/guardians", json=body, headers=auth(make_token(amr=None))).status_code == 403
    ok = supabase_mode.post("/api/v1/emergency/guardians", json=body, headers=auth(make_token()))
    assert ok.status_code == 201 and called


def test_stale_session_cannot_export_or_share(supabase_mode, monkeypatch):
    stale = auth(make_token(amr=STALE))
    for path in ("/api/v1/care/export/fhir", "/api/v1/care/export/archive.zip", "/api/v1/care/export/labs.csv"):
        res = supabase_mode.get(path, headers=stale)
        assert res.status_code == 403 and res.headers["x-wwhealth-step-up"] == "reauth", path
    res = supabase_mode.post("/api/v1/doctor-access/grants", json={"doctorCode": "ABC123", "scopes": ["profile"], "durationHours": 24},
                             headers=stale)
    assert res.status_code == 403 and res.headers["x-wwhealth-step-up"] == "reauth"


def test_stale_doctor_cannot_export_a_patient(supabase_mode, monkeypatch):
    monkeypatch.setattr(supabase_repo, "get_role", lambda _user: "doctor")
    res = supabase_mode.get("/api/v1/care/doctor/patients/p1/export/fhir", headers=auth(make_token(amr=STALE)))
    assert res.status_code == 403 and res.headers["x-wwhealth-step-up"] == "reauth"


def test_revoking_access_never_needs_step_up(supabase_mode, monkeypatch):
    monkeypatch.setattr(guardians, "revoke", lambda *_a: True)
    res = supabase_mode.post("/api/v1/emergency/guardians/link-1/revoke", headers=auth(make_token(amr=STALE)))
    assert res.status_code == 204


def test_emergency_qr_never_needs_a_recent_sign_in(supabase_mode, monkeypatch):
    monkeypatch.setattr(supabase_repo, "create_emergency_token",
                        lambda _u, _h: {"token_id": "t1", "expires_at": "2030-01-01T00:00:00+00:00"})
    res = supabase_mode.post("/api/v1/emergency/tokens", headers=auth(make_token(amr=STALE)))
    assert res.status_code == 200


# ─────────────────────────────────────────────── roles (unchanged by removing MFA)

def test_patient_cannot_use_doctor_endpoints(supabase_mode, monkeypatch):
    monkeypatch.setattr(supabase_repo, "get_role", lambda _user: "patient")
    # even with a fresh sign-in and a forged "doctor" in the editable metadata
    token = auth(make_token(user_metadata={"role": "doctor"}))
    for method, url in (("get", "/api/v1/emergency/my-accesses"), ("get", "/api/v1/care/doctor/patients/p1/export/fhir"),
                        ("get", "/api/v1/doctor-access/patients")):
        assert getattr(supabase_mode, method)(url, headers=token).status_code == 403, url
    assert supabase_mode.post("/api/v1/emergency/redeem", json={"token": es.new_token()}, headers=token).status_code == 403


def test_verified_doctor_passes_role_checks(supabase_mode, monkeypatch):
    monkeypatch.setattr(supabase_repo, "get_role", lambda _user: "doctor")
    monkeypatch.setattr(supabase_repo, "emergency_doctor_accesses", lambda _user: [])
    assert supabase_mode.get("/api/v1/emergency/my-accesses", headers=auth(make_token())).status_code == 200


# ─────────────────────────────────────────────── emergency QR: replay, brute force, no session

def test_qr_replay_is_refused_and_counted():
    body = client.post("/api/v1/emergency/tokens").json()
    assert client.post("/api/v1/emergency/redeem", json={"token": body["token"]}).status_code == 200
    for _ in range(3):
        assert client.post("/api/v1/emergency/redeem", json={"token": body["qrPayload"]}).status_code == 409


def test_guessing_codes_locks_the_doctor_out():
    for _ in range(settings.emergency_redeem_failures_per_15_min):
        assert client.post("/api/v1/emergency/redeem", json={"token": es.new_token()}).status_code == 404
    valid = client.post("/api/v1/emergency/tokens").json()
    res = client.post("/api/v1/emergency/redeem", json={"token": valid["token"]})
    assert res.status_code == 429 and res.headers["retry-after"] == "900"
    assert "Too many" in res.json()["detail"]


def test_redeem_and_qr_creation_are_rate_limited(monkeypatch):
    monkeypatch.setattr(settings, "emergency_redeem_per_minute", 3)
    for _ in range(3):
        client.post("/api/v1/emergency/redeem", json={"token": "x" * 43})
    assert client.post("/api/v1/emergency/redeem", json={"token": "x" * 43}).status_code == 429
    for _ in range(settings.emergency_token_create_per_minute):
        assert client.post("/api/v1/emergency/tokens").status_code == 200
    assert client.post("/api/v1/emergency/tokens").status_code == 429


def test_qr_token_is_not_a_login(supabase_mode):
    token = es.new_token()  # exactly what a QR carries
    assert supabase_mode.get("/api/v1/patients/me", headers=auth(token)).status_code == 401
    assert supabase_mode.get("/api/v1/patients/me", headers=auth(f"{es.QR_PREFIX}{token}")).status_code == 401


def test_qr_payload_carries_no_identity_or_medical_data():
    qr = client.post("/api/v1/emergency/tokens").json()
    payload = qr["qrPayload"].removeprefix(es.QR_PREFIX)
    assert payload == qr["token"] and payload.replace("-", "").replace("_", "").isalnum()
    assert not any(ch.isspace() for ch in payload) and "@" not in payload


# ─────────────────────────────────────────────── limiter + headers

def test_sliding_window_limiter():
    for i in range(3):
        rate_limit.hit("k", 3, 60, now=100.0 + i)
    with pytest.raises(Exception) as exc:
        rate_limit.hit("k", 3, 60, now=110.0)
    assert exc.value.status_code == 429 and int(exc.value.headers["Retry-After"]) >= 1
    rate_limit.hit("k", 3, 60, now=161.0)  # first hit left the window
    assert not rate_limit.blocked("other", 1, 60)


def test_security_headers_on_every_response():
    res = client.get("/health")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["referrer-policy"] == "no-referrer" and res.headers["x-frame-options"] == "DENY"
