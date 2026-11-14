"""
AI Medical Intelligence.

Order of checks on every request (patient or doctor):
  1. who may read which sections (patient: own data · doctor: active grant from doctor_access_consent, re-checked
     in Postgres by RLS) → only those sections are collected (ai_facts.build_facts);
  2. explicit patient consent to Gemini processing (ai_processing_consents) — without it nothing leaves the server;
  3. GEMINI_API_KEY configured, per-user rate limit;
  4. Gemini draft → strict schema → grounding (ai_facts.assemble). Never simulated.
Only the patient's own latest summary is stored (one row; deleted with the consent or on request). A doctor sees it
only with an active grant covering every section it was built from; a doctor-generated summary is not stored.
Supabase mode uses the caller's JWT (RLS); demo mode keeps the same rules in memory.
"""
import time
from collections import defaultdict, deque
from datetime import UTC, datetime

from app.core.config import settings
from app.core.security import CurrentUser
from app.schemas.intelligence import AiConsent, IntelligenceView, MedicalIntelligence
from app.services import doctor_access_service, gemini_client, lab_extraction, patient_service, supabase_repo
from app.services.ai_facts import FactSheet, assemble, build_facts, revalidate


class AiNotConfigured(Exception):
    pass


class ConsentRequired(Exception):
    pass


class AccessDenied(Exception):
    def __init__(self, status: str):
        super().__init__(status)
        self.status = status


class RateLimited(Exception):
    def __init__(self, retry_after: int):
        super().__init__(retry_after)
        self.retry_after = retry_after


# ─────────────────────────────────────────────────────────── rate limit (per process)

_calls: dict[str, deque[float]] = defaultdict(deque)
WINDOW = 3600.0


def _rate_limit(key: str) -> None:
    now = time.monotonic()
    q = _calls[key]
    while q and now - q[0] > WINDOW:
        q.popleft()
    if len(q) >= settings.ai_summary_per_user_per_hour:
        raise RateLimited(int(WINDOW - (now - q[0])) + 1)
    q.append(now)


# ─────────────────────────────────────────────────────────── demo store

_consents: dict[str, str | None] = {}        # user_id → granted_at (None = revoked)
_summaries: dict[str, dict] = {}             # patient_id → {content, source_scopes, model, generated_at}


def reset_demo() -> None:
    _consents.clear()
    _summaries.clear()
    _calls.clear()


# ─────────────────────────────────────────────────────────── consent

def get_consent(user: CurrentUser) -> AiConsent:
    if settings.supabase_enabled:
        row = supabase_repo.ai_consent_get(user)
        active = bool(row and not row.get("revoked_at"))
        return AiConsent(granted=active, granted_at=row["granted_at"] if active and row else None)
    granted_at = _consents.get(user.id)
    return AiConsent(granted=granted_at is not None, granted_at=granted_at)


def set_consent(user: CurrentUser, granted: bool) -> AiConsent:
    if settings.supabase_enabled:
        supabase_repo.ai_consent_set(user, granted)
        if not granted:
            supabase_repo.ai_summary_delete(user)  # the trigger already did it; explicit for clarity
    elif granted:
        _consents[user.id] = datetime.now(UTC).isoformat()
    else:
        _consents[user.id] = None
        _summaries.pop(user.id, None)
    return get_consent(user)


def _consent_active(caller: CurrentUser, patient_id: str) -> bool:
    if settings.supabase_enabled:
        return supabase_repo.ai_consent_active(caller, patient_id)
    return _consents.get(patient_id) is not None


# ─────────────────────────────────────────────────────────── data

def _own_sheet(user: CurrentUser) -> FactSheet:
    if settings.supabase_enabled:
        record = supabase_repo.get_record(user)
        try:
            labs = supabase_repo.list_lab_values(user)
        except supabase_repo.LabStorageUnavailable:
            labs = []
    else:
        record = patient_service.get_patient(user.id)
        titles = {d.id: (d.title, d.uploaded_at[:10]) for d in (record.documents if record else [])}
        labs = [{**v, "document_title": titles.get(v["document_id"], (None, None))[0],
                 "document_date": titles.get(v["document_id"], (None, None))[1]}
                for v in lab_extraction.demo_list(user.id)]
    if record is None:
        raise AccessDenied("none")
    return build_facts(record, record.documents, labs)


def _generate(sheet: FactSheet, language: str, rate_key: str) -> MedicalIntelligence:
    if not gemini_client.configured():
        raise AiNotConfigured
    _rate_limit(rate_key)
    draft = gemini_client.generate_draft(sheet.prompt_payload(), language)
    return assemble(draft, sheet, language=language, model=gemini_client.model_name(),
                    generated_at=datetime.now(UTC).isoformat())


def _saved(caller: CurrentUser, patient_id: str) -> dict | None:
    if settings.supabase_enabled:
        return supabase_repo.ai_summary_get(caller, patient_id)
    return _summaries.get(patient_id)


def _summary_from(row: dict) -> MedicalIntelligence:
    s = MedicalIntelligence.model_validate(row["content"])
    s.generated_at = row.get("generated_at") or s.generated_at
    return s


# ─────────────────────────────────────────────────────────── patient

def patient_view(user: CurrentUser) -> IntelligenceView:
    consent = get_consent(user).granted
    base = {"ai_configured": gemini_client.configured(), "consent": consent}
    if not consent:
        return IntelligenceView(status="no_consent", **base)
    row = _saved(user, user.id)
    if row is None:
        return IntelligenceView(status="none" if gemini_client.configured() else "not_configured", **base)
    return IntelligenceView(status="ok", summary=revalidate(_summary_from(row), _own_sheet(user)), **base)


def patient_generate(user: CurrentUser, language: str) -> IntelligenceView:
    if not get_consent(user).granted:
        raise ConsentRequired
    sheet = _own_sheet(user)
    summary = _generate(sheet, language, f"user:{user.id}")
    content = summary.model_dump(mode="json")
    if settings.supabase_enabled:
        supabase_repo.ai_summary_save(user, content, summary.source_scopes, summary.model)
    else:
        _summaries[user.id] = {"content": content, "source_scopes": summary.source_scopes,
                               "model": summary.model, "generated_at": summary.generated_at}
    return IntelligenceView(status="ok", ai_configured=True, consent=True, summary=summary)


def delete_summary(user: CurrentUser) -> None:
    if settings.supabase_enabled:
        supabase_repo.ai_summary_delete(user)
    else:
        _summaries.pop(user.id, None)


# ─────────────────────────────────────────────────────────── doctor

def _doctor_open(doctor: CurrentUser, patient_id: str) -> dict:
    o = doctor_access_service._open(doctor, patient_id, "summary")  # logged as a view / denial
    status = o.get("status", "none")
    if status != "ok":
        raise AccessDenied(status if status in ("expired", "revoked", "forbidden") else "none")
    return o


def _demo_doctor_may_read(doctor: CurrentUser, patient_id: str, scopes: list[str]) -> bool:
    """Same rule as the RLS policy ai_summaries_doctor_select."""
    active = [g for g in doctor_access_service._grants
              if g.doctor_id == doctor.id and g.patient_id == patient_id and g.status == "active"]
    return any(set(scopes) <= set(g.scopes) for g in active)


def doctor_view(doctor: CurrentUser, patient_id: str) -> IntelligenceView:
    try:
        o = _doctor_open(doctor, patient_id)
    except AccessDenied as exc:
        return IntelligenceView(status=exc.status, ai_configured=gemini_client.configured(), consent=False)
    scopes = o.get("scopes") or []
    base = {"ai_configured": gemini_client.configured(), "consent": _consent_active(doctor, patient_id),
            "patient_name": o.get("patient_name"), "scopes": scopes}
    if not base["consent"]:
        return IntelligenceView(status="no_consent", **base)
    row = _saved(doctor, patient_id)
    if row is not None and not settings.supabase_enabled and not _demo_doctor_may_read(doctor, patient_id, row["source_scopes"]):
        row = None
    if row is None:
        return IntelligenceView(status="none" if base["ai_configured"] else "not_configured", **base)
    record, documents, labs = doctor_access_service.collect(doctor, patient_id, scopes, o.get("patient_name") or "")
    summary = revalidate(_summary_from(row), build_facts(record, documents, labs))
    return IntelligenceView(status="ok", summary=summary, **base)


def doctor_generate(doctor: CurrentUser, patient_id: str, language: str) -> IntelligenceView:
    """From the granted sections only. Not stored: it disappears with the consent."""
    o = _doctor_open(doctor, patient_id)
    if not _consent_active(doctor, patient_id):
        raise ConsentRequired
    scopes = o.get("scopes") or []
    record, documents, labs = doctor_access_service.collect(doctor, patient_id, scopes, o.get("patient_name") or "")
    summary = _generate(build_facts(record, documents, labs), language, f"user:{doctor.id}")
    return IntelligenceView(status="ok", ai_configured=True, consent=True, summary=summary,
                            patient_name=o.get("patient_name"), scopes=scopes)
