"""
Smart Care appointments: verified doctors per specialty, the doctor's published calendar, booking requests.

Supabase: every rule lives in Postgres (migration 20261117000100) — security-definer RPCs for bookings, RLS for the
doctor's own availability. Specialties are assigned to doctors by an admin (doctor_specialties).
Demo (no Supabase): an in-memory store with the same states and rules; a few specialties have no doctor on purpose.

States: requested → confirmed | rejected | proposed (doctor offers another slot) → confirmed (patient accepts) |
cancelled (patient declines / cancels). A slot is free when no requested / confirmed / proposed appointment uses it.
"""
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.core.security import CurrentUser
from app.schemas.smart_care import Appointment, AvailabilityCreate, DoctorAvailabilityOut, Slot, SpecialtyOut
from app.services import specialty_catalog, supabase_repo
from app.services.demo_data import DEMO_PATIENT_ID


class NotFound(Exception):
    pass


class Conflict(Exception):
    """slot_unavailable / invalid_state / not_patient."""

    def __init__(self, status: str):
        super().__init__(status)
        self.status = status


class InvalidInput(Exception):
    pass


BLOCKING = ("requested", "confirmed", "proposed")
WINDOW_DAYS = 14


# ─────────────────────────────────────────────────────────── demo store

DEMO_CARE_DOCTORS = [
    {"id": "doc_demo_001", "full_name": "Dr. Alex Test", "doctor_code": "DR-DEMO01",
     "specialties": ["family_medicine", "internal_medicine", "cardiology"]},
    {"id": "doc_demo_002", "full_name": "Dr. Ana Exemplu", "doctor_code": "DR-DEMO02",
     "specialties": ["pulmonology", "allergology", "family_medicine"]},
    {"id": "doc_demo_003", "full_name": "Dr. Radu Test", "doctor_code": "DR-DEMO03",
     "specialties": ["neurology", "orthopedics", "gastroenterology"]},
]
_PATIENT_NAMES = {DEMO_PATIENT_ID: "Maria Ionescu"}


@dataclass
class _Slot:
    doctor_id: str
    starts_at: datetime
    ends_at: datetime
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    source: str = "manual"  # manual | schedule (generated from the weekly schedule, see schedule_service)


@dataclass
class _Appt:
    patient_id: str
    doctor_id: str
    specialty_id: str | None
    starts_at: datetime
    ends_at: datetime
    patient_note: str | None
    status: str = "requested"
    proposed_starts_at: datetime | None = None
    proposed_ends_at: datetime | None = None
    doctor_note: str | None = None
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


_slots: list[_Slot] = []
_appts: list[_Appt] = []


def _seed_demo() -> None:
    """Weekday mornings for the next 10 days (doctor 3 has none → 'no availability' case)."""
    today = datetime.now(UTC).replace(hour=7, minute=0, second=0, microsecond=0)
    for doc in DEMO_CARE_DOCTORS[:2]:
        for day in range(1, 11):
            base = today + timedelta(days=day)
            if base.weekday() >= 5:
                continue
            for k in range(4):
                start = base + timedelta(minutes=30 * k + (60 if doc["id"] == "doc_demo_002" else 0))
                _slots.append(_Slot(doc["id"], start, start + timedelta(minutes=30)))


def reset_demo() -> None:
    _slots.clear()
    _appts.clear()
    _seed_demo()


_seed_demo()


def _iso(d: datetime | None) -> str | None:
    return d.isoformat() if d else None


def _taken(doctor_id: str, start: datetime, end: datetime, ignore: str | None = None) -> bool:
    for a in _appts:
        if a.id == ignore or a.doctor_id != doctor_id:
            continue
        if a.status in ("requested", "confirmed") and a.starts_at < end and start < a.ends_at:
            return True
        if a.status == "proposed" and a.proposed_starts_at and a.proposed_ends_at \
                and a.proposed_starts_at < end and start < a.proposed_ends_at:
            return True
    return False


def _blocked(doctor_id: str, start: datetime, end: datetime) -> bool:
    from app.services import schedule_service  # local import: schedule_service builds on this module

    return schedule_service.blocked(doctor_id, start, end)


def _demo_free(doctor_id: str, days: int = WINDOW_DAYS) -> list[_Slot]:
    now = datetime.now(UTC)
    until = now + timedelta(days=days)
    return sorted((s for s in _slots if s.doctor_id == doctor_id and now < s.starts_at < until
                   and not _taken(doctor_id, s.starts_at, s.ends_at) and not _blocked(doctor_id, s.starts_at, s.ends_at)),
                  key=lambda s: s.starts_at)


def _demo_doc(doctor_id: str) -> dict | None:
    return next((d for d in DEMO_CARE_DOCTORS if d["id"] == doctor_id), None)


def _demo_out(a: _Appt, viewer: CurrentUser, language: str) -> Appointment:
    doc = _demo_doc(a.doctor_id)
    spec = specialty_catalog.BY_ID.get(a.specialty_id or "")
    return Appointment(
        id=a.id, patient_id=a.patient_id, doctor_id=a.doctor_id,
        patient_name=_PATIENT_NAMES.get(a.patient_id, "Pacient") if viewer.id == a.doctor_id else None,
        doctor_name=doc["full_name"] if doc else None,
        specialty_id=a.specialty_id, specialty_name=spec.name(language) if spec else None,
        starts_at=a.starts_at.isoformat(), ends_at=a.ends_at.isoformat(), status=a.status,  # type: ignore[arg-type]
        proposed_starts_at=_iso(a.proposed_starts_at), proposed_ends_at=_iso(a.proposed_ends_at),
        patient_note=a.patient_note, doctor_note=a.doctor_note,
        created_at=a.created_at.isoformat(), updated_at=a.updated_at.isoformat())


def _check(status: str) -> None:
    if status == "ok":
        return
    if status in ("not_found", "doctor_not_found"):
        raise NotFound(status)
    raise Conflict(status)


# ─────────────────────────────────────────────────────────── specialties & doctors (patient)

def specialties(query: str, language: str) -> list[SpecialtyOut]:
    return [SpecialtyOut(id=s.id, name=s.name(language)) for s in specialty_catalog.search(query)]


def specialty_doctors(user: CurrentUser, specialty_id: str) -> list[DoctorAvailabilityOut]:
    if specialty_id not in specialty_catalog.BY_ID:
        raise NotFound("specialty")
    if settings.supabase_enabled:
        supabase_repo.ensure_specialty_availability(user, specialty_id)  # extends schedules (idempotent)
        rows = supabase_repo.specialty_doctors(user, specialty_id)
        return [DoctorAvailabilityOut.model_validate(r) for r in rows if r.get("id") != user.id]
    out = []
    for d in DEMO_CARE_DOCTORS:
        if specialty_id not in d["specialties"] or d["id"] == user.id:
            continue
        free = _demo_free(d["id"])
        out.append(DoctorAvailabilityOut(id=d["id"], full_name=d["full_name"], doctor_code=d["doctor_code"],
                                         next_slot=free[0].starts_at.isoformat() if free else None, free_slots=len(free)))
    return sorted(out, key=lambda d: (d.free_slots == 0, d.next_slot or ""))


def doctor_slots(user: CurrentUser, doctor_id: str, days: int = WINDOW_DAYS) -> list[Slot]:
    days = max(1, min(days, 60))
    if settings.supabase_enabled:
        supabase_repo.ensure_doctor_availability(user, doctor_id)
        return [Slot.model_validate(r) for r in supabase_repo.doctor_free_slots(user, doctor_id, days)]
    if _demo_doc(doctor_id) is None:
        raise NotFound("doctor")
    return [Slot(id=s.id, starts_at=s.starts_at.isoformat(), ends_at=s.ends_at.isoformat())
            for s in _demo_free(doctor_id, days)]


# ─────────────────────────────────────────────────────────── appointments (patient)

def request(user: CurrentUser, slot_id: str, specialty_id: str | None, note: str | None, language: str) -> Appointment:
    if specialty_id is not None and specialty_id not in specialty_catalog.BY_ID:
        raise InvalidInput("specialty")
    note = (note or "").strip() or None
    if settings.supabase_enabled:
        res = supabase_repo.request_appointment(user, slot_id, specialty_id, note)
        _check(res.get("status", "not_found"))
        return _find(user, res["id"], language)
    if user.role != "patient":
        raise Conflict("not_patient")
    slot = next((s for s in _slots if s.id == slot_id), None)
    if slot is None or slot.doctor_id == user.id:
        raise NotFound("doctor_not_found")
    if slot.starts_at <= datetime.now(UTC) or _taken(slot.doctor_id, slot.starts_at, slot.ends_at) \
            or _blocked(slot.doctor_id, slot.starts_at, slot.ends_at):
        raise Conflict("slot_unavailable")
    appt = _Appt(user.id, slot.doctor_id, specialty_id, slot.starts_at, slot.ends_at, note)
    _appts.append(appt)
    return _demo_out(appt, user, language)


def my_appointments(user: CurrentUser, language: str) -> list[Appointment]:
    if settings.supabase_enabled:
        rows = supabase_repo.my_appointments(user)
        out = []
        for r in rows:
            spec = specialty_catalog.BY_ID.get(r.get("specialty_id") or "")
            out.append(Appointment.model_validate({**r, "specialty_name": spec.name(language) if spec else None}))
        return out
    mine = [a for a in _appts if user.id in (a.patient_id, a.doctor_id)]
    return [_demo_out(a, user, language) for a in sorted(mine, key=lambda a: a.starts_at)]


def _find(user: CurrentUser, appointment_id: str, language: str) -> Appointment:
    found = next((a for a in my_appointments(user, language) if a.id == appointment_id), None)
    if found is None:
        raise NotFound("not_found")
    return found


def patient_action(user: CurrentUser, appointment_id: str, action: str, language: str) -> Appointment:
    if settings.supabase_enabled:
        _check(supabase_repo.patient_update_appointment(user, appointment_id, action).get("status", "not_found"))
        return _find(user, appointment_id, language)
    a = next((x for x in _appts if x.id == appointment_id and x.patient_id == user.id), None)
    if a is None:
        raise NotFound("not_found")
    if action == "accept_proposal":
        if a.status != "proposed" or not a.proposed_starts_at or not a.proposed_ends_at:
            raise Conflict("invalid_state")
        if a.proposed_starts_at <= datetime.now(UTC) or _taken(a.doctor_id, a.proposed_starts_at, a.proposed_ends_at, a.id):
            raise Conflict("slot_unavailable")
        a.starts_at, a.ends_at = a.proposed_starts_at, a.proposed_ends_at
        a.proposed_starts_at = a.proposed_ends_at = None
        a.status = "confirmed"
    elif action == "decline_proposal":
        if a.status != "proposed":
            raise Conflict("invalid_state")
        a.status, a.proposed_starts_at, a.proposed_ends_at = "cancelled", None, None
    else:  # cancel
        if a.status not in BLOCKING:
            raise Conflict("invalid_state")
        a.status, a.proposed_starts_at, a.proposed_ends_at = "cancelled", None, None
    a.updated_at = datetime.now(UTC)
    return _demo_out(a, user, language)


# ─────────────────────────────────────────────────────────── doctor

def doctor_respond(doctor: CurrentUser, appointment_id: str, action: str, slot_id: str | None, note: str | None,
                   language: str) -> Appointment:
    note = (note or "").strip() or None
    if action == "propose" and not slot_id:
        raise InvalidInput("slot_required")
    if settings.supabase_enabled:
        res = supabase_repo.respond_appointment(doctor, appointment_id, action, slot_id if action == "propose" else None, note)
        _check(res.get("status", "not_found"))
        return _find(doctor, appointment_id, language)
    a = next((x for x in _appts if x.id == appointment_id and x.doctor_id == doctor.id), None)
    if a is None:
        raise NotFound("not_found")
    if a.status != "requested":
        raise Conflict("invalid_state")
    if action == "accept":
        if a.starts_at <= datetime.now(UTC):
            raise Conflict("slot_unavailable")
        a.status = "confirmed"
    elif action == "reject":
        a.status = "rejected"
    else:
        slot = next((s for s in _slots if s.id == slot_id and s.doctor_id == doctor.id), None)
        if slot is None or slot.starts_at <= datetime.now(UTC) or _taken(doctor.id, slot.starts_at, slot.ends_at, a.id) \
                or _blocked(doctor.id, slot.starts_at, slot.ends_at):
            raise Conflict("slot_unavailable")
        a.status, a.proposed_starts_at, a.proposed_ends_at = "proposed", slot.starts_at, slot.ends_at
    a.doctor_note = note
    a.updated_at = datetime.now(UTC)
    return _demo_out(a, doctor, language)


def availability(doctor: CurrentUser) -> list[Slot]:
    """The doctor's own future slots (free or booked)."""
    if settings.supabase_enabled:
        return [Slot.model_validate(r) for r in supabase_repo.availability_list(doctor)]
    now = datetime.now(UTC)
    return [Slot(id=s.id, starts_at=s.starts_at.isoformat(), ends_at=s.ends_at.isoformat())
            for s in sorted(_slots, key=lambda s: s.starts_at) if s.doctor_id == doctor.id and s.starts_at > now]


def _parse(value: str) -> datetime:
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise InvalidInput("date") from exc
    if d.tzinfo is None:
        raise InvalidInput("timezone")
    return d.astimezone(UTC)


def add_availability(doctor: CurrentUser, body: AvailabilityCreate) -> int:
    start, end = _parse(body.starts_at), _parse(body.ends_at)
    now = datetime.now(UTC)
    if end <= start or end - start > timedelta(hours=12) or start <= now or start > now + timedelta(days=89):
        raise InvalidInput("range")
    step = timedelta(minutes=body.slot_minutes)
    pieces: list[tuple[datetime, datetime]] = []
    cursor = start
    while cursor + step <= end:
        pieces.append((cursor, cursor + step))
        cursor += step
    if not pieces:
        raise InvalidInput("range")
    if settings.supabase_enabled:
        return supabase_repo.availability_add(doctor, [(s.isoformat(), e.isoformat()) for s, e in pieces])
    existing = {(s.doctor_id, s.starts_at) for s in _slots}
    added = 0
    for s, e in pieces:
        if (doctor.id, s) not in existing:
            _slots.append(_Slot(doctor.id, s, e))
            added += 1
    return added


def delete_availability(doctor: CurrentUser, slot_id: str) -> None:
    if settings.supabase_enabled:
        if not supabase_repo.availability_delete(doctor, slot_id):
            raise NotFound("slot")
        return
    slot = next((s for s in _slots if s.id == slot_id and s.doctor_id == doctor.id), None)
    if slot is None:
        raise NotFound("slot")
    _slots.remove(slot)  # booked appointments keep their own times (same as Postgres)
