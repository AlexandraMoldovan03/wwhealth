"""Grad-CAM on model.features.norm5 (as tested in Colab, notebook cells 31-34)."""
from __future__ import annotations

import io

import numpy as np
import torch
from PIL import Image
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.image import show_cam_on_image
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
from torch import nn


def compute_gradcam(model: nn.Module, input_tensor: torch.Tensor) -> np.ndarray:
    """Returns a 224x224 float map in [0, 1] for the single output logit (pneumonia)."""
    target_layer = model.features.norm5
    with GradCAM(model=model, target_layers=[target_layer]) as cam:
        # pytorch-grad-cam stores `output.cpu().detach()`. On CPU that shares memory with norm5's
        # output, which DenseNet then overwrites with an in-place ReLU. On the Colab GPU `.cpu()`
        # makes a copy. Returning a clone from a hook registered AFTER grad-cam's hooks keeps the
        # stored activation equal to the raw norm5 output, so results match the notebook.
        handle = target_layer.register_forward_hook(lambda _module, _inputs, output: output.clone())
        try:
            with torch.enable_grad():
                grayscale_cam = cam(input_tensor=input_tensor, targets=[ClassifierOutputTarget(0)])[0]
        finally:
            handle.remove()
    return grayscale_cam


def overlay_png(model_input_rgb: np.ndarray, grayscale_cam: np.ndarray) -> bytes:
    """Heatmap over the (224x224) image the model saw. `model_input_rgb` is float32 HxWx3 in [0, 1]."""
    overlay = show_cam_on_image(model_input_rgb, grayscale_cam, use_rgb=True)
    buffer = io.BytesIO()
    Image.fromarray(overlay).save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
