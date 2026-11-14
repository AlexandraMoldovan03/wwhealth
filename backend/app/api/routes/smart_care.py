"""Smart Care: AI specialty recommendation (optional) + booking with verified doctors. Content-free errors."""
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from starlette.concurrency import run_in_threadpool

from app.api.supabase_errors import supabase_errors
from app.core.config import settings
from app.core.security import CurrentUser, get_current_doctor, get_current_user
from app.schemas.smart_care import (
    Appointment,
    AppointmentRequest,
    AvailabilityCreate,
    DoctorAppointmentAction,
    DoctorAvailabilityOut,
    PatientAppointmentAction,
    Slot,
    SpecialtyOut,
    Transcript,
    TriageRequest,
    TriageResult,
)
from app.services import appointment_service as appts
from app.services import gemini_client, intake_service, intelligence_service, smart_care_service, supabase_repo

router = APIRouter(prefix="/smart-care", tags=["smart-care"])
Lang = Literal["ro", "en"]

_CONFLICT_DETAIL = {
    "slot_unavailable": "This slot is no longer available",
    "invalid_state": "The appointment can no longer be changed",
    "not_patient": "Only patients can request appointments",
}


@contextmanager
def care_errors() -> Iterator[None]:
    try:
        with supabase_errors():
            yield
    except appts.NotFound as exc:
        raise HTTPException(404, "Not found") from exc
    except appts.Conflict as exc:
        raise HTTPException(409 if exc.status != "not_patient" else 403,
                            _CONFLICT_DETAIL.get(exc.status, exc.status)) from exc
    except appts.InvalidInput as exc:
        raise HTTPException(422, f"Invalid {exc}") from exc
    except intelligence_service.RateLimited as exc:
        raise HTTPException(429, "Too many requests, try again later",
                            headers={"Retry-After": str(exc.retry_after)}) from exc
    except gemini_client.GeminiRateLimited as exc:
        raise HTTPException(429, "Gemini is busy, try again later") from exc


def _run(fn: Callable, *args):
    with care_errors():
        return fn(*args)


# ─────────────────────────────────────────────────────────── recommendation & search (patient)

@router.get("/specialties", response_model=list[SpecialtyOut])
def specialties(q: str = Query("", max_length=60), lang: Lang = "ro",
                _: CurrentUser = Depends(get_current_user)) -> list[SpecialtyOut]:
    """Backend-controlled catalog; manual search works without AI."""
    return appts.specialties(q, lang)


@router.post("/triage", response_model=TriageResult)
def triage(body: TriageRequest, user: CurrentUser = Depends(get_current_user)) -> TriageResult:
    """Emergency rules first (no AI), then Gemini only with consent. Not stored, not logged."""
    if not body.confirmed:
        raise HTTPException(422, "Confirm the symptoms before sending them")
    return _run(smart_care_service.triage, user, body)


MAX_AUDIO_BYTES = 25 * 1024 * 1024
DEMO_TRANSCRIPT = "Tusesc de două săptămâni, mai ales noaptea, și obosesc repede."


@router.post("/transcribe", response_model=Transcript)
async def transcribe(file: UploadFile = File(...), elevenlabs_consent: bool = Form(False, alias="elevenlabsConsent"),
                     user: CurrentUser = Depends(get_current_user)) -> Transcript:
    """Voice → text with ElevenLabs only (no Gemini). The patient checks / edits the text before any recommendation."""
    if not elevenlabs_consent:
        raise HTTPException(422, "Confirm that the recording may be sent to ElevenLabs")
    if settings.supabase_enabled:
        with supabase_errors():
            role = await run_in_threadpool(supabase_repo.get_role, user)
        if role != "patient":
            raise HTTPException(403, "Patient account required")
    audio = await file.read(MAX_AUDIO_BYTES + 1)
    if not audio:
        raise HTTPException(400, "Empty audio file")
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio file too large (max 25 MiB)")
    if not settings.elevenlabs_api_key:
        if settings.supabase_enabled:
            raise HTTPException(503, "Voice is not configured on the server (ELEVENLABS_API_KEY missing in backend/.env)")
        return Transcript(transcript=DEMO_TRANSCRIPT, language="ro", is_demo=True)
    text, language = await intake_service.transcribe(audio, file.filename or "recording.m4a",
                                                     file.content_type or "application/octet-stream")
    if not text:
        raise HTTPException(400, "No speech detected in the recording")
    return Transcript(transcript=text[:2000], language=language, is_demo=False)


@router.get("/specialties/{specialty_id}/doctors", response_model=list[DoctorAvailabilityOut])
def specialty_doctors(specialty_id: str, user: CurrentUser = Depends(get_current_user)) -> list[DoctorAvailabilityOut]:
    return _run(appts.specialty_doctors, user, specialty_id)


@router.get("/doctors/{doctor_id}/slots", response_model=list[Slot])
def doctor_slots(doctor_id: str, days: int = Query(14, ge=1, le=60),
                 user: CurrentUser = Depends(get_current_user)) -> list[Slot]:
    return _run(appts.doctor_slots, user, doctor_id, days)


# ─────────────────────────────────────────────────────────── appointments (patient)

@router.post("/appointments", response_model=Appointment, status_code=201)
def request_appointment(body: AppointmentRequest, lang: Lang = "ro",
                        user: CurrentUser = Depends(get_current_user)) -> Appointment:
    return _run(appts.request, user, body.slot_id, body.specialty_id, body.note, lang)


@router.get("/appointments", response_model=list[Appointment])
def my_appointments(lang: Lang = "ro", user: CurrentUser = Depends(get_current_user)) -> list[Appointment]:
    return _run(appts.my_appointments, user, lang)


@router.post("/appointments/{appointment_id}/action", response_model=Appointment)
def patient_action(appointment_id: str, body: PatientAppointmentAction, lang: Lang = "ro",
                   user: CurrentUser = Depends(get_current_user)) -> Appointment:
    return _run(appts.patient_action, user, appointment_id, body.action, lang)


# ─────────────────────────────────────────────────────────── doctor

@router.get("/doctor/appointments", response_model=list[Appointment])
def doctor_appointments(lang: Lang = "ro", doctor: CurrentUser = Depends(get_current_doctor)) -> list[Appointment]:
    return _run(appts.my_appointments, doctor, lang)


@router.post("/doctor/appointments/{appointment_id}/respond", response_model=Appointment)
def doctor_respond(appointment_id: str, body: DoctorAppointmentAction, lang: Lang = "ro",
                   doctor: CurrentUser = Depends(get_current_doctor)) -> Appointment:
    return _run(appts.doctor_respond, doctor, appointment_id, body.action, body.slot_id, body.note, lang)


@router.get("/doctor/availability", response_model=list[Slot])
def my_availability(doctor: CurrentUser = Depends(get_current_doctor)) -> list[Slot]:
    return _run(appts.availability, doctor)


@router.get("/doctor/free-slots", response_model=list[Slot])
def my_free_slots(doctor: CurrentUser = Depends(get_current_doctor)) -> list[Slot]:
    """Free slots only — used when proposing another time."""
    return _run(appts.doctor_slots, doctor, doctor.id, 60)


@router.post("/doctor/availability", status_code=201)
def add_availability(body: AvailabilityCreate, doctor: CurrentUser = Depends(get_current_doctor)) -> dict:
    return {"added": _run(appts.add_availability, doctor, body)}


@router.delete("/doctor/availability/{slot_id}", status_code=204)
def delete_availability(slot_id: str, doctor: CurrentUser = Depends(get_current_doctor)) -> Response:
    _run(appts.delete_availability, doctor, slot_id)
    return Response(status_code=204)
