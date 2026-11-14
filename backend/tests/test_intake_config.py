"""Voice intake without transcription keys: demo form only in demo mode, a clear 503 with real accounts."""

import asyncio

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.services import intake_service


def _run(monkeypatch, *, supabase: bool, eleven: str, gemini: str):
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co" if supabase else "")
    monkeypatch.setattr(settings, "supabase_publishable_key", "test-publishable" if supabase else "")
    monkeypatch.setattr(settings, "elevenlabs_api_key", eleven)
    monkeypatch.setattr(settings, "gemini_api_key", gemini)
    return asyncio.run(intake_service.build_form(b"audio", "a.m4a", "audio/mp4"))


def test_demo_mode_returns_example_form(monkeypatch):
    form = _run(monkeypatch, supabase=False, eleven="", gemini="")
    assert form.is_demo


@pytest.mark.parametrize(("eleven", "gemini", "missing"), [("", "g", "ELEVENLABS_API_KEY"), ("e", "", "GEMINI_API_KEY")])
def test_real_mode_without_keys_is_503_not_fake_symptoms(monkeypatch, eleven, gemini, missing):
    with pytest.raises(HTTPException) as exc:
        _run(monkeypatch, supabase=True, eleven=eleven, gemini=gemini)
    assert exc.value.status_code == 503
    assert missing in exc.value.detail
