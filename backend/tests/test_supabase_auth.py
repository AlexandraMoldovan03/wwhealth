"""Supabase mode: JWT verification (offline, local ES256 key) and user scoping in routes."""
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app.core import security
from app.core.config import settings
from app.main import app
from app.schemas.patient import PatientRecord
from app.services import supabase_repo

URL = "https://example-project.supabase.co"
KEY = ec.generate_private_key(ec.SECP256R1())
OTHER_KEY = ec.generate_private_key(ec.SECP256R1())
USER_A = "11111111-1111-1111-1111-111111111111"


def make_token(sub: str = USER_A, key=KEY, **overrides) -> str:
    claims = {"sub": sub, "aud": "authenticated", "iss": f"{URL}/auth/v1", "exp": int(time.time()) + 300,
              "role": "authenticated",
              "amr": [{"method": "password", "timestamp": int(time.time()) - 60}], **overrides}
    return jwt.encode(claims, key, algorithm="ES256", headers={"kid": "test"})


@pytest.fixture
def supabase_mode(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", URL)
    monkeypatch.setattr(settings, "supabase_publishable_key", "sb_publishable_test")
    fake_jwks = SimpleNamespace(get_signing_key_from_jwt=lambda _t: SimpleNamespace(key=KEY.public_key()))
    monkeypatch.setattr(security, "_jwks_client", lambda: fake_jwks)
    return TestClient(app)


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_missing_token_is_401(supabase_mode):
    assert supabase_mode.get("/api/v1/patients/me").status_code == 401


@pytest.mark.parametrize("token", [
    make_token(exp=int(time.time()) - 10),          # expired
    make_token(aud="anon"),                         # wrong audience
    make_token(iss="https://evil.example/auth/v1"),  # wrong issuer
    make_token(key=OTHER_KEY),                      # not signed by the project
    "not-a-jwt",
])
def test_invalid_tokens_are_401(supabase_mode, token):
    assert supabase_mode.get("/api/v1/patients/me", headers=auth(token)).status_code == 401


def test_valid_token_scopes_data_to_token_subject(supabase_mode, monkeypatch):
    seen = {}

    def fake_get_record(user):
        seen["id"], seen["token"] = user.id, user.access_token
        return PatientRecord(id=user.id, full_name="A")

    monkeypatch.setattr(supabase_repo, "get_record", fake_get_record)
    token = make_token()
    res = supabase_mode.get("/api/v1/patients/me", headers=auth(token))
    assert res.status_code == 200
    assert res.json()["id"] == USER_A and res.json()["dateOfBirth"] is None
    # The user's own token is forwarded so RLS applies; it never appears in the response.
    assert seen == {"id": USER_A, "token": token}
    assert token not in res.text


def test_supabase_failures_are_masked(supabase_mode, monkeypatch):
    def boom(_user):
        raise supabase_repo.SupabaseError("Database unavailable")

    monkeypatch.setattr(supabase_repo, "get_record", boom)
    res = supabase_mode.get("/api/v1/patients/me", headers=auth(make_token()))
    assert res.status_code == 502 and res.json() == {"detail": "Database unavailable"}


def test_other_users_document_is_404(supabase_mode, monkeypatch):
    monkeypatch.setattr(supabase_repo, "get_document_file", lambda _user, _doc_id: None)  # RLS hides it
    res = supabase_mode.get("/api/v1/documents/22222222-2222-2222-2222-222222222222/file", headers=auth(make_token()))
    assert res.status_code == 404


def test_doctor_role_comes_from_profiles_not_token(supabase_mode, monkeypatch):
    monkeypatch.setattr(supabase_repo, "get_role", lambda _user: "patient")
    token = make_token(user_metadata={"role": "doctor"})  # client-editable claim
    with pytest.raises(Exception) as exc:
        security.get_current_doctor(f"Bearer {token}")
    assert getattr(exc.value, "status_code", None) == 403
