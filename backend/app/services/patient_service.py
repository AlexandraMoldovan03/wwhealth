"""Patient data access. TODO(backend): replace the in-memory demo record with PostgreSQL queries."""
from app.schemas.access import AccessScope
from app.schemas.patient import PatientRecord
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
