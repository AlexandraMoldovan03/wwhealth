"""LungVision tests. Model tests are skipped when torch or backend/models/lungvision_best.pth is missing."""
import base64
import io

import pytest
from fastapi.testclient import TestClient

from app.core.config import BACKEND_DIR, settings
from app.main import app

client = TestClient(app)
URL = "/api/ai/lung/analyze"
WEIGHTS = settings.lungvision_weights_path if settings.lungvision_weights_path.is_absolute() else BACKEND_DIR / settings.lungvision_weights_path

needs_model = pytest.mark.skipif(not WEIGHTS.is_file(), reason=f"weights not found: {WEIGHTS}")


def _png(size: tuple[int, int] = (300, 260), mode: str = "L") -> bytes:
    pil = pytest.importorskip("PIL.Image")
    image = pil.linear_gradient("L").resize(size)
    if mode != "L":
        image = image.convert(mode)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


# ---------- model ----------

@needs_model
def test_model_loads_checkpoint() -> None:
    torch = pytest.importorskip("torch")
    from app.ml.lungvision.model import load_model

    model = load_model(WEIGHTS)  # torch.load(..., weights_only=True) + strict state_dict
    assert not model.training
    assert model.classifier.in_features == 1024 and model.classifier.out_features == 1
    with torch.no_grad():
        logits = model(torch.zeros(1, 3, 224, 224))
    assert logits.shape == (1, 1)


def test_preprocessing_matches_notebook() -> None:
    pytest.importorskip("torch")
    from PIL import Image

    from app.ml.lungvision.predict_xray import MEAN, STD, THRESHOLD, preprocess

    assert (MEAN, STD, THRESHOLD) == ([0.485, 0.456, 0.406], [0.229, 0.224, 0.225], 0.3)
    tensor = preprocess(Image.new("RGB", (640, 480), (255, 255, 255)))
    assert tuple(tensor.shape) == (1, 3, 224, 224)
    # white pixel -> (1 - mean) / std on each channel
    for channel, (m, s) in enumerate(zip(MEAN, STD, strict=True)):
        assert tensor[0, channel].mean().item() == pytest.approx((1 - m) / s, abs=1e-4)


# ---------- endpoint ----------

@needs_model
def test_analyze_endpoint_returns_score_and_heatmap() -> None:
    pytest.importorskip("torch")
    res = client.post(URL, files={"file": ("xray.png", _png(), "image/png")})
    assert res.status_code == 200, res.text
    body = res.json()
    assert 0.0 <= body["score"] <= 1.0
    assert body["threshold"] == 0.3
    assert body["aboveThreshold"] == (body["score"] >= 0.3)
    assert "experimental" in body["label"].lower()
    assert body["isExperimental"] is True
    assert "not a" in body["disclaimer"].lower()
    heatmap = base64.b64decode(body["heatmapPngBase64"])
    assert heatmap.startswith(b"\x89PNG")


def test_rejects_unsupported_content_type() -> None:
    res = client.post(URL, files={"file": ("notes.txt", b"hello", "text/plain")})
    assert res.status_code == 415


def test_rejects_file_that_is_not_an_image() -> None:
    pytest.importorskip("PIL")
    res = client.post(URL, files={"file": ("fake.png", b"not really a png", "image/png")})
    assert res.status_code == 400


def test_rejects_too_small_image() -> None:
    res = client.post(URL, files={"file": ("tiny.png", _png((32, 32)), "image/png")})
    assert res.status_code == 400


def test_old_xray_endpoint_unchanged() -> None:
    res = client.post("/api/v1/xray/analyze", files={"file": ("x.png", _png(), "image/png")})
    assert res.status_code == 200
    assert "predictions" in res.json()


def test_missing_weights_returns_503_not_fake_result(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:  # noqa: ANN001
    pytest.importorskip("torch")
    monkeypatch.setattr(settings, "lungvision_weights_path", tmp_path / "missing.pth")
    res = client.post(URL, files={"file": ("xray.png", _png(), "image/png")})
    assert res.status_code == 503
