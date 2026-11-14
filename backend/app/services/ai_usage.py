"""
Gemini usage / cost monitoring and budget (no medical content: feature, model, token counts, estimated cost, status).
Every Gemini call made by Smart Import is recorded; the per-user daily budget is checked BEFORE a call.
"""
import logging
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.core.security import CurrentUser
from app.schemas.smart_import import AiUsageRow, AiUsageSummary
from app.services import import_repo

log = logging.getLogger("wwhealth.ai.usage")


def estimate_cost(prompt_tokens: int, output_tokens: int) -> float:
    return round(prompt_tokens / 1e6 * settings.gemini_price_input_per_m
                 + output_tokens / 1e6 * settings.gemini_price_output_per_m, 6)


def record(user: CurrentUser, feature: str, model: str, prompt_tokens: int, output_tokens: int, status: str) -> None:
    cost = estimate_cost(prompt_tokens, output_tokens)
    # Aggregate numbers only — never the prompt, the answer or any identifier of the document.
    log.info("gemini usage feature=%s model=%s in=%d out=%d cost_usd=%.6f status=%s",
             feature, model, prompt_tokens, output_tokens, cost, status)
    import_repo.usage_insert(user, {"feature": feature, "model": model[:60], "prompt_tokens": prompt_tokens,
                                    "output_tokens": output_tokens, "est_cost_usd": cost, "status": status})


def _day_start() -> datetime:
    now = datetime.now(UTC)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def today_cost(user: CurrentUser) -> float:
    return sum(float(r.get("est_cost_usd") or 0) for r in import_repo.usage_list(user, _day_start().isoformat()))


def over_budget(user: CurrentUser) -> bool:
    return settings.ai_daily_budget_usd >= 0 and today_cost(user) >= settings.ai_daily_budget_usd


def summary(user: CurrentUser) -> AiUsageSummary:
    month_start = _day_start().replace(day=1)
    rows = import_repo.usage_list(user, min(month_start, _day_start() - timedelta(days=1)).isoformat())
    day = _day_start().isoformat()
    month = [r for r in rows if str(r["created_at"]) >= month_start.isoformat()]
    today = [r for r in rows if str(r["created_at"]) >= day]

    def tokens(rs: list[dict]) -> int:
        return sum(int(r.get("prompt_tokens") or 0) + int(r.get("output_tokens") or 0) for r in rs)

    def cost(rs: list[dict]) -> float:
        return round(sum(float(r.get("est_cost_usd") or 0) for r in rs), 6)

    return AiUsageSummary(
        today_calls=len(today), today_tokens=tokens(today), today_cost_usd=cost(today),
        month_calls=len(month), month_tokens=tokens(month), month_cost_usd=cost(month),
        daily_budget_usd=settings.ai_daily_budget_usd, model=settings.gemini_document_model,
        recent=[AiUsageRow(**{**r, "created_at": str(r["created_at"]), "est_cost_usd": float(r.get("est_cost_usd") or 0)})
                for r in rows[:20]])
