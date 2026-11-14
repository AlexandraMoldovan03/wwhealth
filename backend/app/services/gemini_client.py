"""
Gemini via the Google Gen AI SDK — server side only (GEMINI_API_KEY from backend/.env, never sent to the app).

Structured output (JSON schema of GeminiDraft) + strict Pydantic validation. Timeout, no retries, and
NOTHING of the prompt or the answer is logged (only the error type / HTTP status).
"""
import logging

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.schemas.intelligence import GeminiDraft

log = logging.getLogger("wwhealth.ai")
DEFAULT_MODEL = "gemini-3.5-flash-lite"

SYSTEM_INSTRUCTION = """You organise a patient's EXISTING medical record for a clinician. You receive a JSON list of facts,
each with an "id". Rules — follow all of them:
1. Use ONLY the facts given. Never add a diagnosis, condition, severity, stage, treatment, dose, cause or date that is
   not literally in a fact. If something is unknown, say it is not documented (in missing_information).
2. Every statement must list in source_ids the ids of the facts it is based on. A statement without real ids is invalid.
3. Repeat names, values, units, dates and reference ranges exactly as written. Do not convert units.
4. No recommendations, no advice, no risk scores, no prognosis, no judgement of severity or contagiousness.
   Sensitive diagnoses (e.g. HIV, blood disorders) are stated factually, like any other documented condition.
5. critical_information: only documented allergies (especially anaphylaxis / severe), active conditions, current
   medication and lab values flagged outside_reference_range. A past surgery is NOT critical by itself.
6. active_conditions: conditions with status "active" (name them). medications: active medication (name them).
   surgical_history: surgeries (name them). lab_findings: name + value + unit + date + reference range of the values.
7. overview: 2-4 neutral sentences describing what is documented, with source_ids.
8. Write in {language}. Keep each statement short (max 300 characters)."""


class GeminiNotConfigured(Exception):
    pass


class GeminiTimeout(Exception):
    pass


class GeminiRateLimited(Exception):
    pass


class GeminiFailed(Exception):
    pass


def model_name() -> str:
    return settings.gemini_summary_model.strip() or DEFAULT_MODEL


def configured() -> bool:
    return bool(settings.gemini_api_key)


def generate_draft(facts_json: str, language: str) -> GeminiDraft:
    """Blocking call (run it in a thread). Raises one of the exceptions above; never logs medical content."""
    if not configured():
        raise GeminiNotConfigured
    from google import genai  # imported lazily: the rest of the API runs without the SDK
    from google.genai import errors, types

    client = genai.Client(
        api_key=settings.gemini_api_key,
        http_options=types.HttpOptions(timeout=int(settings.gemini_timeout_seconds * 1000)),
    )
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION.format(language="Romanian" if language == "ro" else "English"),
        response_mime_type="application/json",
        response_json_schema=GeminiDraft.model_json_schema(),
        temperature=0.1,
        max_output_tokens=8192,
    )
    try:
        response = client.models.generate_content(
            model=model_name(), contents=f"FACTS:\n{facts_json}", config=config,
        )
    except (httpx.TimeoutException, TimeoutError) as exc:
        log.warning("gemini summary: timeout")
        raise GeminiTimeout from exc
    except errors.APIError as exc:
        log.warning("gemini summary: API error %s", getattr(exc, "code", "?"))
        if getattr(exc, "code", None) == 429:
            raise GeminiRateLimited from exc
        raise GeminiFailed from exc
    except httpx.HTTPError as exc:
        log.warning("gemini summary: network error %s", type(exc).__name__)
        raise GeminiFailed from exc
    finally:
        client.close()
    try:
        return GeminiDraft.model_validate_json(response.text or "")
    except ValidationError as exc:
        log.warning("gemini summary: response failed schema validation (%d errors)", exc.error_count())
        raise GeminiFailed from exc
