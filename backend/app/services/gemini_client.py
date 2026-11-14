"""
Gemini via the Google Gen AI SDK — server side only (GEMINI_API_KEY from backend/.env, never sent to the app).

Structured output (JSON schema) + strict Pydantic validation. Timeout per attempt; a temporary Gemini error
(HTTP 500 / 502 / 503 / 504, "model overloaded") is retried twice with a short pause. NOTHING of the prompt or the
answer is logged (only the error type / HTTP status).
"""
import json
import logging
import random
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
import time
from collections.abc import Callable

import httpx
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.core.config import settings
from app.schemas.intelligence import GeminiDraft

log = logging.getLogger("wwhealth.ai")
M = TypeVar("M", bound=BaseModel)
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
    """reason: busy (Gemini overloaded / 5xx after retries) · invalid (answer not in the schema) · error (other)."""

    def __init__(self, reason: str = "error"):
        super().__init__(reason)
        self.reason = reason


TRANSIENT_CODES = {500, 502, 503, 504}
RETRY_DELAYS = (1.0, 2.5)


def model_name() -> str:
    return settings.gemini_summary_model.strip() or DEFAULT_MODEL


def configured() -> bool:
    return bool(settings.gemini_api_key)


# Gemini's structured-output schema rejects length / count limits ("400 INVALID_ARGUMENT"). They are removed from the
# schema SENT to Gemini only; the full Pydantic model (with every limit, extra="forbid") still validates the answer.
_UNSUPPORTED_SCHEMA_KEYS = {"maxLength", "minLength", "maxItems", "minItems"}


def gemini_schema(model: type[BaseModel]) -> dict:
    def clean(node):
        if isinstance(node, dict):
            return {k: clean(v) for k, v in node.items() if k not in _UNSUPPORTED_SCHEMA_KEYS}
        if isinstance(node, list):
            return [clean(v) for v in node]
        return node

    return clean(model.model_json_schema())


def _retry_delay(error, attempt: int) -> float:
    delay = random.uniform(0.5, 1.0) * 2 ** attempt
    response = getattr(error, "response", None)
    value = (getattr(response, "headers", None) or {}).get("Retry-After")
    if value:
        try:
            seconds = float(value)
        except ValueError:
            try:
                date = parsedate_to_datetime(value)
                seconds = (date.replace(tzinfo=date.tzinfo or UTC) - datetime.now(UTC)).total_seconds()
            except (ValueError, TypeError, OverflowError):
                seconds = 0
        delay = max(delay, seconds)
    return delay


def _project_quota_exhausted(error) -> bool:
    """Only structured billing or long-window quota errors qualify for failover."""
    if getattr(error, "code", None) not in {403, 429}:
        return False
    body = getattr(error, "details", None)
    if not isinstance(body, dict):
        return False
    payload = body.get("error", body)
    if not isinstance(payload, dict):
        return False
    for detail in payload.get("details") or []:
        if not isinstance(detail, dict):
            continue
        kind = detail.get("@type")
        if kind == "type.googleapis.com/google.rpc.ErrorInfo" and detail.get("reason") in {
            "BILLING_DISABLED", "BILLING_NOT_ACTIVE", "DAILY_LIMIT_EXCEEDED", "MONTHLY_LIMIT_EXCEEDED"
        }:
            return True
        if kind == "type.googleapis.com/google.rpc.QuotaFailure":
            for violation in detail.get("violations") or []:
                if isinstance(violation, dict) and any(
                    marker in str(violation.get(key, "")).lower()
                    for key in ("quotaId", "quotaMetric")
                    for marker in ("perday", "permonth", "daily", "monthly")
                ):
                    return True
    return False


def generate_structured(model: type[M], system_instruction: str, contents: str, label: str,
                        repair: Callable[[dict], dict] | None = None, *, model_override: str | None = None,
                        usage: dict | None = None, max_output_tokens: int = 8192) -> M:
    """Blocking call (run it in a thread). Raises one of the exceptions above; never logs medical content.
    `repair` may trim an otherwise valid answer (e.g. a list one item too long) before the strict validation.
    `model_override` picks another model (e.g. the cheap document model); `usage`, when given, receives the token
    counts {"prompt_tokens", "output_tokens"} reported by Gemini (also for an answer that fails validation)."""
    if not configured():
        raise GeminiNotConfigured
    from google import genai  # imported lazily: the rest of the API runs without the SDK
    from google.genai import errors, types

    schema = gemini_schema(model)
    document = label == "document_import"
    deadline = time.monotonic() + min(24, settings.gemini_timeout_seconds) if document else None
    # Reserve input by UTF-8 size (including schema) with room for framing, plus capped output.
    token_reserve = len((system_instruction + contents + json.dumps(schema)).encode()) + 1024 + max_output_tokens
    attempts = min(2, 40_000 // token_reserve) if document else len(RETRY_DELAYS) + 1
    if attempts < 1:
        raise GeminiFailed("budget")
    config = types.GenerateContentConfig(
        system_instruction=system_instruction, response_mime_type="application/json",
        response_json_schema=schema, temperature=0.1, max_output_tokens=max_output_tokens,
    )
    api_key = settings.gemini_api_key.strip()
    backup_key = settings.gemini_backup_api_key.strip()
    for attempt in range(attempts):
        remaining = deadline - time.monotonic() if deadline is not None else settings.gemini_timeout_seconds
        if remaining <= 0:
            raise GeminiTimeout
        client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=max(1, int(remaining * 1000)),
                                           retry_options=types.HttpRetryOptions(attempts=1)),
        )
        try:
            if usage is not None:
                usage["attempts"] = attempt + 1
            response = client.models.generate_content(model=model_override or model_name(), contents=contents, config=config)
            break
        except (httpx.TimeoutException, TimeoutError) as exc:
            raise GeminiTimeout from exc  # The server may already have processed a timed-out request.
        except errors.APIError as exc:
            code = getattr(exc, "code", None)
            log.warning("gemini %s: API error %s (attempt %d)", label, code, attempt + 1)
            if _project_quota_exhausted(exc):
                if backup_key and api_key != backup_key and attempt + 1 < attempts:
                    api_key = backup_key
                    continue
                raise GeminiRateLimited from exc
            transient = code in TRANSIENT_CODES or (document and code == 429)
            if transient and attempt + 1 < attempts:
                delay = _retry_delay(exc, attempt) if document else RETRY_DELAYS[attempt]
                if deadline is None or time.monotonic() + delay + 0.5 < deadline:
                    time.sleep(delay)
                    continue
            if code == 429:
                raise GeminiRateLimited from exc
            raise GeminiFailed("busy" if transient else "error") from exc
        except httpx.HTTPError as exc:
            raise GeminiFailed("error") from exc
        finally:
            client.close()
    if usage is not None:
        meta = getattr(response, "usage_metadata", None)
        usage["prompt_tokens"] = int(getattr(meta, "prompt_token_count", 0) or 0)
        usage["output_tokens"] = int(getattr(meta, "candidates_token_count", 0) or 0) + int(
            getattr(meta, "thoughts_token_count", 0) or 0)
    try:
        data = json.loads(response.text or "")
        if repair is not None and isinstance(data, dict):
            data = repair(data)
        return model.model_validate(data)
    except (ValidationError, ValueError) as exc:
        count = exc.error_count() if isinstance(exc, ValidationError) else 1
        log.warning("gemini %s: response failed schema validation (%d errors)", label, count)
        raise GeminiFailed("invalid") from exc


def generate_draft(facts_json: str, language: str) -> GeminiDraft:
    system = SYSTEM_INSTRUCTION.format(language="Romanian" if language == "ro" else "English")
    return generate_structured(GeminiDraft, system, f"FACTS:\n{facts_json}", "summary")
