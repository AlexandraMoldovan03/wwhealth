"""Medical summary + ElevenLabs audio. TODO(backend): Gemini summary text + ElevenLabs TTS → audio URL."""
from app.core.config import settings
from app.schemas.patient import PatientRecord
from app.schemas.voice import VoiceSummaryResponse


def build_summary(patient: PatientRecord, language: str) -> VoiceSummaryResponse:
    _ = language
    active = ", ".join(d.name for d in patient.diagnoses if d.status == "active") or "none"
    allergies = ", ".join(a.substance for a in patient.allergies) or "none"
    text = f"{patient.full_name}, born {patient.date_of_birth}. Active conditions: {active}. Allergies: {allergies}."
    if settings.elevenlabs_api_key:
        pass  # TODO(backend): generate audio, upload, return audio_url
    return VoiceSummaryResponse(text=text, audio_url=None, is_demo=True)
