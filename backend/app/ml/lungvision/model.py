"""DenseNet121 with one output logit — identical architecture to the training notebook (cell 13)."""
from __future__ import annotations

import threading
from pathlib import Path

import torch
from torch import nn
from torchvision import models

from app.ml.lungvision.errors import ModelUnavailableError

MODEL_VERSION = "lungvision-densenet121-pneumoniamnist-v1"

_model: nn.Module | None = None
_model_path: Path | None = None
_load_lock = threading.Lock()


def build_model() -> nn.Module:
    """DenseNet121 (no pretrained download) with classifier = Linear(1024, 1)."""
    model = models.densenet121(weights=None)
    model.classifier = nn.Linear(model.classifier.in_features, 1)
    return model


def load_model(weights_path: Path) -> nn.Module:
    """Loads the state_dict saved by the notebook (`torch.save(model.state_dict(), ...)`)."""
    if not weights_path.is_file():
        raise ModelUnavailableError(f"LungVision weights not found at {weights_path}")
    state_dict = torch.load(weights_path, map_location="cpu", weights_only=True)
    model = build_model()
    model.load_state_dict(state_dict, strict=True)
    model.eval()
    # The features were frozen during training; Grad-CAM needs gradients through them
    # (same as notebook cell 33). Inference itself still runs under torch.no_grad().
    for param in model.parameters():
        param.requires_grad_(True)
    return model


def get_model(weights_path: Path) -> nn.Module:
    """Process-wide cached model (loaded on first request)."""
    global _model, _model_path
    with _load_lock:
        if _model is None or _model_path != weights_path:
            _model = load_model(weights_path)
            _model_path = weights_path
        return _model
