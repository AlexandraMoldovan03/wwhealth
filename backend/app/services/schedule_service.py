"""
Doctor agenda & weekly schedule.

Supabase: migration 20261118000000 — the schedule is saved by `save_doctor_schedule` (role checked in Postgres), which
regenerates the doctor's FREE generated slots; booked slots, manual slots and appointments are never deleted. Days
off / vacations / blocked intervals hide slots at query time. Overlaps are impossible at PostgreSQL level (EXCLUDE).
Demo: the same rules in memory, on top of appointment_service's demo store.

`generate_slots` is the pure equivalent of public.schedule_desired_slots (local wall-clock → UTC, DST-safe).
"""
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones

from app.core.config import settings
from app.core.security import CurrentUser
from app.schemas.care import (
    AgendaAppointment,
    AgendaSlot,
    DoctorAgenda,
    DoctorSchedule,
    ScheduleSaveResult,
    TimeOff,
    TimeOffCreate,
    TimeOffResult,
    WeeklyHours,
)
from app.services import appointment_service, specialty_catalog, supabase_repo


class InvalidSchedule(Exception):
    """invalid_timezone / invalid_hours / overlapping_hours / invalid_range."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class NotFound(Exception):
    pass


MAX_AGENDA_DAYS = 62


# ─────────────────────────────────────────────────────────── pure slot generation

def _t(value: str) -> time:
    hh, mm = value.split(":")
    return time(int(hh), int(mm))


def validate_hours(hours: list[WeeklyHours]) -> None:
    for h in hours:
        if _t(h.end) <= _t(h.start):
            raise InvalidSchedule("invalid_hours")
    for i, a in enumerate(hours):
        for b in hours[i + 1:]:
            if a.weekday == b.weekday and a.kind == b.kind and _t(a.start) < _t(b.end) and _t(b.start) < _t(a.end):
                raise InvalidSchedule("overlapping_hours")


def zone(name: str) -> ZoneInfo:
    if name not in available_timezones():
        raise InvalidSchedule("invalid_timezone")
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as exc:
        raise InvalidSchedule("invalid_timezone") from exc


def generate_slots(hours: list[WeeklyHours], timezone: str, slot_minutes: int, horizon_days: int,
                   now: datetime) -> list[tuple[datetime, datetime]]:
    """Future slots (UTC) from the weekly hours, excluding breaks. Wall-clock times follow DST changes."""
    tz = zone(timezone)
    step = timedelta(minutes=slot_minutes)
    today = now.astimezone(tz).date()
    out: list[tuple[datetime, datetime]] = []
    for offset in range(horizon_days + 1):
        day: date = today + timedelta(days=offset)
        weekday = day.isoweekday()
        breaks = [(_t(b.start), _t(b.end)) for b in hours if b.kind == "break" and b.weekday == weekday]
        for w in (h for h in hours if h.kind == "work" and h.weekday == weekday):
            start_local = datetime.combine(day, _t(w.start))
            end_local = datetime.combine(day, _t(w.end))
            cursor = start_local
            while cursor + step <= end_local:
                s_t, e_t = cursor.time(), (cursor + step).time()
                cursor += step
                if any(bs < e_t and s_t < be for bs, be in breaks):
                    continue
                start = (cursor - step).replace(tzinfo=tz).astimezone(UTC)
                end = cursor.replace(tzinfo=tz).astimezone(UTC)
                if start > now:
                    out.append((start, end))
    return out


# ─────────────────────────────────────────────────────────── demo store

@dataclass
class _DemoSchedule:
    timezone: str = "Europe/Bucharest"
    slot_minutes: int = 30
    horizon_days: int = 30
    hours: list[WeeklyHours] = field(default_factory=list)


@dataclass
class _TimeOff:
    doctor_id: str
    kind: str
    starts_at: datetime
    ends_at: datetime
    note: str | None
    id: str = field(default_factory=lambda: str(uuid.uuid4()))


_schedules: dict[str, _DemoSchedule] = {}
_time_off: list[_TimeOff] = []


def reset_demo() -> None:
    _schedules.clear()
    _time_off.clear()


def blocked(doctor_id: str, start: datetime, end: datetime) -> bool:
    """Demo: interval overlaps a day off / vacation / blocked interval of the doctor."""
    return any(t.doctor_id == doctor_id and t.starts_at < end and start < t.ends_at for t in _time_off)


def _demo_sync(doctor_id: str, sched: _DemoSchedule) -> tuple[int, int]:
    now = datetime.now(UTC)
    desired = set(generate_slots(sched.hours, sched.timezone, sched.slot_minutes, sched.horizon_days, now))
    removed = 0
    for s in list(appointment_service._slots):
        if s.doctor_id != doctor_id or s.source != "schedule" or s.starts_at <= now:
            continue
        if appointment_service._taken(doctor_id, s.starts_at, s.ends_at):
            continue  # booked slots are never removed
        if (s.starts_at, s.ends_at) not in desired:
            appointment_service._slots.remove(s)
            removed += 1
    added = 0
    for start, end in sorted(desired):
        if any(s.doctor_id == doctor_id and s.starts_at < end and start < s.ends_at for s in appointment_service._slots):
            continue
        appointment_service._slots.append(appointment_service._Slot(doctor_id, start, end, source="schedule"))
        added += 1
    return added, removed


# ─────────────────────────────────────────────────────────── API

def get_schedule(doctor: CurrentUser) -> DoctorSchedule:
    if settings.supabase_enabled:
        row, hours = supabase_repo.schedule_get(doctor)
        return DoctorSchedule(
            timezone=(row or {}).get("timezone") or "Europe/Bucharest",
            slot_minutes=(row or {}).get("slot_minutes") or 30,
            horizon_days=(row or {}).get("horizon_days") or 30,
            hours=[WeeklyHours(weekday=h["weekday"], kind=h["kind"], start=h["start_time"][:5], end=h["end_time"][:5])
                   for h in hours],
            configured=row is not None)
    s = _schedules.get(doctor.id)
    if s is None:
        return DoctorSchedule()
    return DoctorSchedule(timezone=s.timezone, slot_minutes=s.slot_minutes, horizon_days=s.horizon_days,  # type: ignore[arg-type]
                          hours=s.hours, configured=True)


def save_schedule(doctor: CurrentUser, body: DoctorSchedule) -> ScheduleSaveResult:
    zone(body.timezone)
    validate_hours(body.hours)
    if settings.supabase_enabled:
        res = supabase_repo.schedule_save(doctor, body.timezone, body.slot_minutes, body.horizon_days,
                                          [h.model_dump() for h in body.hours])
        status = res.get("status")
        if status == "forbidden":
            raise PermissionError
        if status != "ok":
            raise InvalidSchedule(status or "invalid_hours")
        return ScheduleSaveResult(added=res.get("added", 0), removed=res.get("removed", 0), schedule=get_schedule(doctor))
    sched = _DemoSchedule(body.timezone, body.slot_minutes, body.horizon_days, list(body.hours))
    _schedules[doctor.id] = sched
    added, removed = _demo_sync(doctor.id, sched)
    return ScheduleSaveResult(added=added, removed=removed, schedule=get_schedule(doctor))


def _parse(value: str) -> datetime:
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise InvalidSchedule("invalid_range") from exc
    if d.tzinfo is None:
        raise InvalidSchedule("invalid_range")
    return d.astimezone(UTC)


def list_time_off(doctor: CurrentUser) -> list[TimeOff]:
    if settings.supabase_enabled:
        return [TimeOff.model_validate(r) for r in supabase_repo.time_off_list(doctor)]
    now = datetime.now(UTC)
    return [TimeOff(id=t.id, kind=t.kind, starts_at=t.starts_at.isoformat(), ends_at=t.ends_at.isoformat(), note=t.note)  # type: ignore[arg-type]
            for t in sorted(_time_off, key=lambda t: t.starts_at) if t.doctor_id == doctor.id and t.ends_at > now]


def add_time_off(doctor: CurrentUser, body: TimeOffCreate) -> TimeOffResult:
    start, end = _parse(body.starts_at), _parse(body.ends_at)
    if end <= start or end - start > timedelta(days=366) or end <= datetime.now(UTC):
        raise InvalidSchedule("invalid_range")
    note = (body.note or "").strip() or None
    if settings.supabase_enabled:
        res = supabase_repo.time_off_add(doctor, body.kind, start.isoformat(), end.isoformat(), note)
        if res.get("status") == "forbidden":
            raise PermissionError
        if res.get("status") != "ok":
            raise InvalidSchedule("invalid_range")
        item = TimeOff(id=res["id"], kind=body.kind, starts_at=start.isoformat(), ends_at=end.isoformat(), note=note)
        return TimeOffResult(time_off=item, conflicts=int(res.get("conflicts") or 0))
    t = _TimeOff(doctor.id, body.kind, start, end, note)
    _time_off.append(t)
    conflicts = sum(1 for a in appointment_service._appts if a.doctor_id == doctor.id
                    and a.status in appointment_service.BLOCKING and a.starts_at < end and start < a.ends_at)
    return TimeOffResult(time_off=TimeOff(id=t.id, kind=body.kind, starts_at=start.isoformat(), ends_at=end.isoformat(),
                                          note=note), conflicts=conflicts)


def delete_time_off(doctor: CurrentUser, time_off_id: str) -> None:
    if settings.supabase_enabled:
        if not supabase_repo.time_off_delete(doctor, time_off_id):
            raise NotFound
        return
    t = next((t for t in _time_off if t.id == time_off_id and t.doctor_id == doctor.id), None)
    if t is None:
        raise NotFound
    _time_off.remove(t)


def agenda(doctor: CurrentUser, starts_at: str, ends_at: str, language: str) -> DoctorAgenda:
    start, end = _parse(starts_at), _parse(ends_at)
    if end <= start or end - start > timedelta(days=MAX_AGENDA_DAYS):
        raise InvalidSchedule("invalid_range")
    if settings.supabase_enabled:
        supabase_repo.ensure_doctor_availability(doctor, doctor.id)
        data = supabase_repo.doctor_agenda(doctor, start.isoformat(), end.isoformat())
        if data.get("status") == "forbidden":
            raise PermissionError
        appts = []
        for r in data.get("appointments", []):
            spec = specialty_catalog.BY_ID.get(r.get("specialty_id") or "")
            appts.append(AgendaAppointment.model_validate({**r, "doctor_id": doctor.id, "doctor_name": None,
                                                          "specialty_name": spec.name(language) if spec else None}))
        return DoctorAgenda(starts_at=start.isoformat(), ends_at=end.isoformat(), appointments=appts,
                            slots=[AgendaSlot.model_validate(s) for s in data.get("slots", [])],
                            time_off=[TimeOff.model_validate(t) for t in data.get("time_off", [])])
    appts = [AgendaAppointment(**appointment_service._demo_out(a, doctor, language).model_dump(), prepared=a.id in _demo_prepared())
             for a in sorted(appointment_service._appts, key=lambda a: a.proposed_starts_at or a.starts_at)
             if a.doctor_id == doctor.id and (
                 (a.starts_at < end and start < a.ends_at)
                 or (a.proposed_starts_at and a.proposed_ends_at and a.proposed_starts_at < end and start < a.proposed_ends_at))]
    slots = [AgendaSlot(id=s.id, starts_at=s.starts_at.isoformat(), ends_at=s.ends_at.isoformat(),
                        booked=appointment_service._taken(doctor.id, s.starts_at, s.ends_at),
                        blocked=blocked(doctor.id, s.starts_at, s.ends_at))
             for s in sorted(appointment_service._slots, key=lambda s: s.starts_at)
             if s.doctor_id == doctor.id and start <= s.starts_at < end]
    offs = [TimeOff(id=t.id, kind=t.kind, starts_at=t.starts_at.isoformat(), ends_at=t.ends_at.isoformat(), note=t.note)  # type: ignore[arg-type]
            for t in _time_off if t.doctor_id == doctor.id and t.starts_at < end and start < t.ends_at]
    return DoctorAgenda(starts_at=start.isoformat(), ends_at=end.isoformat(), appointments=appts, slots=slots, time_off=offs)


def _demo_prepared() -> set[str]:
    from app.services import consultation_service  # local import: avoids a cycle

    return set(consultation_service._preparations)
