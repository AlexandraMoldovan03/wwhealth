"""
Doctor Treatment Management + the patient's "My treatments" and Smart Medication Reminders.

Rules (same in Supabase — migration 20261118000000 — and in the demo store):
  • only an authenticated doctor (role `doctor`) with an ACTIVE grant including `profile` may create a plan;
    only the prescriber may modify / end it, and only while it is active; every change is a new immutable version
    (who, when, what dose); Gemini never writes here;
  • `prescription` = formal prescription issued in WWHealth (NOT an official CNAS e-prescription) ·
    `instructions` = treatment instructions · medication the patient declared lives in the medical profile;
  • doses exist only for `fixed_times` plans (hours documented by the doctor) — never for "as needed" or when the
    hours are not documented; the patient's "taken / skipped" is a self-report, never a clinical administration;
  • missed doses are never rescheduled or doubled.
Status for a given day (patient's time zone): CANCELLED / DISCONTINUED (stored) else UPCOMING (before start),
COMPLETED (after end), ACTIVE.
"""
import hashlib
import uuid
from datetime import UTC, date, datetime, time, timedelta

from app.core.config import settings
from app.core.security import CurrentUser
from app.schemas.care import (
    DoseEvent,
    DoseMark,
    DoseSchedule,
    TreatmentCreate,
    TreatmentEnd,
    TreatmentInput,
    TreatmentOverview,
    TreatmentPlan,
    TreatmentStatus,
    TreatmentUpdate,
    TreatmentVersion,
)
from app.services import doctor_access_service, patient_service, supabase_repo
from app.services.schedule_service import InvalidSchedule, zone

DEFAULT_TZ = "Europe/Bucharest"
MAX_REMINDERS = 60      # iOS keeps at most 64 pending local notifications per app
REMINDER_DAYS = 7


class NotFound(Exception):
    pass


class Forbidden(Exception):
    """no_access (no active grant with 'profile') · not_prescriber · forbidden (not a doctor)."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class InvalidState(Exception):
    pass


class InvalidInput(Exception):
    pass


# ─────────────────────────────────────────────────────────── pure rules

def compute_status(stored: str, start_date: str, end_date: str | None, today: date) -> TreatmentStatus:
    if stored == "cancelled":
        return "CANCELLED"
    if stored == "discontinued":
        return "DISCONTINUED"
    if today < date.fromisoformat(start_date):
        return "UPCOMING"
    if end_date and today > date.fromisoformat(end_date):
        return "COMPLETED"
    return "ACTIVE"


def _local_today(tz_name: str) -> date:
    return datetime.now(zone(tz_name)).date()


def check_input(body: TreatmentInput) -> None:
    if (body.schedule_type == "fixed_times") != bool(body.times_of_day):
        raise InvalidInput("times_of_day")
    if body.end_date and body.end_date < body.start_date:
        raise InvalidInput("dates")


def dose_times(plan: TreatmentPlan, tz_name: str, start: datetime, end: datetime) -> list[datetime]:
    """Documented intake times of the CURRENT version between start and end (UTC). None for as-needed /
    undocumented hours or ended plans. Local wall-clock times follow DST (a time skipped by the spring change is
    shifted forward by the zone rules; a repeated autumn time is used once)."""
    v = plan.current
    if v.schedule_type != "fixed_times" or plan.stored_status != "active":
        return []
    tz = zone(tz_name)
    first = max(date.fromisoformat(v.start_date), start.astimezone(tz).date())
    last = end.astimezone(tz).date()
    if v.end_date:
        last = min(last, date.fromisoformat(v.end_date))
    out: list[datetime] = []
    day = first
    while day <= last:
        for t in v.times_of_day:
            hh, mm = t.split(":")
            moment = datetime.combine(day, time(int(hh), int(mm)), tzinfo=tz).astimezone(UTC)
            if start <= moment < end:
                out.append(moment)
        day += timedelta(days=1)
    return sorted(out)


def plans_hash(plans: list[TreatmentPlan], tz_name: str) -> str:
    key = "|".join(sorted(f"{p.id}:{p.current.version}:{p.stored_status}" for p in plans)) + f"|{tz_name}"
    return hashlib.sha1(key.encode()).hexdigest()[:16]


# ─────────────────────────────────────────────────────────── mapping

def _version(row: dict) -> TreatmentVersion:
    amount = row.get("dose_amount")
    return TreatmentVersion(
        version=row["version"], medication_name=row["medication_name"], active_substance=row.get("active_substance"),
        strength=row.get("strength"), dosage_form=row.get("dosage_form"),
        dose_amount=float(amount) if amount is not None else None, dose_unit=row.get("dose_unit"),
        route=row.get("route"), schedule_type=row["schedule_type"], times_of_day=list(row.get("times_of_day") or []),
        frequency_text=row.get("frequency_text"), start_date=str(row["start_date"])[:10],
        end_date=str(row["end_date"])[:10] if row.get("end_date") else None, instructions=row.get("instructions"),
        status=row["status"], change_kind=row["change_kind"], change_reason=row.get("change_reason"),
        changed_by_name=row.get("changed_by_name") or "", changed_at=str(row["changed_at"]))


def _plan(row: dict, viewer: CurrentUser, today: date) -> TreatmentPlan:
    versions = sorted((_version(v) for v in row.get("treatment_plan_versions") or row.get("versions") or []),
                      key=lambda v: v.version)
    current = next((v for v in versions if v.version == row["current_version"]), versions[-1])
    return TreatmentPlan(
        id=row["id"], patient_id=row["patient_id"], prescriber_id=row.get("prescriber_id"),
        prescriber_name=row.get("prescriber_name") or "", appointment_id=row.get("appointment_id"), kind=row["kind"],
        stored_status=row["status"], status=compute_status(row["status"], current.start_date, current.end_date, today),
        issued_at=str(row["issued_at"]), current=current, history=list(reversed(versions)),
        can_edit=row.get("prescriber_id") == viewer.id and row["status"] == "active" and viewer.role == "doctor")


# ─────────────────────────────────────────────────────────── demo store

_plans: list[dict] = []
_dose_log: dict[tuple[str, str], dict] = {}  # (plan_id, scheduled_for iso) → {status, recorded_at, plan_version}


def reset_demo() -> None:
    _plans.clear()
    _dose_log.clear()


def _demo_has_profile_access(doctor_id: str, patient_id: str) -> bool:
    return any(g.doctor_id == doctor_id and g.patient_id == patient_id and g.status == "active"
               and "profile" in g.scopes for g in doctor_access_service._grants)


def _demo_doctor_name(doctor_id: str) -> str:
    return next((d["full_name"] for d in doctor_access_service.DEMO_DOCTORS if d["id"] == doctor_id), "")


def _version_row(body: TreatmentInput, version: int, status: str, change_kind: str, reason: str | None,
                 doctor: CurrentUser) -> dict:
    return {**body.model_dump(include=set(TreatmentInput.model_fields)), "version": version, "status": status,
            "change_kind": change_kind, "change_reason": (reason or "").strip() or None, "changed_by": doctor.id,
            "changed_by_name": _demo_doctor_name(doctor.id), "changed_at": datetime.now(UTC).isoformat()}


# ─────────────────────────────────────────────────────────── doctor

def _raise_for(status: str) -> None:
    if status == "ok":
        return
    if status in ("not_found",):
        raise NotFound
    if status in ("forbidden", "no_access", "not_prescriber"):
        raise Forbidden(status)
    if status == "invalid_state":
        raise InvalidState
    raise InvalidInput(status)


def _data(body: TreatmentInput) -> dict:
    return body.model_dump(include=set(TreatmentInput.model_fields), mode="json")


def create(doctor: CurrentUser, body: TreatmentCreate) -> TreatmentPlan:
    check_input(body)
    if settings.supabase_enabled:
        res = supabase_repo.treatment_save(doctor, None, body.patient_id, body.appointment_id, body.kind, _data(body), None)
        _raise_for(res.get("status", "not_found"))
        return get(doctor, res["id"])
    if body.patient_id == doctor.id or not _demo_has_profile_access(doctor.id, body.patient_id):
        raise Forbidden("no_access")
    row = {"id": str(uuid.uuid4()), "patient_id": body.patient_id, "prescriber_id": doctor.id,
           "prescriber_name": _demo_doctor_name(doctor.id), "appointment_id": body.appointment_id, "kind": body.kind,
           "status": "active", "current_version": 1, "issued_at": datetime.now(UTC).isoformat(),
           "versions": [_version_row(body, 1, "active", "created", None, doctor)]}
    _plans.append(row)
    return _plan(row, doctor, _local_today(DEFAULT_TZ))


def _demo_editable(doctor: CurrentUser, plan_id: str) -> dict:
    row = next((p for p in _plans if p["id"] == plan_id), None)
    if row is None:
        raise NotFound
    if row["prescriber_id"] != doctor.id:
        raise Forbidden("not_prescriber")
    if not _demo_has_profile_access(doctor.id, row["patient_id"]):
        raise Forbidden("no_access")
    if row["status"] != "active":
        raise InvalidState
    return row


def update(doctor: CurrentUser, plan_id: str, body: TreatmentUpdate) -> TreatmentPlan:
    check_input(body)
    if settings.supabase_enabled:
        res = supabase_repo.treatment_save(doctor, plan_id, None, None, None, _data(body), body.reason)
        _raise_for(res.get("status", "not_found"))
        return get(doctor, plan_id)
    row = _demo_editable(doctor, plan_id)
    row["current_version"] += 1
    row["versions"].append(_version_row(body, row["current_version"], "active", "updated", body.reason, doctor))
    return _plan(row, doctor, _local_today(DEFAULT_TZ))


def end(doctor: CurrentUser, plan_id: str, body: TreatmentEnd) -> TreatmentPlan:
    if settings.supabase_enabled:
        _raise_for(supabase_repo.treatment_end(doctor, plan_id, body.status, body.reason).get("status", "not_found"))
        return get(doctor, plan_id)
    row = _demo_editable(doctor, plan_id)
    last = dict(next(v for v in row["versions"] if v["version"] == row["current_version"]))
    row["current_version"] += 1
    row["status"] = body.status
    row["versions"].append({**last, "version": row["current_version"], "status": body.status, "change_kind": body.status,
                            "change_reason": (body.reason or "").strip() or None, "changed_by": doctor.id,
                            "changed_by_name": _demo_doctor_name(doctor.id), "changed_at": datetime.now(UTC).isoformat()})
    return _plan(row, doctor, _local_today(DEFAULT_TZ))


def get(user: CurrentUser, plan_id: str) -> TreatmentPlan:
    if settings.supabase_enabled:
        row = supabase_repo.treatment_get(user, plan_id)
    else:
        row = next((p for p in _plans if p["id"] == plan_id and (
            p["patient_id"] == user.id or p["prescriber_id"] == user.id
            or _demo_has_profile_access(user.id, p["patient_id"]))), None)
    if row is None:
        raise NotFound
    return _plan(row, user, _local_today(DEFAULT_TZ))


def _rows_for(user: CurrentUser, patient_id: str) -> list[dict]:
    if settings.supabase_enabled:
        return supabase_repo.treatments_list(user, patient_id)
    return [p for p in _plans if p["patient_id"] == patient_id and (
        p["patient_id"] == user.id or p["prescriber_id"] == user.id or _demo_has_profile_access(user.id, patient_id))]


def list_for_patient(user: CurrentUser, patient_id: str, tz_name: str = DEFAULT_TZ) -> list[TreatmentPlan]:
    today = _local_today(tz_name)
    return [_plan(r, user, today) for r in _rows_for(user, patient_id)]


def doctor_list(doctor: CurrentUser, patient_id: str) -> list[TreatmentPlan]:
    """Needs an active grant with 'profile' (checked + logged); RLS re-checks in Supabase."""
    status = doctor_access_service.check_section(doctor, patient_id, "profile")
    if status != "ok":
        raise Forbidden("no_access")
    return list_for_patient(doctor, patient_id)


# ─────────────────────────────────────────────────────────── patient: overview, doses, reminders

def _log(user: CurrentUser, since: datetime) -> dict[tuple[str, str], dict]:
    if settings.supabase_enabled:
        rows = supabase_repo.dose_log_list(user, user.id, since.isoformat())
        return {(r["plan_id"], _iso(datetime.fromisoformat(r["scheduled_for"].replace("Z", "+00:00")))): r for r in rows}
    return {k: v for k, v in _dose_log.items() if k[1] >= _iso(since)}


def _iso(d: datetime) -> str:
    return d.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _events(plans: list[TreatmentPlan], tz_name: str, start: datetime, end: datetime,
            log: dict[tuple[str, str], dict]) -> list[DoseEvent]:
    out = []
    for p in plans:
        for moment in dose_times(p, tz_name, start, end):
            key = (p.id, _iso(moment))
            mark = log.get(key)
            out.append(DoseEvent(plan_id=p.id, plan_version=p.current.version, medication_name=p.current.medication_name,
                                 scheduled_for=key[1], status=mark["status"] if mark else "pending",
                                 recorded_at=str(mark["recorded_at"]) if mark else None))
    return sorted(out, key=lambda e: e.scheduled_for)


def overview(user: CurrentUser, tz_name: str = DEFAULT_TZ) -> TreatmentOverview:
    zone(tz_name)
    plans = list_for_patient(user, user.id, tz_name)
    tz = zone(tz_name)
    now = datetime.now(UTC)
    local_midnight = datetime.combine(now.astimezone(tz).date(), time(0), tzinfo=tz).astimezone(UTC)
    tomorrow = datetime.combine(now.astimezone(tz).date() + timedelta(days=1), time(0), tzinfo=tz).astimezone(UTC)
    log = _log(user, local_midnight)
    today = _events(plans, tz_name, local_midnight, tomorrow, log)
    upcoming = _events(plans, tz_name, now, now + timedelta(days=REMINDER_DAYS), log)
    next_dose = next((e for e in upcoming if e.status == "pending"), None)
    record = None if settings.supabase_enabled else patient_service.get_patient(user.id)
    if settings.supabase_enabled:
        record = supabase_repo.get_record(user)
    return TreatmentOverview(
        timezone=tz_name, today=today, next_dose=next_dose,
        active=[p for p in plans if p.status == "ACTIVE"],
        upcoming=[p for p in plans if p.status == "UPCOMING"],
        finished=[p for p in plans if p.status in ("COMPLETED", "DISCONTINUED", "CANCELLED")],
        declared=[t for t in (record.treatments if record else [])],
        is_demo=not settings.supabase_enabled)


def reminder_schedule(user: CurrentUser, tz_name: str = DEFAULT_TZ) -> DoseSchedule:
    zone(tz_name)
    plans = [p for p in list_for_patient(user, user.id, tz_name) if p.status in ("ACTIVE", "UPCOMING")]
    now = datetime.now(UTC)
    log = _log(user, now)
    doses = [e for e in _events(plans, tz_name, now, now + timedelta(days=REMINDER_DAYS), log) if e.status == "pending"]
    return DoseSchedule(timezone=tz_name, doses=doses[:MAX_REMINDERS], plans_hash=plans_hash(plans, tz_name))


def mark_dose(user: CurrentUser, body: DoseMark, tz_name: str = DEFAULT_TZ) -> DoseEvent:
    """Only a documented time of one of the patient's own active plans; at most a day ahead."""
    try:
        moment = datetime.fromisoformat(body.scheduled_for.replace("Z", "+00:00")).astimezone(UTC)
    except ValueError as exc:
        raise InvalidInput("scheduled_for") from exc
    if moment > datetime.now(UTC) + timedelta(days=1):
        raise InvalidInput("scheduled_for")
    plan = next((p for p in list_for_patient(user, user.id, tz_name) if p.id == body.plan_id and p.patient_id == user.id), None)
    if plan is None:
        raise NotFound
    if moment not in dose_times(plan, tz_name, moment - timedelta(minutes=1), moment + timedelta(minutes=1)):
        raise InvalidInput("scheduled_for")
    key = (plan.id, _iso(moment))
    recorded = datetime.now(UTC).isoformat()
    if settings.supabase_enabled:
        supabase_repo.dose_log_mark(user, plan.id, plan.current.version, key[1], body.status)
    else:
        _dose_log[key] = {"status": body.status, "recorded_at": recorded, "plan_version": plan.current.version}
    return DoseEvent(plan_id=plan.id, plan_version=plan.current.version, medication_name=plan.current.medication_name,
                     scheduled_for=key[1], status=body.status, recorded_at=recorded)


def validate_timezone(tz_name: str | None) -> str:
    name = (tz_name or DEFAULT_TZ).strip()
    try:
        zone(name)
    except InvalidSchedule as exc:
        raise InvalidInput("timezone") from exc
    return name
