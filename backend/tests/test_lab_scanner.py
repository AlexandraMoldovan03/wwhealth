"""AI Medical Document Scanner: local text extraction from digital PDFs, explicit values only."""
from fastapi.testclient import TestClient

from app.main import app
from app.services import lab_extraction, supabase_repo
from tests.test_supabase_auth import auth, make_token, supabase_mode  # noqa: F401  (fixture)

client = TestClient(app)


def text_pdf(lines: list[str]) -> bytes:
    """Minimal valid PDF with a real text layer (Helvetica)."""
    ops = "BT /F1 11 Tf 14 TL 50 780 Td " + " ".join(f"({ln}) Tj T*" for ln in lines) + " ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(ops)} >>\nstream\n{ops}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = "%PDF-1.4\n", []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{body}\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offsets)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    return out.encode("latin-1")


def upload(content: bytes, name="lab.pdf", mime="application/pdf"):
    return client.post("/api/v1/documents/extract-labs", files={"file": (name, content, mime)})


def test_digital_pdf_returns_only_explicit_values():
    pdf = text_pdf(["Buletin analize 12.11.2026", "Hemoglobina 13,5 g/dL 12,0 - 16,0", "Glicemie 98 mg/dL 70 - 110",
                    "Varsta 45 ani", "Pagina 1 din 2"])
    res = upload(pdf)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["textFound"] is True and body["pageCount"] == 1
    got = {(v["name"], v["value"], v["unit"], v["referenceRange"]) for v in body["values"]}
    assert got == {("Hemoglobina", "13,5", "g/dL", "12,0 - 16,0"), ("Glicemie", "98", "mg/dL", "70 - 110")}
    assert all("flag" not in v for v in body["values"])  # no interpretation


def test_pdf_without_text_layer_is_reported_not_guessed():
    res = upload(text_pdf([]))
    assert res.status_code == 200 and res.json() == {"textFound": False, "pageCount": 1, "values": []}


def test_images_and_broken_pdfs_are_rejected():
    assert upload(b"\x89PNG\r\n\x1a\n" + b"0" * 20, "x.png", "image/png").status_code == 415
    assert upload(b"%PDF-1.4 garbage").status_code == 422


def test_confirmed_values_are_saved_per_document(monkeypatch):
    monkeypatch.setattr(lab_extraction, "_demo_values", {})
    values = [{"name": "Glicemie", "value": "98", "unit": "mg/dL", "referenceRange": "70 - 110"}]
    res = client.put("/api/v1/documents/doc_1/lab-values", json={"values": values})
    assert res.status_code == 200 and res.json()[0]["name"] == "Glicemie"
    assert client.get("/api/v1/documents/doc_1/lab-values").json()[0]["value"] == "98"
    assert client.get("/api/v1/documents/doc_2/lab-values").json() == []


def test_missing_migration_is_a_clear_503(supabase_mode, monkeypatch):  # noqa: F811
    def boom(_u, _d):
        raise supabase_repo.LabStorageUnavailable("Lab values storage not set up")

    monkeypatch.setattr(supabase_repo, "get_lab_values", boom)
    res = supabase_mode.get("/api/v1/documents/11111111-1111-1111-1111-111111111111/lab-values", headers=auth(make_token()))
    assert res.status_code == 503 and "not set up" in res.json()["detail"]
