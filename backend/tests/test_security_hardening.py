"""Security hardening: MFA gate (aal2), recent sign-in for high-risk actions, doctor MFA policy,
rate limits / replay protection on the emergency QR, and the account security status endpoint."""
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core import rate_limit, security
from app.core.config import settings
from app.main import app
from app.services import emergency_guardian_service as guardians
from app.services import emergency_service as es
from app.services import supabase_repo
from tests.test_supabase_auth import auth, make_token, supabase_mode  # noqa: F401  (fixture)

client = TestClient(app)
STALE = [{"method": "password", "timestamp": int(time.time()) - 3 * 86400}]
FRESH_TOTP = [{"method": "password", "timestamp": int(time.time()) - 600},
              {"method": "totp", "timestamp": int(time.time()) - 60}]


@pytest.fixture(autouse=True)
def fresh_store(monkeypatch):
    monkeypatch.setattr(es, "_store", es._Store())


def enrolled(monkeypatch, value: bool = True):
    monkeypatch.setattr(security, "has_verified_factor", lambda _user: value)


# ─────────────────────────────────────────────── claims

def test_auth_time_is_the_newest_sign_in_step():
    assert security.auth_time_from_claims({"amr": FRESH_TOTP}) == FRESH_TOTP[1]["timestamp"]
    assert security.auth_time_from_claims({"amr": "password"}) is None
    assert security.auth_time_from_claims({"amr": [{"method": "password", "timestamp": True}]}) is None
    assert security.auth_time_from_claims({}) is None


# ─────────────────────────────────────────────── MFA (aal2)

def test_mfa_account_at_aal1_is_refused_everywhere(supabase_mode, monkeypatch):
    enrolled(monkeypatch)
    called = []
    monkeypatch.setattr(supabase_repo, "get_record", lambda user: called.append(user))
    res = supabase_mode.get("/api/v1/patients/me", headers=auth(make_token(aal="aal1")))
    assert res.status_code == 403 and res.headers["x-wwhealth-step-up"] == "mfa" and not called
    # a forged "aal2" is impossible (signature), and an unknown value is treated as aal1
    assert supabase_mode.get("/api/v1/patients/me", headers=auth(make_token(aal="aal3"))).status_code == 403


def test_mfa_account_at_aal2_passes(supabase_mode, monkeypatch):
    from app.schemas.patient import PatientRecord
    enrolled(monkeypatch)
    monkeypatch.setattr(supabase_repo, "get_record", lambda user: PatientRecord(id=user.id, full_name="A"))
    res = supabase_mode.get("/api/v1/patients/me", headers=auth(make_token(aal="aal2", amr=FRESH_TOTP)))
    assert res.status_code == 200


def test_factor_lookup_fails_closed(supabase_mode, monkeypatch):
    monkeypatch.undo()  # restore the real lookup, keep a fake network
    monkeypatch.setattr(settings, "supabase_url", "https://example-project.supabase.co")
    monkeypatch.setattr(settings, "supabase_publishable_key", "sb_publishable_test")
    user = security.CurrentUser(id="u1", role="patient", access_token="t")

    def down(*_a, **_k):
        raise httpx.ConnectError("offline")
    monkeypatch.setattr(httpx, "get", down)
    with pytest.raises(Exception) as exc:
        security.has_verified_factor(user)
    assert getattr(exc.value, "status_code", None) == 503

    monkeypatch.setattr(httpx, "get", lambda *_a, **_k: httpx.Response(200, json={"factors": [
        {"factor_type": "totp", "status": "unverified"}, {"factor_type": "recovery_code", "status": "verified"}]}))
    security.invalidate_factor_cache()
    assert security.has_verified_factor(user) is False
    monkeypatch.setattr(httpx, "get", lambda *_a, **_k: httpx.Response(200, json={"factors": [
        {"factor_type": "totp", "status": "verified"}]}))
    security.invalidate_factor_cache()
    assert security.has_verified_factor(user) is True
    monkeypatch.setattr(httpx, "get", lambda *_a, **_k: httpx.Response(401, json={}))
    security.invalidate_factor_cache()
    with pytest.raises(Exception) as exc:
        security.has_verified_factor(user)
    assert getattr(exc.value, "status_code", None) == 401


def test_security_status_works_for_an_unfinished_mfa_login(supabase_mode, monkeypatch):
    enrolled(monkeypatch)
    res = supabase_mode.get("/api/v1/security/status", headers=auth(make_token(aal="aal1")))
    body = res.json()
    assert res.status_code == 200 and res.headers["cache-control"].startswith("no-store")
    assert body["mfaEnrolled"] is True and body["mfaSatisfied"] is False and body["recentAuth"] is True
    assert "token" not in res.text.lower()
    stale = supabase_mode.get("/api/v1/security/status", headers=auth(make_token(amr=STALE))).json()
    assert stale["recentAuth"] is False


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


# ─────────────────────────────────────────────── doctor MFA policy

def test_doctor_mfa_policy(supabase_mode, monkeypatch):
    monkeypatch.setattr(supabase_repo, "get_role", lambda _user: "doctor")
    monkeypatch.setattr(supabase_repo, "emergency_doctor_accesses", lambda _user: [])
    url = "/api/v1/emergency/my-accesses"
    assert supabase_mode.get(url, headers=auth(make_token())).status_code == 200  # policy off by default
    monkeypatch.setattr(settings, "doctor_mfa_required", True)
    res = supabase_mode.get(url, headers=auth(make_token()))
    assert res.status_code == 403 and res.headers["x-wwhealth-step-up"] == "mfa-enroll"
    assert supabase_mode.get(url, headers=auth(make_token(aal="aal2", amr=FRESH_TOTP))).status_code == 200
    # patients are not affected by the doctor policy
    monkeypatch.setattr(supabase_repo, "emergency_audit", lambda _user: [])
    assert supabase_mode.get("/api/v1/emergency/audit", headers=auth(make_token())).status_code == 200


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
