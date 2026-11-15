"""Smart Medical Profile: profile editing, private document upload/download, history entry."""
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import CurrentUser, get_current_user
from app.main import app

client = TestClient(app)
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture(autouse=True)
def private_storage(tmp_path, monkeypatch: pytest.MonkeyPatch):  # noqa: ANN001, ANN201
    monkeypatch.setattr(settings, "documents_storage_dir", tmp_path / "documents")
    yield tmp_path / "documents"
    app.dependency_overrides.clear()


def test_update_profile_fields() -> None:
    body = {
        "bloodType": "O-",
        "allergies": [{"substance": "Peanuts", "reaction": "Hives", "severity": "severe"}],
        "diagnoses": [{"name": "Hypertension", "status": "active"}],
        "treatments": [{"name": "Lisinopril", "dosage": "10 mg", "frequency": "1x daily"}],
    }
    res = client.patch("/api/v1/patients/me", json=body)
    assert res.status_code == 200, res.text
    me = res.json()
    assert me["bloodType"] == "O-"
    assert [a["substance"] for a in me["allergies"]] == ["Peanuts"]
    assert me["allergies"][0]["id"].startswith("al_")
    assert me["diagnoses"][0]["name"] == "Hypertension" and me["diagnoses"][0]["diagnosedAt"]
    assert me["treatments"][0]["active"] is True
    # Partial update: only blood type changes
    me2 = client.patch("/api/v1/patients/me", json={"bloodType": None}).json()
    assert me2["bloodType"] is None and me2["allergies"] == me["allergies"]


def test_update_profile_rejects_invalid_blood_type() -> None:
    assert client.patch("/api/v1/patients/me", json={"bloodType": "Z+"}).status_code == 422


def test_upload_pdf_is_private_and_in_history(private_storage) -> None:  # noqa: ANN001
    res = client.post("/api/v1/documents", files={"file": ("report.pdf", PDF, "application/pdf")},
                      data={"documentType": "lab_result", "title": "Blood test"})
    assert res.status_code == 201, res.text
    doc = res.json()["document"]
    assert doc["mimeType"] == "application/pdf" and doc["status"] == "uploaded" and doc["extraction"] is None
    assert doc["fileUrl"] == f"/api/v1/documents/{doc['id']}/file"

    stored = list(private_storage.rglob("*.pdf"))
    assert len(stored) == 1 and oct(stored[0].stat().st_mode & 0o777) == "0o600"
    assert "report" not in stored[0].name  # path built from server ids, not the filename

    me = client.get("/api/v1/patients/me").json()
    assert me["documents"][0]["id"] == doc["id"]
    assert me["history"][0]["type"] == "document" and me["history"][0]["documentId"] == doc["id"]

    file_res = client.get(doc["fileUrl"])
    assert file_res.status_code == 200 and file_res.content == PDF
    assert file_res.headers["content-type"] == "application/pdf"
    assert "no-store" in file_res.headers["cache-control"]


def test_other_user_cannot_read_document() -> None:
    doc = client.post("/api/v1/documents", files={"file": ("x.png", PNG, "image/png")}).json()["document"]
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="pat_someone_else", role="patient")
    assert client.get(doc["fileUrl"]).status_code == 404


def test_rejects_wrong_type_and_fake_pdf() -> None:
    assert client.post("/api/v1/documents", files={"file": ("a.txt", b"hello", "text/plain")}).status_code == 415
    assert client.post("/api/v1/documents", files={"file": ("a.pdf", b"not a pdf", "application/pdf")}).status_code == 400


def test_path_traversal_id_is_404() -> None:
    assert client.get("/api/v1/documents/..%2F..%2Fetc/file").status_code == 404


# ─────────────────────────────────────────────────────────── basic data (name, birth date, sex, ...)

def test_basic_data_can_be_set_and_changed(monkeypatch):
    from app.services import patient_service
    from app.services.demo_data import DEMO_PATIENT_ID, demo_patient
    monkeypatch.setitem(patient_service._patients, DEMO_PATIENT_ID, demo_patient())
    body = {"fullName": " Ana Pop ", "dateOfBirth": "1990-05-17", "sex": "female", "heightCm": 168, "weightKg": 60.5,
            "emergencyContact": {"name": "Ion Pop", "phone": "+40 722 000 000", "relation": "soț"}}
    res = client.patch("/api/v1/patients/me", json=body)
    assert res.status_code == 200
    data = res.json()
    assert (data["fullName"], data["dateOfBirth"], data["sex"], data["heightCm"], data["weightKg"]) == \
        ("Ana Pop", "1990-05-17", "female", 168, 60.5)
    assert data["emergencyContact"] == {"name": "Ion Pop", "phone": "+40 722 000 000", "relation": "soț"}
    assert data["allergies"]  # fields not sent are kept
    res = client.patch("/api/v1/patients/me", json={"sex": "male", "emergencyContact": None})
    assert res.json()["sex"] == "male" and res.json()["emergencyContact"] is None and res.json()["dateOfBirth"] == "1990-05-17"


@pytest.mark.parametrize("body", [
    {"dateOfBirth": "2999-01-01"}, {"dateOfBirth": "1850-01-01"}, {"dateOfBirth": "1990-02-30"}, {"dateOfBirth": "17.05.1990"},
    {"sex": "unknown"}, {"heightCm": 500}, {"weightKg": 0}, {"fullName": "   "},
    {"emergencyContact": {"name": "X", "phone": "abc"}},
])
def test_basic_data_validation(body):
    assert client.patch("/api/v1/patients/me", json=body).status_code == 422
