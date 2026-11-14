"""DenseNet121 definition + cached loading. TODO(ai): implement (needs torch/torchvision)."""
from __future__ import annotations

from ai.config import LABELS, WEIGHTS_PATH


def build_model(num_classes: int = len(LABELS)):  # -> torch.nn.Module
    """torchvision.models.densenet121(weights="DEFAULT") with classifier replaced by Linear(1024, num_classes)."""
    raise NotImplementedError("TODO(ai): build DenseNet121")


def load_model():  # -> torch.nn.Module
    """Load WEIGHTS_PATH once (functools.lru_cache), map to CPU, model.eval()."""
    raise NotImplementedError(f"TODO(ai): load weights from {WEIGHTS_PATH}")
