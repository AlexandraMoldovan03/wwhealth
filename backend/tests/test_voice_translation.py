"""Multilingual voice: Scribe language detection → Gemini translation into ro / en, original kept, numbers kept."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.intake import IntakeDetails
from app.services import intake_service
from app.services import voice_translation as vt

client = TestClient(app)


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def gemini(monkeypatch):
    """Fake Gemini translation: a lookup table, so the tests check our logic, not the model."""
    monkeypatch.setattr(settings, "gemini_api_key", "test-not-real")
    table: dict[tuple[str, str], vt._Draft] = {}

    async def fake(transcript, target):
        return table[(transcript, target)]

    monkeypatch.setattr(vt, "_gemini", fake)
    return table


@pytest.mark.parametrize(("code", "expected"), [("ron", "ro"), ("eng", "en"), ("spa", "es"), ("es-ES", "es"),
                                                ("ro", "ro"), ("xyz", "xyz"), ("", None), (None, None)])
def test_language_codes_are_normalised(code, expected):
    assert vt.normalize_language(code) == expected


def test_ro_to_en(gemini):
    text = "Iau Metformin 500 mg de două ori pe zi și am glicemia 180 mg/dL."
    gemini[(text, "en")] = vt._Draft(translation="I take Metformin 500 mg twice a day and my blood sugar is 180 mg/dL.",
                                     uncertain=False, uncertain_parts=[])
    out = run(vt.translate(text, "ron", 0.99, "en"))
    assert out.status == "translated" and out.source_language == "ro" and "Metformin 500 mg" in out.text


def test_en_to_ro(gemini):
    text = "I think I might have asthma, I use Ventolin 100 mcg."
    gemini[(text, "ro")] = vt._Draft(translation="Cred că s-ar putea să am astm, folosesc Ventolin 100 mcg.",
                                     uncertain=False, uncertain_parts=[])
    out = run(vt.translate(text, "eng", 0.97, "ro"))
    assert out.status == "translated" and "s-ar putea" in out.text  # the doubt is kept, no confirmed diagnosis


@pytest.mark.parametrize("target", ["ro", "en"])
def test_spanish_to_ro_and_en(gemini, target):
    text = "Tengo fiebre de 38,5 desde hace 3 días y tomo ibuprofeno 400 mg."
    gemini[(text, "ro")] = vt._Draft(translation="Am febră de 38,5 de 3 zile și iau ibuprofen 400 mg.",
                                     uncertain=False, uncertain_parts=[])
    gemini[(text, "en")] = vt._Draft(translation="I have had a fever of 38.5 for 3 days and I take ibuprofen 400 mg.",
                                     uncertain=False, uncertain_parts=[])
    out = run(vt.translate(text, "spa", 0.95, target))
    assert out.status == "translated" and out.source_language == "es" and "400 mg" in out.text


def test_same_language_needs_no_translation(gemini):
    out = run(vt.translate("Mă doare capul", "ron", 0.99, "ro"))
    assert out.status == "same_language" and out.text is None


def test_changed_number_marks_translation_uncertain(gemini):
    text = "Tomo 25 mg de metoprolol."
    gemini[(text, "en")] = vt._Draft(translation="I take 50 mg of metoprolol.", uncertain=False, uncertain_parts=[])
    out = run(vt.translate(text, "spa", 0.9, "en"))
    assert out.status == "uncertain" and "25" in out.uncertain_parts


def test_model_doubt_is_reported(gemini):
    text = "Me dieron algo para el corazón, creo que se llama Sintrom."
    gemini[(text, "ro")] = vt._Draft(translation="Mi-au dat ceva pentru inimă, cred că se numește Sintrom.",
                                     uncertain=True, uncertain_parts=["algo para el corazón"])
    out = run(vt.translate(text, "spa", 0.9, "ro"))
    assert out.status == "uncertain" and out.uncertain_parts == ["algo para el corazón"]


def test_unidentified_language_is_flagged(gemini):
    text = "mmm ... ok"
    gemini[(text, "en")] = vt._Draft(translation="mmm ... ok", uncertain=True, uncertain_parts=["mmm"])
    assert run(vt.translate(text, "spa", 0.2, "en")).status == "unknown_language"
    assert run(vt.translate(text, None, None, "en")).status == "unknown_language"


def test_without_gemini_or_on_error_translation_is_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    assert run(vt.translate("Hola", "spa", 0.9, "ro")).status == "unavailable"
    monkeypatch.setattr(settings, "gemini_api_key", "test-not-real")

    async def broken(*_):
        raise ValueError("bad json")

    monkeypatch.setattr(vt, "_gemini", broken)
    assert run(vt.translate("Hola", "spa", 0.9, "ro")).status == "unavailable"


def test_intake_keeps_original_and_translation_apart(gemini, monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "test-not-real")
    spoken = "Me duele el pecho desde ayer."
    targets = []

    async def heard(*_):
        return intake_service.Transcription(spoken, "es", 0.96)

    async def structure(text, target):
        targets.append(target)
        return IntakeDetails(summary="Durere în piept de ieri.", symptoms=[], medications_mentioned=[],
                             allergies_mentioned=[], urgent_warning=True)

    monkeypatch.setattr(intake_service, "transcribe", heard)
    monkeypatch.setattr(intake_service, "structure", structure)
    gemini[(spoken, "ro")] = vt._Draft(translation="Mă doare pieptul de ieri.", uncertain=False, uncertain_parts=[])
    res = client.post("/api/v1/intake/voice", files={"file": ("v.m4a", b"x", "audio/mp4")}, data={"language": "ro"})
    body = res.json()
    assert res.status_code == 200 and targets == ["ro"]
    assert body["transcript"] == spoken and body["language"] == "es" and body["languageProbability"] == 0.96
    assert body["translation"] == {"status": "translated", "sourceLanguage": "es", "targetLanguage": "ro",
                                   "text": "Mă doare pieptul de ieri.", "uncertainParts": []}


def test_smart_care_translate_endpoint(gemini):
    gemini[("Tengo tos", "en")] = vt._Draft(translation="I have a cough", uncertain=False, uncertain_parts=[])
    res = client.post("/api/v1/smart-care/translate", json={"text": "Tengo tos", "sourceLanguage": "es",
                                                             "targetLanguage": "en"})
    assert res.status_code == 200 and res.json()["text"] == "I have a cough"
    assert client.post("/api/v1/smart-care/translate", json={"text": "x", "targetLanguage": "de"}).status_code == 422
