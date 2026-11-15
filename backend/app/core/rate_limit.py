"""Small sliding-window rate limiter (in memory, per process).

Enough for one uvicorn worker on one server. Behind several workers / servers the limits are per process:
move the buckets to a shared store (Redis) before scaling out. Keys never contain tokens or medical data.
"""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException

from app.core.config import settings

_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def _prune(bucket: deque[float], now: float, window: float) -> None:
    while bucket and now - bucket[0] >= window:
        bucket.popleft()


def hit(key: str, limit: int, window_seconds: float, *, now: float | None = None) -> None:
    """Counts one event for `key`; raises 429 once `limit` events happened inside the window."""
    if not settings.rate_limit_enabled or limit <= 0:
        return
    now = time.monotonic() if now is None else now
    with _lock:
        bucket = _hits[key]
        _prune(bucket, now, window_seconds)
        if len(bucket) >= limit:
            retry = max(1, int(window_seconds - (now - bucket[0])))
            raise HTTPException(status_code=429, detail="Too many requests. Try again later.",
                                headers={"Retry-After": str(retry)})
        bucket.append(now)


def blocked(key: str, limit: int, window_seconds: float, *, now: float | None = None) -> bool:
    """True if `key` already reached `limit` inside the window (does not count a new event)."""
    if not settings.rate_limit_enabled or limit <= 0:
        return False
    now = time.monotonic() if now is None else now
    with _lock:
        bucket = _hits[key]
        _prune(bucket, now, window_seconds)
        return len(bucket) >= limit


def record(key: str, *, now: float | None = None) -> None:
    with _lock:
        _hits[key].append(time.monotonic() if now is None else now)


def reset() -> None:
    """Tests only."""
    with _lock:
        _hits.clear()
