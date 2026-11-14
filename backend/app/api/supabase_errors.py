"""Maps Supabase failures to safe HTTP errors (no row data, keys or hints in the response)."""
from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import HTTPException

from app.services.supabase_repo import LabStorageUnavailable, SupabaseAuthError, SupabaseError


@contextmanager
def supabase_errors() -> Iterator[None]:
    try:
        yield
    except LabStorageUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except SupabaseAuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc), headers={"WWW-Authenticate": "Bearer"}) from exc
    except SupabaseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
