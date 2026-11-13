"""LungVision. Calls ai/inference/predict.py::predict_xray when USE_AI_MODEL=true, else a demo result."""
import random
import sys
import time
import uuid
from datetime import UTC, datetime

from app.core.config import REPO_ROOT, settings
from app.schemas.xray import XrayAnalysis, XrayPrediction
from app.services import patient_service
from app.services.demo_data import DISCLAIMER

LABELS = ["Normal", "Pneumonia", "Effusion", "Cardiomegaly", "Nodule"]


def _demo_prediction() -> dict:
    raw = [random.random() for _ in LABELS]
    total = sum(raw)
    preds = sorted(
        ({"label": label, "probability": value / total} for label, value in zip(LABELS, raw, strict=True)),
        key=lambda p: p["probability"],
        reverse=True,
    )
    return {"predictions": preds, "top_label": preds[0]["label"], "heatmap_png_base64": None,
            "model_version": "densenet121-demo", "is_demo": True}


def _model_prediction(image_bytes: bytes) -> dict:
    # The ai/ package lives at the repo root (owned by the AI dev).
    if str(REPO_ROOT) not in sys.path:
        sys.path.append(str(REPO_ROOT))
    from ai.inference.predict import predict_xray  # noqa: PLC0415 — lazy: torch is heavy

    return dict(predict_xray(image_bytes))


def analyze_xray(patient_id: str, image_bytes: bytes) -> XrayAnalysis:
    started = time.perf_counter()
    result = _model_prediction(image_bytes) if settings.use_ai_model else _demo_prediction()
    heatmap = result.get("heatmap_png_base64")
    analysis = XrayAnalysis(
        id=f"xray_{uuid.uuid4().hex[:10]}",
        created_at=datetime.now(UTC).isoformat(),
        image_url=None,  # TODO(backend): store the image and return its URL
        heatmap_url=f"data:image/png;base64,{heatmap}" if heatmap else None,
        predictions=[XrayPrediction(**p) for p in result["predictions"]],
        top_label=result["top_label"],
        model_version=result["model_version"],
        processing_time_ms=int((time.perf_counter() - started) * 1000),
        is_demo=bool(result.get("is_demo", False)),
        disclaimer=DISCLAIMER,
    )
    record = patient_service.get_patient(patient_id)
    if record:
        record.xrays.insert(0, analysis)
    return analysis
