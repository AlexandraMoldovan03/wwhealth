from typing import Literal

from app.schemas.base import CamelModel


class VoiceSummaryRequest(CamelModel):
    patient_id: str
    language: Literal["en", "ro"] = "en"


class VoiceSummaryResponse(CamelModel):
    text: str
    audio_url: str | None = None
    is_demo: bool
