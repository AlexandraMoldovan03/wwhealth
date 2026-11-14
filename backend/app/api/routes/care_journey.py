"""Care Journey: doctor agenda / schedule / consultation / treatments; patient preparation, treatments, reminders,
intelligent record, FHIR export and AI care insights. Content-free errors; authorization checked on every request
(and again by Postgres RLS / security-definer functions in Supabase mode)."""
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.api.supabase_errors import supabase_errors
from app.core.config import settings
from app.core.security import CurrentUser, get_current_doctor, get_current_user
from app.schemas.care import (
    CareInsights,
    ConsultationSheet,
    DoctorAgenda,
    DoctorSchedule,
    DoseEvent,
    DoseMark,
    DoseSchedule,
    InsightsRequest,
    OrganizedRecord,
    Preparation,
    PreparationInput,
    ScheduleSaveResult,
    TimeOff,
    TimeOffCreate,
    TimeOffResult,
    TreatmentCreate,
    TreatmentEnd,
    TreatmentOverview,
    TreatmentPlan,
    TreatmentUpdate,
)
from app.services import (
    appointment_service,
    care_insights_service,
    consultation_service,
    doctor_access_service,
    fhir_service,
    gemini_client,
    intelligence_service,
    lab_extraction,
    patient_service,
    record_views,
    schedule_service,
    specialty_catalog,
    supabase_repo,
    treatment_service,
)

router = APIRouter(prefix="/care", tags=["care-journey"])
Lang = Literal["ro", "en"]
View = Literal["relevance", "chronological", "category"]


@contextmanager
def care_errors() -> Iterator[None]:
    try:
        with supabase_errors():
            yield
    except (schedule_service.NotFound, treatment_service.NotFound, consultation_service.NotFound) as exc:
        raise HTTPException(404, "Not found") from exc
    except schedule_service.InvalidSchedule as exc:
        raise HTTPException(422, f"Invalid schedule: {exc.code}") from exc
    except treatment_service.Forbidden as exc:
        detail = {"no_access": "The patient has not granted access to their medical profile",
                  "not_prescriber": "Only the prescribing doctor can change this treatment",
                  "forbidden": "Doctor account required"}.get(exc.code, "Forbidden")
        raise HTTPException(403, detail) from exc
    except PermissionError as exc:
        raise HTTPException(403, "Doctor account required") from exc
    except (treatment_service.InvalidState, consultation_service.InvalidState) as exc:
        raise HTTPException(409, "This item can no longer be changed") from exc
    except treatment_service.InvalidInput as exc:
        raise HTTPException(422, f"Invalid {exc}") from exc
    except intelligence_service.RateLimited as exc:
        raise HTTPException(429, "Too many requests, try again later",
                            headers={"Retry-After": str(exc.retry_after)}) from exc
    except gemini_client.GeminiRateLimited as exc:
        raise HTTPException(429, "Gemini is busy, try again later") from exc
    except gemini_client.GeminiTimeout as exc:
        raise HTTPException(504, "Gemini did not answer in time") from exc
    except gemini_client.GeminiFailed as exc:
        raise HTTPException(502, "Gemini could not produce a valid answer") from exc


def _run(fn: Callable, *args):
    with care_errors():
        return fn(*args)


# ─────────────────────────────────────────────────────────── doctor: schedule & agenda

@router.get("/doctor/schedule", response_model=DoctorSchedule)
def get_schedule(doctor: CurrentUser = Depends(get_current_doctor)) -> DoctorSchedule:
    return _run(schedule_service.get_schedule, doctor)


@router.put("/doctor/schedule", response_model=ScheduleSaveResult)
def save_schedule(body: DoctorSchedule, doctor: CurrentUser = Depends(get_current_doctor)) -> ScheduleSaveResult:
    """Regenerates FREE generated slots; booked slots and appointments are never deleted."""
    return _run(schedule_service.save_schedule, doctor, body)


@router.get("/doctor/time-off", response_model=list[TimeOff])
def list_time_off(doctor: CurrentUser = Depends(get_current_doctor)) -> list[TimeOff]:
    return _run(schedule_service.list_time_off, doctor)


@router.post("/doctor/time-off", response_model=TimeOffResult, status_code=201)
def add_time_off(body: TimeOffCreate, doctor: CurrentUser = Depends(get_current_doctor)) -> TimeOffResult:
    return _run(schedule_service.add_time_off, doctor, body)


@router.delete("/doctor/time-off/{time_off_id}", status_code=204)
def delete_time_off(time_off_id: str, doctor: CurrentUser = Depends(get_current_doctor)) -> Response:
    _run(schedule_service.delete_time_off, doctor, time_off_id)
    return Response(status_code=204)


@router.get("/doctor/agenda", response_model=DoctorAgenda)
def agenda(start: str = Query(alias="from", max_length=40), end: str = Query(alias="to", max_length=40),
           lang: Lang = "ro", doctor: CurrentUser = Depends(get_current_doctor)) -> DoctorAgenda:
    return _run(schedule_service.agenda, doctor, start, end, lang)


@router.get("/doctor/consultations/{appointment_id}", response_model=ConsultationSheet)
def consultation(appointment_id: str, lang: Lang = "ro", doctor: CurrentUser = Depends(get_current_doctor)) -> ConsultationSheet:
    """Preparation sent by the patient + the record sections the patient explicitly shared (logged)."""
    return _run(consultation_service.sheet, doctor, appointment_id, lang)


# ─────────────────────────────────────────────────────────── doctor: treatments

@router.get("/doctor/patients/{patient_id}/treatments", response_model=list[TreatmentPlan])
def doctor_treatments(patient_id: str, doctor: CurrentUser = Depends(get_current_doctor)) -> list[TreatmentPlan]:
    return _run(treatment_service.doctor_list, doctor, patient_id)


@router.post("/doctor/treatments", response_model=TreatmentPlan, status_code=201)
def create_treatment(body: TreatmentCreate, doctor: CurrentUser = Depends(get_current_doctor)) -> TreatmentPlan:
    return _run(treatment_service.create, doctor, body)


@router.put("/doctor/treatments/{plan_id}", response_model=TreatmentPlan)
def update_treatment(plan_id: str, body: TreatmentUpdate, doctor: CurrentUser = Depends(get_current_doctor)) -> TreatmentPlan:
    """New immutable version (who / when / what changed)."""
    return _run(treatment_service.update, doctor, plan_id, body)


@router.post("/doctor/treatments/{plan_id}/end", response_model=TreatmentPlan)
def end_treatment(plan_id: str, body: TreatmentEnd, doctor: CurrentUser = Depends(get_current_doctor)) -> TreatmentPlan:
    return _run(treatment_service.end, doctor, plan_id, body)


# ─────────────────────────────────────────────────────────── doctor: record, FHIR, insights (with consent)

def _doctor_data(doctor: CurrentUser, patient_id: str):
    o = doctor_access_service._open(doctor, patient_id, "summary")
    if o.get("status") != "ok":
        raise treatment_service.Forbidden("no_access")
    scopes = o.get("scopes") or []
    record, documents, labs = doctor_access_service.collect(doctor, patient_id, scopes, o.get("patient_name") or "")
    plans = treatment_service.list_for_patient(doctor, patient_id) if "profile" in scopes else None
    appts = [a for a in appointment_service.my_appointments(doctor, "ro") if a.patient_id == patient_id]
    return o, record, documents, labs, plans, appts


def _doctor_record(doctor: CurrentUser, patient_id: str, view: str, appointment_id: str | None, lang: str) -> OrganizedRecord:
    o, record, documents, labs, plans, appts = _doctor_data(doctor, patient_id)
    appts = [a.model_copy(update={"specialty_name": _spec(a.specialty_id, lang)}) for a in appts]
    items = record_views.build_items(record, documents, labs, plans, appts, o.get("patient_name") or "")
    reason, spec_id = None, None
    if appointment_id:
        sheet = consultation_service.sheet(doctor, appointment_id, lang)
        reason = sheet.preparation.reason if sheet.preparation else sheet.appointment.patient_note
        spec_id = sheet.appointment.specialty_id
    return record_views.organize(items, view, reason, spec_id, _spec(spec_id, lang))


def _spec(specialty_id: str | None, lang: str) -> str | None:
    spec = specialty_catalog.BY_ID.get(specialty_id or "")
    return spec.name(lang) if spec else None


@router.get("/doctor/patients/{patient_id}/record", response_model=OrganizedRecord)
def doctor_record(patient_id: str, view: View = "relevance", appointment_id: str | None = Query(None, alias="appointmentId", max_length=64),
                  lang: Lang = "ro", doctor: CurrentUser = Depends(get_current_doctor)) -> OrganizedRecord:
    return _run(_doctor_record, doctor, patient_id, view, appointment_id, lang)


def _doctor_fhir(doctor: CurrentUser, patient_id: str) -> dict:
    _, record, documents, labs, plans, appts = _doctor_data(doctor, patient_id)
    if settings.supabase_enabled:
        supabase_repo.log_fhir_export(doctor, patient_id)
    return fhir_service.bundle(patient_id, record, documents, labs, plans, appts)


@router.get("/doctor/patients/{patient_id}/fhir")
def doctor_fhir(patient_id: str, doctor: CurrentUser = Depends(get_current_doctor)) -> dict:
    """FHIR R4 Bundle of the shared sections only (logged)."""
    return _run(_doctor_fhir, doctor, patient_id)


@router.post("/doctor/patients/{patient_id}/insights", response_model=CareInsights)
def doctor_insights(patient_id: str, body: InsightsRequest, doctor: CurrentUser = Depends(get_current_doctor)) -> CareInsights:
    return _run(care_insights_service.for_doctor, doctor, patient_id, body.language, body.reason)


# ─────────────────────────────────────────────────────────── patient

@router.get("/appointments/{appointment_id}/preparation", response_model=Preparation | None)
def get_preparation(appointment_id: str, user: CurrentUser = Depends(get_current_user)) -> Preparation | None:
    return _run(consultation_service.get_preparation, user, appointment_id)


@router.put("/appointments/{appointment_id}/preparation", response_model=Preparation)
def save_preparation(appointment_id: str, body: PreparationInput, user: CurrentUser = Depends(get_current_user)) -> Preparation:
    """Sent only to this appointment's doctor."""
    return _run(consultation_service.save_preparation, user, appointment_id, body)


@router.get("/treatments", response_model=TreatmentOverview)
def my_treatments(tz: str = Query("Europe/Bucharest", max_length=64), user: CurrentUser = Depends(get_current_user)) -> TreatmentOverview:
    return _run(lambda: treatment_service.overview(user, treatment_service.validate_timezone(tz)))


@router.get("/treatments/{plan_id}", response_model=TreatmentPlan)
def my_treatment(plan_id: str, user: CurrentUser = Depends(get_current_user)) -> TreatmentPlan:
    return _run(treatment_service.get, user, plan_id)


@router.get("/reminders", response_model=DoseSchedule)
def reminders(tz: str = Query("Europe/Bucharest", max_length=64), user: CurrentUser = Depends(get_current_user)) -> DoseSchedule:
    """Documented intake times for the next days (local notifications; at most 60)."""
    return _run(lambda: treatment_service.reminder_schedule(user, treatment_service.validate_timezone(tz)))


@router.post("/doses", response_model=DoseEvent)
def mark_dose(body: DoseMark, tz: str = Query("Europe/Bucharest", max_length=64),
              user: CurrentUser = Depends(get_current_user)) -> DoseEvent:
    """The patient's own report (taken / skipped). Never changes the prescription."""
    return _run(lambda: treatment_service.mark_dose(user, body, treatment_service.validate_timezone(tz)))


def _own_data(user: CurrentUser, lang: str):
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
                 "document_date": titles.get(v["document_id"], (None, None))[1]} for v in lab_extraction.demo_list(user.id)]
    plans = treatment_service.list_for_patient(user, user.id)
    appts = [a for a in appointment_service.my_appointments(user, lang) if a.patient_id == user.id]
    return record, (record.documents if record else []), labs, plans, appts


def _own_record(user: CurrentUser, view: str, appointment_id: str | None, reason: str | None, lang: str) -> OrganizedRecord:
    record, documents, labs, plans, appts = _own_data(user, lang)
    items = record_views.build_items(record, documents, labs, plans, appts, record.full_name if record else "")
    spec_id = None
    if appointment_id:
        appt = next((a for a in appts if a.id == appointment_id), None)
        if appt is None:
            raise consultation_service.NotFound
        spec_id = appt.specialty_id
        prep = consultation_service.get_preparation(user, appointment_id)
        reason = reason or (prep.reason if prep else None) or appt.patient_note
    return record_views.organize(items, view, reason, spec_id, _spec(spec_id, lang))


@router.get("/record", response_model=OrganizedRecord)
def my_record(view: View = "relevance", appointment_id: str | None = Query(None, alias="appointmentId", max_length=64),
              reason: str | None = Query(None, max_length=300), lang: Lang = "ro",
              user: CurrentUser = Depends(get_current_user)) -> OrganizedRecord:
    return _run(_own_record, user, view, appointment_id, reason, lang)


def _own_fhir(user: CurrentUser) -> dict:
    record, documents, labs, plans, appts = _own_data(user, "en")
    if settings.supabase_enabled:
        supabase_repo.log_fhir_export(user, user.id)
    return fhir_service.bundle(user.id, record, documents, labs, plans, appts)


@router.get("/fhir")
def my_fhir(user: CurrentUser = Depends(get_current_user)) -> dict:
    """FHIR R4 Bundle of the patient's own data (logged)."""
    return _run(_own_fhir, user)


@router.post("/insights", response_model=CareInsights)
def my_insights(body: InsightsRequest, user: CurrentUser = Depends(get_current_user)) -> CareInsights:
    """Gemini over the patient's own data, only with AI consent; emergency rules first. Not stored."""
    return _run(care_insights_service.for_patient, user, body.language, body.reason)
