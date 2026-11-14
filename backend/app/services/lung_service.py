"""LungVision service: runs the real model in app/ml/lungvision. Never returns simulated output."""
import base64
import time

from app.core.config import BACKEND_DIR, settings
from app.ml.lungvision.errors import ModelUnavailableError
from app.schemas.lung import LungAnalysis

LABEL_FLAGGED = "Pneumonia pattern flagged (experimental)"
LABEL_NOT_FLAGGED = "Not flagged (experimental)"
DISCLAIMER = (
    "Educational prototype, not a medical device. The score is the raw output of a model trained on "
    "PneumoniaMNIST, not a clinical probability or diagnosis. The heatmap shows image regions that "
    "influenced the model, not a confirmed location of pneumonia. Always consult a qualified clinician."
)


def analyze_lung_image(image_bytes: bytes) -> LungAnalysis:
    """Raises InvalidImageError (bad upload) or ModelUnavailableError (server not set up)."""
    try:
        # Lazy import: torch is heavy and optional for the rest of the API.
        from app.ml.lungvision.model import MODEL_VERSION  # noqa: PLC0415
        from app.ml.lungvision.predict_xray import THRESHOLD, predict_xray  # noqa: PLC0415
    except ImportError as exc:
        raise ModelUnavailableError("ML dependencies missing: pip install -r requirements-ml.txt") from exc

    weights_path = settings.lungvision_weights_path
    if not weights_path.is_absolute():
        weights_path = BACKEND_DIR / weights_path

    started = time.perf_counter()
    result = predict_xray(image_bytes, weights_path)
    return LungAnalysis(
        score=round(result.score, 4),
        threshold=THRESHOLD,
        above_threshold=result.above_threshold,
        label=LABEL_FLAGGED if result.above_threshold else LABEL_NOT_FLAGGED,
        heatmap_png_base64=base64.b64encode(result.heatmap_png).decode("ascii") if result.heatmap_png else None,
        model_version=MODEL_VERSION,
        processing_time_ms=int((time.perf_counter() - started) * 1000),
        disclaimer=DISCLAIMER,
    )
