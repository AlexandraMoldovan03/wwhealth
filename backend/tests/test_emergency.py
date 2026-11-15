"""Emergency Medical Passport: token lifecycle (demo store) + Supabase wiring (RPCs mocked)."""
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import emergency_service as es
from app.services import supabase_repo
from tests.test_supabase_auth import auth, make_token, supabase_mode  # noqa: F401  (fixture)

client = TestClient(app)
BASE = "/api/v1/emergency"


@pytest.fixture(autouse=True)
def fresh_store(monkeypatch):
    monkeypatch.setattr(es, "_store", es._Store())


def create() -> dict:
    res = client.post(f"{BASE}/tokens")
    assert res.status_code == 200 and res.headers["cache-control"].startswith("no-store")
    return res.json()


def test_token_is_random_short_lived_and_carries_no_data():
    body = create()
    assert body["qrPayload"] == f"wwhealth://emergency/{body['token']}" and len(body["token"]) >= 40
    assert body["ttlSeconds"] == 300
    expires = datetime.fromisoformat(body["expiresAt"])
    assert timedelta(minutes=4) < expires - datetime.now(UTC) <= timedelta(minutes=5)
    # only the hash is stored, never the token itself
    assert body["token"] not in es._store.tokens and es.hash_token(body["token"]) in es._store.tokens
    assert create()["token"] != body["token"]


def test_redeem_returns_only_emergency_fields_and_is_single_use():
    body = create()
    res = client.post(f"{BASE}/redeem", json={"token": body["qrPayload"]})
    assert res.status_code == 200
    data = res.json()
    assert set(data) == {"bloodType", "allergies", "conditions", "medications", "accessedAt", "passport"}
    assert data["bloodType"] and data["allergies"]
    assert all(set(a) <= {"substance", "reaction", "severity"} for a in data["allergies"])
    assert client.post(f"{BASE}/redeem", json={"token": body["token"]}).status_code == 409


def test_revoked_expired_unknown_and_replaced_tokens_are_rejected():
    first = create()
    second = create()  # creating a new QR revokes the previous one
    assert client.post(f"{BASE}/redeem", json={"token": first["token"]}).status_code == 410

    assert client.post(f"{BASE}/tokens/{second['tokenId']}/revoke").status_code == 204
    assert client.post(f"{BASE}/tokens/{second['tokenId']}/revoke").status_code == 404
    assert client.post(f"{BASE}/redeem", json={"token": second["token"]}).status_code == 410

    third = create()
    es._store.tokens[es.hash_token(third["token"])].expires_at = datetime.now(UTC) - timedelta(seconds=1)
    assert client.post(f"{BASE}/redeem", json={"token": third["token"]}).status_code == 410
    assert client.post(f"{BASE}/redeem", json={"token": es.new_token()}).status_code == 404


def test_audit_log_records_every_access():
    body = create()
    client.post(f"{BASE}/redeem", json={"token": body["token"]})
    client.post(f"{BASE}/redeem", json={"token": body["token"]})
    events = [(e["event"], e["reason"]) for e in client.get(f"{BASE}/audit").json()]
    assert events == [("denied", "used"), ("viewed", None), ("created", None)]


def test_doctor_sees_own_access_history_without_patient_data():
    body = create()
    client.post(f"{BASE}/redeem", json={"token": body["token"]})
    client.post(f"{BASE}/redeem", json={"token": body["token"]})
    res = client.get(f"{BASE}/my-accesses")
    assert res.status_code == 200
    assert [(e["event"], e["reason"]) for e in res.json()] == [("denied", "used"), ("viewed", None)]
    assert "patient" not in res.text.lower()


def test_supabase_my_accesses_requires_doctor(supabase_mode, monkeypatch):  # noqa: F811
    monkeypatch.setattr(supabase_repo, "get_role", lambda _u: "patient")
    assert supabase_mode.get(f"{BASE}/my-accesses", headers=auth(make_token())).status_code == 403


# ─────────────────────────────────────────────────────────── Supabase mode

def test_supabase_redeem_requires_doctor_role(supabase_mode, monkeypatch):  # noqa: F811
    monkeypatch.setattr(supabase_repo, "get_role", lambda _u: "patient")
    called = []
    monkeypatch.setattr(supabase_repo, "redeem_emergency_token", lambda *a: called.append(a))
    res = supabase_mode.post(f"{BASE}/redeem", json={"token": es.new_token()}, headers=auth(make_token()))
    assert res.status_code == 403 and not called


def test_supabase_sends_only_the_hash_and_maps_statuses(supabase_mode, monkeypatch):  # noqa: F811
    monkeypatch.setattr(supabase_repo, "get_role", lambda _u: "doctor")
    seen = {}

    def fake_create(user, token_hash):
        seen["create"] = token_hash
        return {"token_id": "t1", "expires_at": "2026-11-13T10:05:00+00:00"}

    monkeypatch.setattr(supabase_repo, "create_emergency_token", fake_create)
    body = supabase_mode.post(f"{BASE}/tokens", headers=auth(make_token())).json()
    assert seen["create"] == es.hash_token(body["token"]) and body["token"] not in seen["create"]

    def fake_redeem(user, token_hash):
        seen["redeem"] = (user.access_token is not None, token_hash)
        return {"status": "ok", "accessed_at": "now", "blood_type": "O-",
                "allergies": [{"id": "a", "substance": "Latex", "reaction": "Rash", "severity": "mild"}],
                "conditions": [{"id": "c1", "name": "Asthma", "status": "active", "diagnosed_at": "x"},
                               {"id": "c2", "name": "Old", "status": "resolved", "diagnosed_at": "x"}],
                "medications": [{"name": "Salbutamol", "dosage": "100 mcg", "active": True},
                                {"name": "Stopped", "active": False}],
                "emergency_contact": {"name": "must not leak"}}

    monkeypatch.setattr(supabase_repo, "redeem_emergency_token", fake_redeem)
    res = supabase_mode.post(f"{BASE}/redeem", json={"token": body["qrPayload"]}, headers=auth(make_token()))
    assert res.status_code == 200 and seen["redeem"] == (True, es.hash_token(body["token"]))
    data = res.json()
    assert [c["name"] for c in data["conditions"]] == ["Asthma"]
    assert [m["name"] for m in data["medications"]] == ["Salbutamol"]
    assert "must not leak" not in res.text and "id" not in data["allergies"][0]

    for status, code in [("used", 409), ("expired", 410), ("revoked", 410), ("not_found", 404), ("forbidden", 403)]:
        monkeypatch.setattr(supabase_repo, "redeem_emergency_token", lambda _u, _h, s=status: {"status": s})
        assert supabase_mode.post(f"{BASE}/redeem", json={"token": body["token"]},
                                  headers=auth(make_token())).status_code == code
