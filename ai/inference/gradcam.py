"""Grad-CAM overlay. TODO(ai): implement with pytorch-grad-cam or manual hooks on model.features.denseblock4."""
from __future__ import annotations


def gradcam_overlay(model, input_tensor, class_index: int) -> str:
    """Return the heatmap blended over the input image as a base64-encoded PNG (no data: prefix)."""
    raise NotImplementedError("TODO(ai): Grad-CAM")
