from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_patient_me_is_camel_case() -> None:
    res = client.get("/api/v1/patients/me")
    assert res.status_code == 200
    assert "fullName" in res.json()
