"""Shared AI settings. The label order MUST match the model's output layer."""
from pathlib import Path

AI_DIR = Path(__file__).resolve().parent
MODELS_DIR = AI_DIR / "models"
DATA_DIR = AI_DIR / "data"

# TODO(ai): set the final label list (e.g. a subset of NIH ChestX-ray14). Backend + app read labels from the response.
LABELS: list[str] = ["Normal", "Pneumonia", "Effusion", "Cardiomegaly", "Nodule"]

MODEL_VERSION = "densenet121-v0"
WEIGHTS_PATH = MODELS_DIR / "densenet121_lungvision.pt"
IMAGE_SIZE = 224
