"""
CONTRACT used by the backend (backend/app/services/xray_service.py). Do not change the
signature or the returned keys without updating docs/API_CONTRACT.md.

    predict_xray(image_bytes: bytes, with_gradcam: bool = True) -> XrayPredictionResult

- image_bytes: raw JPEG/PNG bytes of a frontal chest X-ray (as uploaded by the user)
- returns a dict:
    predictions         list[{"label": str, "probability": float}]  sorted desc, probabilities in 0..1
    top_label           str     == predictions[0]["label"]
    heatmap_png_base64  str|None  Grad-CAM overlay as base64 PNG (no "data:" prefix)
    model_version       str
    is_demo             bool    True while weights are missing (placeholder output)

Rules: no network calls, no global state besides the cached model, must not crash on a
non-X-ray image (return low-confidence predictions instead).
"""
from __future__ import annotations

import random
from typing import TypedDict

from ai.config import LABELS, MODEL_VERSION, WEIGHTS_PATH


class Prediction(TypedDict):
    label: str
    probability: float


class XrayPredictionResult(TypedDict):
    predictions: list[Prediction]
    top_label: str
    heatmap_png_base64: str | None
    model_version: str
    is_demo: bool


def _placeholder() -> XrayPredictionResult:
    raw = [random.random() for _ in LABELS]
    total = sum(raw)
    preds: list[Prediction] = sorted(
        ({"label": label, "probability": value / total} for label, value in zip(LABELS, raw)),
        key=lambda p: p["probability"],
        reverse=True,
    )
    return {"predictions": preds, "top_label": preds[0]["label"], "heatmap_png_base64": None,
            "model_version": f"{MODEL_VERSION}-placeholder", "is_demo": True}


def predict_xray(image_bytes: bytes, with_gradcam: bool = True) -> XrayPredictionResult:
    if not WEIGHTS_PATH.exists():
        return _placeholder()

    # TODO(ai): real inference. Sketch:
    #   model = load_model()                      # cached DenseNet121, eval mode
    #   tensor = preprocess(image_bytes)          # grayscale→RGB, resize IMAGE_SIZE, ImageNet normalize
    #   probs = torch.sigmoid(model(tensor))[0]   # multi-label  (or softmax for single-label)
    #   heatmap = gradcam_overlay(model, tensor, class_idx) if with_gradcam else None
    _ = (image_bytes, with_gradcam)
    return _placeholder()
