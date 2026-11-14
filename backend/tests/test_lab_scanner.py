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


def png_bytes() -> bytes:
    from io import BytesIO

    from PIL import Image

    buf = BytesIO()
    Image.new("L", (40, 20), 255).save(buf, "PNG")
    return buf.getvalue()


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


def test_pdf_without_text_layer_is_reported_not_guessed(monkeypatch):
    monkeypatch.setattr(lab_extraction, "ocr_available", lambda: False)
    res = upload(text_pdf([]))
    assert res.status_code == 200
    body = res.json()
    assert body["textFound"] is False and body["values"] == [] and body["method"] == "none"
    assert body["ocrAvailable"] is False


def test_image_without_ocr_engine_says_so(monkeypatch):
    monkeypatch.setattr(lab_extraction, "ocr_available", lambda: False)
    res = upload(png_bytes(), "x.png", "image/png")
    assert res.status_code == 200
    assert res.json()["ocrAvailable"] is False and res.json()["values"] == []


def test_ocr_values_always_need_manual_review(monkeypatch):
    monkeypatch.setattr(lab_extraction, "ocr_available", lambda: True)
    monkeypatch.setattr(lab_extraction, "ocr_image",
                        lambda _c: "Data recoltarii: 03.10.2026\nHemoglobina 13,5 g/dL 12,0 - 16,0\nText fara valori")
    res = upload(png_bytes(), "x.png", "image/png")
    body = res.json()
    assert res.status_code == 200 and body["method"] == "ocr"
    assert body["documentDate"] == "2026-10-03"
    assert [v["name"] for v in body["values"]] == ["Hemoglobina"] and body["values"][0]["needsReview"] is True


def test_broken_files_and_other_types_are_rejected():
    assert upload(b"%PDF-1.4 garbage").status_code == 422
    assert upload(b"hello", "x.txt", "text/plain").status_code == 415


def test_document_date_only_when_unambiguous():
    assert lab_extraction.find_document_date("Data recoltare: 12.11.2026\nTiparit 13.11.2026") == "2026-11-12"
    assert lab_extraction.find_document_date("Buletin 12.11.2026") == "2026-11-12"  # single date
    assert lab_extraction.find_document_date("12.11.2026\n13.11.2026") is None  # ambiguous → not guessed
    assert lab_extraction.find_document_date("31.02.2026") is None  # invalid
    assert lab_extraction.find_document_date("Fara data") is None


def test_value_without_unit_needs_review():
    vals = lab_extraction.parse_lab_values("INR 1,1 0,8 - 1,2\nGlicemie 98 mg/dL 70 - 110")
    review = {v["name"]: v["needs_review"] for v in vals}
    assert review == {"INR": True, "Glicemie": False}


def test_confirmed_values_are_saved_per_document(monkeypatch):
    monkeypatch.setattr(lab_extraction, "_demo_values", {})
    values = [{"name": "Glicemie", "value": "98", "unit": "mg/dL", "referenceRange": "70 - 110"}]
    res = client.put("/api/v1/documents/doc_1/lab-values", json={"values": values})
    assert res.status_code == 200 and res.json()[0]["name"] == "Glicemie"
    assert client.get("/api/v1/documents/doc_1/lab-values").json()[0]["value"] == "98"
    assert client.get("/api/v1/documents/doc_2/lab-values").json() == []


def test_values_keep_date_list_across_documents_and_delete(monkeypatch):
    monkeypatch.setattr(lab_extraction, "_demo_values", {})
    v1 = [{"name": "Glicemie", "value": "98", "unit": "mg/dL", "measuredAt": "2026-10-01", "needsReview": True}]
    v2 = [{"name": "Glicemie", "value": "105", "unit": "mg/dL", "measuredAt": "2026-11-01"}]
    assert client.put("/api/v1/documents/doc_1/lab-values", json={"values": v1}).status_code == 200
    assert client.put("/api/v1/documents/doc_2/lab-values", json={"values": v2}).status_code == 200
    listed = client.get("/api/v1/documents/lab-values").json()
    assert sorted((v["documentId"], v["value"], v["measuredAt"]) for v in listed) == [
        ("doc_1", "98", "2026-10-01"), ("doc_2", "105", "2026-11-01")]
    assert all(v["needsReview"] is False for v in listed)  # review flag is never stored
    assert client.put("/api/v1/documents/doc_1/lab-values", json={"values": []}).json() == []  # delete
    assert [v["documentId"] for v in client.get("/api/v1/documents/lab-values").json()] == ["doc_2"]
    bad = client.put("/api/v1/documents/doc_1/lab-values", json={"values": [{**v2[0], "measuredAt": "12.11.2026"}]})
    assert bad.status_code == 422


def test_missing_migration_is_a_clear_503(supabase_mode, monkeypatch):  # noqa: F811
    def boom(_u, _d):
        raise supabase_repo.LabStorageUnavailable("Lab values storage not set up")

    monkeypatch.setattr(supabase_repo, "get_lab_values", boom)
    res = supabase_mode.get("/api/v1/documents/11111111-1111-1111-1111-111111111111/lab-values", headers=auth(make_token()))
    assert res.status_code == 503 and "not set up" in res.json()["detail"]
