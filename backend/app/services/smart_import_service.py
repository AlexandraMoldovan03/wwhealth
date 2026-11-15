"""
Universal Smart Import — Upload → Parse → Extract → Preview → Confirm → Save.

Cost rules (Gemini is NEVER called when the record or the library is opened):
  • cache: (user, SHA-256 of the file, PIPELINE_VERSION) → the stored structured result is returned, no new analysis;
    the same file is stored once (idempotent re-imports); re-analysis only on explicit request;
  • FHIR / CSV are parsed locally; PDFs / images use the existing OCR; Gemini only classifies / extracts semantics,
    with only THIS document's text (truncated to a limit), never the whole record;
  • explicit AI consent required; per-user hourly limit; per-user daily cost budget; process-wide concurrency limit;
    retry with backoff for transient errors (gemini_client); one escalation to a stronger model only when the cheap
    model's answer is unusable; every call's tokens / estimated cost are recorded (ai_usage);
  • any AI problem → local rule-based extraction (the import still works without AI).

Safety rules: nothing is integrated before the patient confirms; identity is checked (same name alone is not enough);
synthetic / demo documents only in demo contexts; imported medication is historical, never "active today" — the
medical profile and treatment plans are never modified; confirmed facts are replaced only on explicit confirmation of
the same document.
"""
import logging
import threading
import time
from collections import defaultdict, deque
from datetime import UTC, datetime

from app.core.config import settings
from app.core.security import CurrentUser
from app.schemas.smart_import import (
    Contradiction,
    DocumentDetail,
    DocumentFact,
    DocumentUpdate,
    DuplicateHint,
    GeminiDocument,
    IdentityCheck,
    ImportConfirm,
    ImportExtraction,
    ImportPreview,
    LibraryPage,
    NerTerm,
)
from app.services import (
    ai_usage,
    document_intelligence as di,
    gemini_client,
    identity_check,
    import_parsers,
    import_repo,
    intelligence_service,
    lab_extraction,
    medical_ner,
)

log = logging.getLogger("wwhealth.import")

PIPELINE_VERSION = di.PIPELINE_VERSION


def _attach_ner(parsed: import_parsers.ParsedDocument, extraction: ImportExtraction) -> None:
    if parsed.structured is not None or not any(p.strip() for p in parsed.pages):
        return
    terms = medical_ner.extract(parsed.pages, parsed.source_format in {"pdf_text", "pdf_scanned"})
    if terms is not None:
        extraction.ner_terms = terms
        extraction.ner_model_version = medical_ner.MODEL_VERSION

MED_CONTEXTS = {"at_discharge", "during_stay", "prior", "prescribed", "unknown"}
CERTAINTIES = {"confirmed", "suspected", "ruled_out", "history"}


class ImportFailure(Exception):
    """`code` is safe to show (translated in the app); `status` is the HTTP status."""

    def __init__(self, code: str, status: int = 422):
        super().__init__(code)
        self.code = code
        self.status = status


# ─────────────────────────────────────────────────────────── limits

_semaphore = threading.BoundedSemaphore(min(2, max(1, settings.gemini_document_concurrency)))
_queue = threading.BoundedSemaphore(6)
_document_jobs = [threading.Lock() for _ in range(128)]


def _job(user: CurrentUser, key: str):
    return _document_jobs[hash((user.id, key)) % len(_document_jobs)]
_calls: dict[str, deque[float]] = defaultdict(deque)
WINDOW = 3600.0


def _take_rate_slot(user_id: str) -> bool:
    now = time.monotonic()
    q = _calls[user_id]
    while q and now - q[0] > WINDOW:
        q.popleft()
    if len(q) >= settings.ai_import_per_user_per_hour:
        return False
    q.append(now)
    return True


def reset_demo() -> None:
    _calls.clear()
    import_repo.reset_demo()
    import_repo.reset_usage()


def demo_allowed(record) -> bool:
    """Synthetic documents only in demo contexts: demo mode, a non-production environment, or a [DEMO] profile."""
    if not settings.supabase_enabled:
        return True
    if record is not None and (record.full_name or "").strip().upper().startswith("[DEMO]"):
        return True
    if settings.allow_demo_documents is not None:
        return settings.allow_demo_documents
    return settings.app_env.lower() != "production"


# ─────────────────────────────────────────────────────────── extraction

def _ai_block_reason(user: CurrentUser) -> str | None:
    if not gemini_client.configured():
        return "not_configured"
    if not intelligence_service.get_consent(user).granted:
        return "no_consent"
    if ai_usage.over_budget(user):
        ai_usage.record(user, "document_import", settings.gemini_document_model, 0, 0, "skipped_budget")
        return "budget"
    if not _take_rate_slot(user.id):
        return "rate_limited"
    return None


# Fallback reasons that may have disappeared since (consent given, budget reset, AI back up). "no_text" never does.
RETRY_WITH_AI = {"no_consent", "not_configured", "budget", "rate_limited", "ai_rate_limited", "ai_busy", "ai_timeout",
                 "ai_invalid", "ai_error"}


def _ai_now_available(user: CurrentUser) -> bool:
    """Cheap check (no rate slot, no call): would a new analysis be allowed to use Gemini?"""
    return (gemini_client.configured() and intelligence_service.get_consent(user).granted
            and not ai_usage.over_budget(user))


def _upgrade_to_ai(user: CurrentUser, cached: dict) -> bool:
    """A cached local-only analysis is redone with Gemini when the patient uploads the file again and AI is now allowed."""
    reason = (cached.get("extraction") or {}).get("fallbackReason")
    return cached.get("method") == "local_fallback" and reason in RETRY_WITH_AI and _ai_now_available(user)


def _call_gemini(user: CurrentUser, contents: str, model: str) -> GeminiDocument:
    started = time.perf_counter()
    usage: dict = {}
    status = "ok"
    try:
        return gemini_client.generate_structured(
            GeminiDocument, di.system_prompt(), contents, "document_import", model_override=model, usage=usage,
            max_output_tokens=settings.gemini_document_max_output_tokens)
    except gemini_client.GeminiTimeout:
        status = "timeout"
        raise
    except gemini_client.GeminiRateLimited:
        status = "rate_limited"
        raise
    except gemini_client.GeminiFailed as exc:
        status = "invalid" if exc.reason == "invalid" else "error"
        raise
    except Exception:
        status = "error"
        raise
    finally:
        log.info("document import Gemini: attempts=%s prompt_tokens=%s output_tokens=%s elapsed_ms=%.1f status=%s",
                 usage.get("attempts", 0), usage.get("prompt_tokens"), usage.get("output_tokens"),
                 (time.perf_counter() - started) * 1000, status)
        ai_usage.record(user, "document_import", model, usage.get("prompt_tokens", 0), usage.get("output_tokens", 0), status)


def _gemini_extract(user: CurrentUser, pages: list[str], terms: list[NerTerm]) -> tuple[ImportExtraction, dict, str]:
    """(extraction, identity from the document, model used). Raises gemini_client errors."""
    contents, truncated = di.gemini_prompt_contents(
        pages, settings.gemini_document_max_input_chars, terms if settings.gemini_document_ner_hints else None)
    cheap = settings.gemini_document_model.strip() or gemini_client.model_name()
    stronger = settings.gemini_document_escalation_model.strip()
    if not _queue.acquire(blocking=False):
        raise gemini_client.GeminiFailed("busy")
    if not _semaphore.acquire(timeout=4):
        _queue.release()
        raise gemini_client.GeminiFailed("busy")
    try:
        model = cheap
        try:
            doc = _call_gemini(user, contents, cheap)
            if stronger and stronger != cheap and not di.gemini_usable(doc, pages) and not ai_usage.over_budget(user):
                model = stronger
                doc = _call_gemini(user, contents, stronger)
        except gemini_client.GeminiFailed as exc:
            if exc.reason != "invalid" or not stronger or stronger == cheap or ai_usage.over_budget(user):
                raise
            model = stronger
            doc = _call_gemini(user, contents, stronger)
    finally:
        _semaphore.release()
        _queue.release()
    extraction, identity = di.from_gemini(doc, pages)
    extraction.truncated = truncated
    if truncated:
        extraction.to_verify = sorted({*extraction.to_verify, "document_truncated"})
    return extraction, identity, model


def _extract(user: CurrentUser, parsed: import_parsers.ParsedDocument, prior: ImportExtraction | None = None) -> dict:
    annotations = ImportExtraction()
    if prior is not None and prior.ner_model_version == medical_ner.MODEL_VERSION:
        annotations.ner_terms = prior.ner_terms
        annotations.ner_model_version = prior.ner_model_version
    else:
        _attach_ner(parsed, annotations)
    result = _extract_semantic(user, parsed, annotations.ner_terms)
    result["extraction"].ner_terms = annotations.ner_terms
    result["extraction"].ner_model_version = annotations.ner_model_version
    return result


def _extract_semantic(user: CurrentUser, parsed: import_parsers.ParsedDocument, terms: list[NerTerm]) -> dict:
    """{extraction, method, model, fallback_reason, identity, synthetic}."""
    raw_text = "\n".join(parsed.pages)
    synthetic = bool(di.SYNTHETIC_RE.search(raw_text))
    if parsed.structured is not None:
        ex = di.finalize(parsed.structured)
        return {"extraction": ex, "method": "local", "model": None, "fallback_reason": None,
                "identity": parsed.identity, "synthetic": synthetic}
    pages = di.clean_pages(parsed.pages)
    local_id = di.local_identity(parsed.pages)
    if not any(p.strip() for p in pages):
        ex = ImportExtraction(category="other", page_count=parsed.page_count, text_found=False,
                              to_verify=["no_text" if lab_extraction.ocr_available() or parsed.source_format == "pdf_text"
                                         else "ocr_unavailable"])
        return {"extraction": di.finalize(ex), "method": "local", "model": None, "fallback_reason": "no_text",
                "identity": local_id, "synthetic": synthetic}
    reason = _ai_block_reason(user)
    if reason is None:
        try:
            ex, gem_id, model = _gemini_extract(user, pages, terms)
            identity = {**{k: v for k, v in gem_id.items() if v}, **{k: v for k, v in local_id.items() if v}}
            ex.page_count = parsed.page_count
            return {"extraction": di.finalize(ex, pages), "method": "gemini", "model": model, "fallback_reason": None,
                    "identity": identity, "synthetic": synthetic}
        except gemini_client.GeminiTimeout:
            reason = "ai_timeout"
        except gemini_client.GeminiRateLimited:
            reason = "ai_rate_limited"
        except gemini_client.GeminiFailed as exc:
            reason = "ai_busy" if exc.reason == "busy" else "ai_invalid" if exc.reason == "invalid" else "ai_error"
        except gemini_client.GeminiNotConfigured:
            reason = "not_configured"
        except Exception:  # noqa: BLE001 — the import must still work without AI; content is never logged
            log.warning("document import: unexpected AI error, using local extraction")
            reason = "ai_error"
    ex = di.analyze_locally(pages)
    ex.page_count = parsed.page_count
    return {"extraction": di.finalize(ex, pages), "method": "local_fallback", "model": None, "fallback_reason": reason,
            "identity": local_id, "synthetic": synthetic}


# ─────────────────────────────────────────────────────────── duplicates / contradictions

def _duplicates(user: CurrentUser, ex: ImportExtraction, own_document_id: str | None, same_file: dict | None) -> list[DuplicateHint]:
    hints: list[DuplicateHint] = []
    if same_file:
        hints.append(DuplicateHint(document_id=str(same_file["id"]), title=same_file["title"], reason="same_file",
                                   date=(str(same_file.get("event_date") or "")[:10] or None)))
    if ex.event_date:
        for d in import_repo.list_documents(user):
            if str(d["id"]) in (own_document_id, same_file and str(same_file["id"])):
                continue
            if str(d.get("event_date") or "")[:10] == ex.event_date and d.get("document_type") == ex.category:
                hints.append(DuplicateHint(document_id=str(d["id"]), title=d["title"], reason="same_event", date=ex.event_date))
    return hints[:10]


def _contradictions(user: CurrentUser, ex: ImportExtraction, record) -> list[Contradiction]:
    out: list[Contradiction] = []
    if record is None:
        return out
    fold = di.fold
    allergies = {fold(a.substance) for a in record.allergies}
    active_meds = {fold(t.name).split(" ")[0] for t in record.treatments if t.active}
    conditions = {fold(d.name): d for d in record.diagnoses}
    try:
        facts = import_repo.facts_or_empty(user)
    except Exception:  # noqa: BLE001
        facts = []
    known_dx = {fold(f["label"]): f.get("status") for f in facts if f.get("kind") == "diagnosis"}
    for item in ex.items:
        key = fold(item.label)
        if item.kind == "allergy" and key and not any(key in a or a in key for a in allergies if a):
            out.append(Contradiction(code="allergy_not_in_profile", label=item.label, incoming=item.detail))
        elif item.kind == "medication" and key.split(" ")[0] not in active_meds:
            out.append(Contradiction(code="medication_not_in_active_list", label=item.label, incoming=item.detail))
        elif item.kind == "diagnosis":
            existing = conditions.get(key) or next((d for k, d in conditions.items() if k and (k in key or key in k)), None)
            if existing and item.status == "ruled_out" and existing.status == "active":
                out.append(Contradiction(code="condition_ruled_out_in_document", label=item.label, existing=existing.status,
                                         incoming=item.status))
            elif existing and item.status == "confirmed" and existing.status == "resolved":
                out.append(Contradiction(code="condition_status_differs", label=item.label, existing=existing.status,
                                         incoming=item.status))
            elif key in known_dx and known_dx[key] and item.status and known_dx[key] != item.status:
                out.append(Contradiction(code="certainty_differs", label=item.label, existing=known_dx[key], incoming=item.status))
    return out[:20]


# ─────────────────────────────────────────────────────────── preview mapping

def _preview(row: dict, cached: bool = False, fallback_reason: str | None = None) -> ImportPreview:
    return ImportPreview(
        id=str(row["id"]), document_id=str(row["document_id"]) if row.get("document_id") else None, status=row["status"],
        source_format=row["source_format"], method=row["method"], model=row.get("model"),
        original_filename=row.get("original_filename"), created_at=str(row["created_at"]),
        extraction=ImportExtraction.model_validate(row.get("extraction") or {}),
        identity=IdentityCheck.model_validate(row.get("identity") or {"status": "insufficient"}),
        duplicates=[DuplicateHint.model_validate(d) for d in row.get("duplicates") or []],
        contradictions=[Contradiction.model_validate(c) for c in row.get("contradictions") or []],
        is_demo=bool(row.get("is_demo")), cached=cached,
        fallback_reason=fallback_reason or (row.get("extraction") or {}).get("fallbackReason"),
        history=list(row.get("history") or [])[-20:])


def _dump(ex: ImportExtraction, fallback_reason: str | None) -> dict:
    data = ex.model_dump(by_alias=True)
    data["fallbackReason"] = fallback_reason
    return data


def _event(action: str, **extra) -> dict:
    return {"at": datetime.now(UTC).isoformat(), "action": action, **extra}


# ─────────────────────────────────────────────────────────── upload

def upload(user: CurrentUser, content: bytes, filename: str, csv_mapping: dict | None = None) -> ImportPreview:
    started = time.perf_counter()
    lock = _job(user, import_parsers.sha256(content))
    if not lock.acquire(timeout=30):
        raise ImportFailure("import_busy", 409)
    try:
        preview = _upload(user, content, filename, csv_mapping)
    finally:
        lock.release()
    log.info("document import: cached=%s method=%s elapsed_ms=%.1f",
             preview.cached, preview.method, (time.perf_counter() - started) * 1000)
    return preview


def _upload(user: CurrentUser, content: bytes, filename: str, csv_mapping: dict | None) -> ImportPreview:
    sha = import_parsers.sha256(content)
    cached = import_repo.find_import(user, sha, PIPELINE_VERSION)
    if cached and cached["status"] not in ("rejected", "confirmed") and cached.get("document_id") and _upgrade_to_ai(user, cached):
        return _resume(user, str(cached["id"]))  # the per-file lock is already held by upload()
    if cached and cached["status"] != "rejected" and cached.get("document_id"):
        ex = ImportExtraction.model_validate(cached.get("extraction") or {})
        if ex.ner_model_version != medical_ner.MODEL_VERSION and medical_ner.available() and cached["source_format"] in {
            "pdf_text", "pdf_scanned", "image"
        }:
            try:
                parsed = import_parsers.parse(content, filename, csv_mapping)
            except import_parsers.ImportFormatError:
                return _preview(cached, cached=True)
            _attach_ner(parsed, ex)
            if ex.ner_model_version:
                cached = import_repo.save_import(user, {
                    "extraction": {**(cached.get("extraction") or {}), **ex.model_dump(by_alias=True)}
                }, str(cached["id"]))
        return _preview(cached, cached=True)

    try:
        parsed = import_parsers.parse(content, filename, csv_mapping)
    except import_parsers.ImportFormatError as exc:
        raise ImportFailure(exc.code) from exc
    record = import_repo.profile(user)
    raw_synthetic = bool(di.SYNTHETIC_RE.search("\n".join(parsed.pages)))
    if raw_synthetic and not demo_allowed(record):
        raise ImportFailure("demo_document_not_allowed")

    if cached and cached["status"] == "rejected" and not _upgrade_to_ai(user, cached):
        # Re-import of a file the patient rejected before: reuse the stored analysis (no AI), new preview.
        extraction = ImportExtraction.model_validate(cached.get("extraction") or {})
        result = {"extraction": extraction, "method": cached["method"], "model": cached.get("model"),
                  "fallback_reason": (cached.get("extraction") or {}).get("fallbackReason"),
                  "identity": None, "synthetic": bool(cached.get("is_demo"))}
        identity = IdentityCheck.model_validate(cached.get("identity") or {"status": "insufficient"})
    else:
        result = _extract(user, parsed)
        synthetic = result["synthetic"] or raw_synthetic
        profile_data = {"full_name": record.full_name if record else None,
                        "date_of_birth": record.date_of_birth if record else None, "sex": record.sex if record else None}
        identity = identity_check.check(result["identity"] or {}, profile_data, synthetic=synthetic)
        result["synthetic"] = synthetic
    extraction: ImportExtraction = result["extraction"]
    if cached and cached["status"] == "rejected" and result["identity"] is None and extraction.ner_model_version != medical_ner.MODEL_VERSION:
        _attach_ner(parsed, extraction)

    same_file = import_repo.find_document_by_sha(user, sha)
    document = same_file or import_repo.store_document(user, content, parsed.mime_type, {
        "title": extraction.proposed_title, "document_type": extraction.category, "original_filename": (filename or "")[:200] or None,
        "content_sha256": sha, "specialty": extraction.specialty, "event_date": extraction.event_date,
        "document_date": extraction.document_date, "institution": extraction.institution,
        "processing_status": "needs_review", "is_demo": result["synthetic"]})
    try:
        row = {
            "document_id": str(document["id"]), "content_sha256": sha, "pipeline_version": PIPELINE_VERSION,
            "source_format": parsed.source_format, "original_filename": (filename or "")[:200] or None,
            "status": "preview", "method": result["method"], "model": result["model"],
            "extraction": _dump(extraction, result["fallback_reason"]),
            "identity": identity.model_dump(by_alias=True),
            "duplicates": [d.model_dump(by_alias=True) for d in _duplicates(user, extraction, str(document["id"]),
                                                                            same_file if not cached else None)],
            "contradictions": [c.model_dump(by_alias=True) for c in _contradictions(user, extraction, record)],
            "is_demo": result["synthetic"],
        }
        if cached:
            row["history"] = [*(cached.get("history") or []), _event("reimported")]
            saved = import_repo.save_import(user, row, str(cached["id"]))
        else:
            row["history"] = [_event("analyzed", method=result["method"])]
            saved = import_repo.save_import(user, row)
    except Exception:
        if not same_file:
            import_repo.delete_document(user, str(document["id"]))
        raise
    return _preview(saved, fallback_reason=result["fallback_reason"])


def get(user: CurrentUser, import_id: str) -> ImportPreview:
    row = import_repo.get_import(user, import_id)
    if row is None:
        raise ImportFailure("not_found", 404)
    return _preview(row)


# ─────────────────────────────────────────────────────────── confirm / reject / reanalyze

def _fact_rows(body: ImportConfirm, original: ImportExtraction, import_id: str) -> list[dict]:
    before = {i.key: i for i in original.items}
    rows = []
    for item in body.items:
        if not item.include:
            continue
        status = item.status
        if item.kind == "medication":
            status = status if status in MED_CONTEXTS else "unknown"  # never "active": historical by definition
        elif item.kind == "diagnosis":
            status = status if status in CERTAINTIES else "suspected"
        prev = before.get(item.key)
        if item.kind in {"diagnosis", "medication"} and (
            prev is None or prev.kind != item.kind or not prev.source.verified
        ):
            continue
        source = prev.source if prev and prev.kind == item.kind else item.source
        edited = item.edited or prev is None or (prev.label, prev.detail, prev.status, prev.date) != (
            item.label, item.detail, status, item.date)
        rows.append({
            "import_id": import_id,
            "kind": item.kind, "label": item.label[:200], "detail": (item.detail or None) and item.detail[:400],
            "status": status, "value": item.value or {}, "event_date": item.date or body.event_date,
            "source_page": source.page, "source_excerpt": source.excerpt, "fingerprint": item.key,
            "edited": edited})
    # one row per fingerprint (unique per document)
    seen, unique = set(), []
    for r in rows:
        if r["fingerprint"] not in seen:
            seen.add(r["fingerprint"])
            unique.append(r)
    return unique


def confirm(user: CurrentUser, import_id: str, body: ImportConfirm) -> ImportPreview:
    row = import_repo.get_import(user, import_id)
    if row is None or not row.get("document_id"):
        raise ImportFailure("not_found", 404)
    if row["status"] == "rejected":
        raise ImportFailure("import_rejected", 409)
    identity = IdentityCheck.model_validate(row.get("identity") or {"status": "insufficient"})
    if identity.status != "match" and not body.identity_confirmed:
        raise ImportFailure("identity_confirmation_required", 409)
    if row.get("is_demo") and not demo_allowed(import_repo.profile(user)):
        raise ImportFailure("demo_document_not_allowed")
    document_id = str(row["document_id"])
    original = ImportExtraction.model_validate(row.get("extraction") or {})

    updated = import_repo.update_document(user, document_id, {
        "title": body.title.strip(), "document_type": body.category, "specialty": body.specialty,
        "event_date": body.event_date, "institution": body.institution, "processing_status": "confirmed"})
    if updated is None:
        raise ImportFailure("not_found", 404)
    facts = _fact_rows(body, original, str(row["id"]))
    import_repo.replace_facts(user, document_id, facts)

    labs = [{"name": lab.name, "value": lab.value, "unit": lab.unit, "reference_range": lab.reference_range,
             "source_line": lab.source.excerpt[:200] if lab.source.excerpt else None,
             "measured_at": lab.measured_at or body.event_date} for lab in body.labs if lab.include]
    if labs:  # an import never deletes lab values the patient confirmed earlier
        from app.schemas.document import ExtractedLabValue
        valid = []
        for v in labs:
            try:
                valid.append(ExtractedLabValue.model_validate(v).model_dump(exclude={"needs_review"}))
            except ValueError:
                valid.append(ExtractedLabValue.model_validate({**v, "measured_at": None}).model_dump(exclude={"needs_review"}))
        if settings.supabase_enabled:
            from app.services import supabase_repo
            supabase_repo.save_lab_values(user, document_id, valid)
        else:
            lab_extraction.demo_save(user.id, document_id, valid)

    if not settings.supabase_enabled:
        import_repo.demo_timeline(user, document_id, body.title.strip(), body.category, body.event_date, facts)
    edited = sum(1 for f in facts if f["edited"])
    saved = import_repo.save_import(user, {
        "status": "confirmed", "confirmed_at": datetime.now(UTC).isoformat(),
        "history": [*(row.get("history") or []), _event("confirmed", facts=len(facts), labs=len(labs), edited=edited,
                                                          identity_confirmed=body.identity_confirmed)]}, str(row["id"]))
    return _preview(saved)


def reject(user: CurrentUser, import_id: str) -> ImportPreview:
    row = import_repo.get_import(user, import_id)
    if row is None:
        raise ImportFailure("not_found", 404)
    history = [*(row.get("history") or [])]
    document_id = str(row["document_id"]) if row.get("document_id") else None
    doc = import_repo.get_document(user, document_id) if document_id else None
    if doc and doc.get("processing_status") == "confirmed":
        # A re-analysis of an already confirmed document was discarded: confirmed data stays untouched.
        history.append(_event("reanalysis_discarded"))
        saved = import_repo.save_import(user, {"status": "confirmed", "history": history}, str(row["id"]))
        return _preview(saved)
    if document_id:
        import_repo.delete_document(user, document_id)
    history.append(_event("rejected"))
    saved = import_repo.save_import(user, {"status": "rejected", "document_id": None, "history": history}, str(row["id"]))
    return _preview(saved)


def reanalyze(user: CurrentUser, import_id: str) -> ImportPreview:
    """Explicit request only: runs the pipeline again on the stored original (may call Gemini, with consent)."""
    row = import_repo.get_import(user, import_id)
    if row is None or not row.get("document_id"):
        raise ImportFailure("not_found", 404)
    lock = _job(user, row["content_sha256"])
    if not lock.acquire(blocking=False):
        return _preview(row, cached=True)
    try:
        return _resume(user, import_id)
    finally:
        lock.release()


def _resume(user: CurrentUser, import_id: str) -> ImportPreview:
    row = import_repo.get_import(user, import_id)
    if row is None or not row.get("document_id"):
        raise ImportFailure("not_found", 404)
    found = import_repo.get_file(user, str(row["document_id"]))
    if found is None:
        raise ImportFailure("not_found", 404)
    content, _mime, _name = found
    try:
        parsed = import_parsers.parse(content, row.get("original_filename") or "")
    except import_parsers.ImportFormatError as exc:
        raise ImportFailure(exc.code) from exc
    record = import_repo.profile(user)
    result = _extract(user, parsed, ImportExtraction.model_validate(row.get("extraction") or {}))
    identity = identity_check.check(result["identity"] or {}, {
        "full_name": record.full_name if record else None, "date_of_birth": record.date_of_birth if record else None,
        "sex": record.sex if record else None}, synthetic=result["synthetic"])
    extraction = result["extraction"]
    if result["fallback_reason"] in {"ai_timeout", "ai_busy", "ai_rate_limited", "ai_error", "ai_invalid"}:
        previous = row.get("extraction") or {}
        saved = import_repo.save_import(user, {
            "extraction": {**previous, "fallbackReason": result["fallback_reason"]},
            "history": [*(row.get("history") or []), _event("reanalyze_deferred")],
        }, str(row["id"]))
        return _preview(saved)
    saved = import_repo.save_import(user, {
        "status": "preview", "method": result["method"], "model": result["model"],
        "pipeline_version": PIPELINE_VERSION, "extraction": _dump(extraction, result["fallback_reason"]),
        "identity": identity.model_dump(by_alias=True),
        "duplicates": [d.model_dump(by_alias=True) for d in _duplicates(user, extraction, str(row["document_id"]), None)],
        "contradictions": [c.model_dump(by_alias=True) for c in _contradictions(user, extraction, record)],
        "history": [*(row.get("history") or []), _event("reanalyzed", method=result["method"])]}, str(row["id"]))
    return _preview(saved, fallback_reason=result["fallback_reason"])


# ─────────────────────────────────────────────────────────── library

def _fact(r: dict) -> DocumentFact:
    return DocumentFact(id=str(r["id"]), document_id=str(r["document_id"]), kind=r["kind"], label=r["label"],
                        detail=r.get("detail"), status=r.get("status"),
                        event_date=str(r["event_date"])[:10] if r.get("event_date") else None,
                        source_page=r.get("source_page"), source_excerpt=r.get("source_excerpt"), value=r.get("value") or {},
                        edited=bool(r.get("edited")), document_title=r.get("document_title"))


def library(user: CurrentUser, q: str | None = None, category: str | None = None, specialty: str | None = None,
            institution: str | None = None, date_from: str | None = None, date_to: str | None = None,
            sort: str = "date", order: str = "desc") -> LibraryPage:
    rows = import_repo.list_documents(user)
    all_rows = list(rows)
    fq = di.fold(q) if q else ""

    def when(r: dict) -> str:
        return str(r.get("event_date") or r.get("document_date") or r.get("uploaded_at") or "")[:10]

    if fq:
        try:
            matching = import_repo.ner_search(user, fq)
        except import_repo.SmartImportUnavailable:
            matching = set()
        rows = [r for r in rows if str(r["id"]) in matching or fq in di.fold(" ".join(str(r.get(k) or "") for k in
                                                          ("title", "original_filename", "institution", "specialty")))]
    if category:
        rows = [r for r in rows if r.get("document_type") == category]
    if specialty:
        rows = [r for r in rows if r.get("specialty") == specialty]
    if institution:
        rows = [r for r in rows if di.fold(r.get("institution")) == di.fold(institution)]
    if date_from:
        rows = [r for r in rows if when(r) >= date_from]
    if date_to:
        rows = [r for r in rows if when(r) <= date_to]
    key = {"title": lambda r: di.fold(r.get("title")), "uploaded": lambda r: str(r.get("uploaded_at") or "")}.get(sort, when)
    rows.sort(key=key, reverse=order != "asc")
    return LibraryPage(
        documents=[import_repo.to_document(r) for r in rows],
        institutions=sorted({r["institution"] for r in all_rows if r.get("institution")}),
        specialties=sorted({r["specialty"] for r in all_rows if r.get("specialty")}))


def detail(user: CurrentUser, document_id: str) -> DocumentDetail:
    row = import_repo.get_document(user, document_id)
    if row is None:
        raise ImportFailure("not_found", 404)
    imp = import_repo.latest_import_for_document(user, document_id)
    try:
        rows = import_repo.list_facts(user, document_id=document_id)
    except import_repo.SmartImportUnavailable:
        rows = []
    return DocumentDetail(document=import_repo.to_document({**row, "import_id": imp["id"] if imp else None}),
                          facts=[_fact(f) for f in rows],
                          ner_terms=ImportExtraction.model_validate((imp or {}).get("extraction") or {}).ner_terms,
                          import_id=str(imp["id"]) if imp else None)


def update(user: CurrentUser, document_id: str, body: DocumentUpdate) -> DocumentDetail:
    patch = body.model_dump(exclude_unset=True)
    if "category" in patch:
        patch["document_type"] = patch.pop("category")
    if not patch:
        return detail(user, document_id)
    if import_repo.update_document(user, document_id, patch) is None:
        raise ImportFailure("not_found", 404)
    return detail(user, document_id)


def facts(user: CurrentUser) -> list[DocumentFact]:
    return [_fact(f) for f in import_repo.facts_or_empty(user)]
