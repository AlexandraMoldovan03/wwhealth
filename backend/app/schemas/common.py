from typing import Literal

from app.schemas.base import CamelModel


class HealthResponse(CamelModel):
    status: Literal["ok"] = "ok"
    version: str
    # "supabase" = shared database (both phones see the same data); "demo" = in-memory, per server process.
    data_mode: Literal["supabase", "demo"] = "demo"
    # Supabase project ref (public, part of the app URL) — both phones / servers must show the same one.
    supabase_project: str | None = None
