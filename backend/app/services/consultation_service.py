"""
Consultation preparation (patient) and consultation sheet (doctor).

• The preparation (reason, symptoms, questions, optionally the Smart Care result the patient chose to attach) is sent
  ONLY to the appointment's doctor — the patient writes it for that consultation.
• Everything from the medical record (history, allergies, declared medication, labs, documents, WWHealth treatments)
  is shown only with the patient's explicit grant (doctor_access_consent) — checked here and by RLS in Postgres.
  Each opening is logged (clinical_audit_log + doctor_access_log).
"""
from datetime import UTC, datetime

from app.core.config import settings
from app.core.security import CurrentUser
from app.schemas.care import ConsultationSheet, GrantInfo, Preparation, PreparationInput
from app.schemas.document import PatientLabValue
from app.schemas.smart_care import Appointment
from app.services import appointment_service, doctor_access_service, specialty_catalog, supabase_repo, treatment_service


class NotFound(Exception):
    pass


class InvalidState(Exception):
    pass


_preparations: dict[str, dict] = {}  # demo: appointment_id → preparation


def reset_demo() -> None:
    _preparations.clear()


def _demo_appt(user: CurrentUser, appointment_id: str, role: str):
    a = next((x for x in appointment_service._appts if x.id == appointment_id), None)
    if a is None or (role == "patient" and a.patient_id != user.id) or (role == "doctor" and a.doctor_id != user.id):
        raise NotFound
    return a


# ─────────────────────────────────────────────────────────── patient

def get_preparation(user: CurrentUser, appointment_id: str) -> Preparation | None:
    if settings.supabase_enabled:
        row = supabase_repo.preparation_get(user, appointment_id)
        return Preparation.model_validate(row) if row else None
    _demo_appt(user, appointment_id, "patient")
    row = _preparations.get(appointment_id)
    return Preparation.model_validate(row) if row else None


def save_preparation(user: CurrentUser, appointment_id: str, body: PreparationInput) -> Preparation:
    data = body.model_dump()
    if settings.supabase_enabled:
        status = supabase_repo.preparation_save(user, appointment_id, data).get("status")
        if status == "not_found":
            raise NotFound
        if status != "ok":
            raise InvalidState
        return get_preparation(user, appointment_id) or Preparation(**data)
    a = _demo_appt(user, appointment_id, "patient")
    if a.status not in appointment_service.BLOCKING:
        raise InvalidState
    _preparations[appointment_id] = {**data, "reason": (body.reason or "").strip() or None,
                                     "symptoms": (body.symptoms or "").strip() or None,
                                     "updated_at": datetime.now(UTC).isoformat()}
    return Preparation.model_validate(_preparations[appointment_id])


# ─────────────────────────────────────────────────────────── doctor

def sheet(doctor: CurrentUser, appointment_id: str, language: str) -> ConsultationSheet:
    if settings.supabase_enabled:
        data = supabase_repo.doctor_consultation(doctor, appointment_id)
        if data.get("status") != "ok":
            raise NotFound
        row = data["appointment"]
        spec = specialty_catalog.BY_ID.get(row.get("specialty_id") or "")
        appointment = Appointment.model_validate({**row, "specialty_name": spec.name(language) if spec else None})
        preparation = Preparation.model_validate(data["preparation"]) if data.get("preparation") else None
        grant = GrantInfo.model_validate(data["grant"]) if data.get("grant") else None
    else:
        a = _demo_appt(doctor, appointment_id, "doctor")
        appointment = appointment_service._demo_out(a, doctor, language)
        prep = _preparations.get(appointment_id)
        preparation = Preparation.model_validate(prep) if prep else None
        mine = [g for g in doctor_access_service._grants if g.doctor_id == doctor.id and g.patient_id == a.patient_id]
        latest = max(mine, key=lambda g: g.created_at) if mine else None
        grant = GrantInfo(status=latest.status, scopes=latest.scopes, expires_at=latest.expires_at.isoformat()) if latest else None  # type: ignore[arg-type]

    out = ConsultationSheet(appointment=appointment, preparation=preparation, grant=grant)
    if grant is None or grant.status != "active":
        return out
    # Sections re-checked (and logged) through the consent service; RLS re-checks every read in Supabase.
    o = doctor_access_service._open(doctor, appointment.patient_id, "summary")
    if o.get("status") != "ok":
        out.grant = GrantInfo(status="expired" if o.get("status") == "expired" else "revoked", scopes=grant.scopes,
                              expires_at=grant.expires_at)
        return out
    scopes = o.get("scopes") or []
    record, documents, labs = doctor_access_service.collect(doctor, appointment.patient_id, scopes,
                                                            o.get("patient_name") or "")
    if record is not None:
        out.allergies, out.diagnoses = record.allergies, record.diagnoses
        out.surgeries, out.declared_medication = record.surgeries, record.treatments
        out.treatments = treatment_service.list_for_patient(doctor, appointment.patient_id)
    out.documents = documents
    out.labs = [PatientLabValue.model_validate(v) for v in labs] if labs is not None else None
    return out
