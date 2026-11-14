"""AI Medical Intelligence. Authorization is checked on every request (patient: own data · doctor: valid consent)."""
from collections.abc import Callable, Iterator
from contextlib import contextmanager

from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.supabase_errors import supabase_errors
from app.core.security import CurrentUser, get_current_doctor, get_current_user
from app.schemas.intelligence import AiConsent, AiConsentUpdate, GenerateRequest, IntelligenceView
from app.services import gemini_client
from app.services import intelligence_service as svc

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


@contextmanager
def ai_errors() -> Iterator[None]:
    """Clear, content-free errors (no medical data, prompt or Gemini text in any response)."""
    try:
        with supabase_errors():
            yield
    except svc.AiNotConfigured as exc:
        raise HTTPException(503, "AI is not configured on the server") from exc
    except svc.ConsentRequired as exc:
        raise HTTPException(403, "The patient has not consented to AI processing") from exc
    except svc.AccessDenied as exc:
        raise HTTPException(403 if exc.status != "none" else 404, f"Access {exc.status}") from exc
    except svc.RateLimited as exc:
        raise HTTPException(429, "Too many summaries, try again later",
                            headers={"Retry-After": str(exc.retry_after)}) from exc
    except gemini_client.GeminiRateLimited as exc:
        raise HTTPException(429, "Gemini is busy, try again later") from exc
    except gemini_client.GeminiTimeout as exc:
        raise HTTPException(504, "Gemini did not answer in time") from exc
    except gemini_client.GeminiFailed as exc:
        raise HTTPException(502, "Gemini could not produce a valid summary") from exc


def _run(fn: Callable, *args):
    with ai_errors():
        return fn(*args)


# ─────────────────────────────────────────────────────────── patient

@router.get("/consent", response_model=AiConsent)
def get_consent(user: CurrentUser = Depends(get_current_user)) -> AiConsent:
    return _run(svc.get_consent, user)


@router.put("/consent", response_model=AiConsent)
def set_consent(body: AiConsentUpdate, user: CurrentUser = Depends(get_current_user)) -> AiConsent:
    """Explicit opt-in to Gemini processing. Withdrawing it deletes the saved summary."""
    return _run(svc.set_consent, user, body.granted)


@router.get("/me", response_model=IntelligenceView)
def my_view(user: CurrentUser = Depends(get_current_user)) -> IntelligenceView:
    return _run(svc.patient_view, user)


@router.post("/me/generate", response_model=IntelligenceView)
def generate_mine(body: GenerateRequest, user: CurrentUser = Depends(get_current_user)) -> IntelligenceView:
    return _run(svc.patient_generate, user, body.language)


@router.delete("/me", status_code=204)
def delete_mine(user: CurrentUser = Depends(get_current_user)) -> Response:
    _run(svc.delete_summary, user)
    return Response(status_code=204)


# ─────────────────────────────────────────────────────────── doctor

@router.get("/patients/{patient_id}", response_model=IntelligenceView)
def patient_view(patient_id: str, doctor: CurrentUser = Depends(get_current_doctor)) -> IntelligenceView:
    """Saved summary only with an active grant covering every section it was built from; else a status."""
    return _run(svc.doctor_view, doctor, patient_id)


@router.post("/patients/{patient_id}/generate", response_model=IntelligenceView)
def generate_for_patient(patient_id: str, body: GenerateRequest,
                         doctor: CurrentUser = Depends(get_current_doctor)) -> IntelligenceView:
    """From the granted sections only; needs the patient's AI consent. Not stored."""
    return _run(svc.doctor_generate, doctor, patient_id, body.language)
