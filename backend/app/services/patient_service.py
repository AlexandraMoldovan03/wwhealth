"""Patient data access — in-memory demo store (used when Supabase is not configured, see supabase_repo)."""
import uuid
from datetime import date

from app.schemas.access import AccessScope
from app.schemas.patient import Allergy, Diagnosis, PatientRecord, ProfileUpdate, Treatment
from app.services.demo_data import DEMO_PATIENT_ID, demo_patient

_patients: dict[str, PatientRecord] = {DEMO_PATIENT_ID: demo_patient()}


def get_patient(patient_id: str) -> PatientRecord | None:
    return _patients.get(patient_id)


def filter_by_scopes(record: PatientRecord, scopes: list[AccessScope]) -> PatientRecord:
    """Doctors only see what the patient shared."""
    data = record.model_copy(deep=True)
    if "profile" not in scopes:
        data.allergies, data.diagnoses, data.treatments = [], [], []
    if "history" not in scopes:
        data.history = []
    if "documents" not in scopes:
        data.documents = []
    if "xrays" not in scopes:
        data.xrays = []
    return data


def update_profile(patient_id: str, update: ProfileUpdate) -> PatientRecord | None:
    record = _patients.get(patient_id)
    if record is None:
        return None
    return apply_profile_update(record, update)


def apply_profile_update(record: PatientRecord, update: ProfileUpdate) -> PatientRecord:
    """Applies only the fields present in the request (in place). New list items get server-generated ids.
    Shared by the in-memory store and Supabase (supabase_repo)."""
    sent = update.model_fields_set
    today = date.today().isoformat()

    def keep_or_new(item_id: str | None, existing: set[str], prefix: str) -> str:
        return item_id if item_id and item_id in existing else f"{prefix}_{uuid.uuid4().hex[:8]}"

    if "blood_type" in sent:
        record.blood_type = update.blood_type
    if "allergies" in sent and update.allergies is not None:
        ids = {a.id for a in record.allergies}
        record.allergies = [
            Allergy(id=keep_or_new(a.id, ids, "al"), substance=a.substance.strip(), reaction=a.reaction.strip(), severity=a.severity)
            for a in update.allergies
        ]
    if "diagnoses" in sent and update.diagnoses is not None:
        ids = {d.id for d in record.diagnoses}
        record.diagnoses = [
            Diagnosis(id=keep_or_new(d.id, ids, "dg"), name=d.name.strip(), icd10=d.icd10 or None,
                      diagnosed_at=d.diagnosed_at or today, status=d.status)
            for d in update.diagnoses
        ]
    if "treatments" in sent and update.treatments is not None:
        ids = {t.id for t in record.treatments}
        record.treatments = [
            Treatment(id=keep_or_new(t.id, ids, "tr"), name=t.name.strip(), dosage=t.dosage.strip(),
                      frequency=t.frequency.strip(), start_date=t.start_date or today, end_date=t.end_date, active=t.active)
            for t in update.treatments
        ]
    return record
