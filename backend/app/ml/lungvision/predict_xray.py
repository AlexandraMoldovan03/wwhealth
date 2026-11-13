"""
Upload validation + preprocessing + scoring.

Preprocessing matches ai/notebooks/LungVision_Training.ipynb (cell 7):
    PneumoniaMNIST(size=224) gives 8-bit grayscale 224x224 PIL images, then
    Grayscale(num_output_channels=3) -> ToTensor() -> Normalize(ImageNet mean/std)

The notebook has no resize step because MedMNIST ships images already center-cropped to a
square and resized to 224x224. Real uploads have any size, so we do the same here:
center-crop to a square + resize to 224x224 (ImageOps.fit). Do not change MEAN/STD/IMAGE_SIZE/THRESHOLD
without retraining or re-validating the model.
"""
from __future__ import annotations

import io
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps, UnidentifiedImageError
from torchvision import transforms

from app.ml.lungvision.errors import InvalidImageError
from app.ml.lungvision.gradcam import compute_gradcam, overlay_png
from app.ml.lungvision.model import get_model

IMAGE_SIZE = 224
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]
THRESHOLD = 0.3  # chosen on the validation set in the notebook (cells 22-25)

ALLOWED_FORMATS = {"JPEG", "PNG"}
MIN_SIDE = 64
MAX_PIXELS = 40_000_000

# Exactly the notebook transform (applied to an 8-bit grayscale 224x224 image).
NOTEBOOK_TRANSFORM = transforms.Compose([
    transforms.Grayscale(num_output_channels=3),
    transforms.ToTensor(),
    transforms.Normalize(mean=MEAN, std=STD),
])

# Grad-CAM registers hooks on the shared model, so one analysis at a time.
_inference_lock = threading.Lock()


@dataclass(frozen=True)
class XrayScore:
    score: float  # sigmoid(logit) in [0, 1] — model output, NOT a clinical probability
    above_threshold: bool
    heatmap_png: bytes | None


def decode_image(data: bytes) -> Image.Image:
    """Opens a JPEG/PNG upload safely (format, size, decompression-bomb checks). Nothing is written to disk."""
    try:
        with Image.open(io.BytesIO(data)) as probe:
            image_format, (width, height) = probe.format, probe.size
            probe.verify()
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image)
        image.load()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
        raise InvalidImageError("The file is not a valid JPEG or PNG image.") from exc
    if image_format not in ALLOWED_FORMATS:
        raise InvalidImageError("Only JPEG and PNG images are supported.")
    if min(width, height) < MIN_SIDE:
        raise InvalidImageError(f"Image is too small (minimum {MIN_SIDE}x{MIN_SIDE} px).")
    if width * height > MAX_PIXELS:
        raise InvalidImageError("Image resolution is too large.")
    return image


def _to_8bit_grayscale(image: Image.Image) -> Image.Image:
    """PneumoniaMNIST images are 8-bit grayscale ('L'). 16-bit PNGs are rescaled instead of clipped."""
    if image.mode.startswith("I"):
        array = np.asarray(image, dtype=np.float32)
        low, high = float(array.min()), float(array.max())
        scaled = (array - low) / (high - low) * 255.0 if high > low else np.zeros_like(array)
        return Image.fromarray(scaled.astype(np.uint8), mode="L")
    return image.convert("L")


def to_model_image(image: Image.Image) -> Image.Image:
    """8-bit grayscale, center-cropped to a square and resized to 224x224 (like MedMNIST)."""
    gray = _to_8bit_grayscale(image)
    return ImageOps.fit(gray, (IMAGE_SIZE, IMAGE_SIZE), method=Image.Resampling.BICUBIC, centering=(0.5, 0.5))


def preprocess(image: Image.Image) -> torch.Tensor:
    """PIL image -> normalized tensor of shape (1, 3, 224, 224)."""
    return NOTEBOOK_TRANSFORM(to_model_image(image)).unsqueeze(0)


def predict_xray(image_bytes: bytes, weights_path: Path, with_gradcam: bool = True) -> XrayScore:
    model_image = to_model_image(decode_image(image_bytes))
    input_tensor = NOTEBOOK_TRANSFORM(model_image).unsqueeze(0)
    model = get_model(weights_path)

    with _inference_lock:
        with torch.no_grad():
            score = float(torch.sigmoid(model(input_tensor)).item())
        heatmap = None
        if with_gradcam:
            # Same base image as the notebook's denormalized tensor: grayscale replicated to RGB, in [0, 1].
            rgb = np.asarray(model_image.convert("RGB"), dtype=np.float32) / 255.0
            heatmap = overlay_png(rgb, compute_gradcam(model, input_tensor))

    return XrayScore(score=score, above_threshold=score >= THRESHOLD, heatmap_png=heatmap)
