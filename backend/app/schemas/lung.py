from app.schemas.base import CamelModel


class LungAnalysis(CamelModel):
    """POST /api/ai/lung/analyze — experimental LungVision output (not a diagnosis)."""

    score: float  # sigmoid output of the model in [0, 1]; NOT a clinical probability
    threshold: float
    above_threshold: bool
    label: str
    heatmap_png_base64: str | None = None  # Grad-CAM overlay, base64 PNG without "data:" prefix
    model_version: str
    processing_time_ms: int
    is_experimental: bool = True
    disclaimer: str
