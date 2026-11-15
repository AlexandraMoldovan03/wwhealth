from typing import Literal

from app.schemas.base import CamelModel
from app.services.voice_translation import VoiceTranslation


class Symptom(CamelModel):
    name: str
    duration: str | None = None
    severity: Literal["mild", "moderate", "severe"] | None = None
    notes: str | None = None


class IntakeDetails(CamelModel):
    summary: str
    symptoms: list[Symptom]
    medications_mentioned: list[str]
    allergies_mentioned: list[str]
    urgent_warning: bool


class IntakeForm(IntakeDetails):
    transcript: str
    language: str | None = None             # detected by ElevenLabs Scribe (any supported language)
    language_probability: float | None = None
    translation: VoiceTranslation | None = None  # into the app language; the transcript above stays original
    is_demo: bool = False
    disclaimer: str = "AI structures what the patient said. It does not diagnose. In an emergency call 112."
