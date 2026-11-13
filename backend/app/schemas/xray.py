from app.schemas.base import CamelModel


class XrayPrediction(CamelModel):
    label: str
    probability: float


class XrayAnalysis(CamelModel):
    id: str
    created_at: str
    image_url: str | None = None
    heatmap_url: str | None = None
    predictions: list[XrayPrediction]
    top_label: str
    model_version: str
    processing_time_ms: int
    is_demo: bool
    disclaimer: str
