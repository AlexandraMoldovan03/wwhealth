"""Tests run in demo mode (no Supabase) unless a test enables it explicitly, even if backend/.env has keys."""
import pytest

from app.core.config import settings


@pytest.fixture(autouse=True)
def _demo_mode(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_publishable_key", "")
    monkeypatch.setattr(settings, "supabase_secret_key", "")


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    from app.core import rate_limit
    rate_limit.reset()
    yield
    rate_limit.reset()
