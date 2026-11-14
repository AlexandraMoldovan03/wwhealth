from fastapi import APIRouter, Depends, HTTPException

from app.api.supabase_errors import supabase_errors
from app.core.config import settings
from app.core.security import CurrentUser, get_current_user
from app.schemas.doctor_access import MedicalSummary
from app.schemas.patient import PatientRecord, ProfileUpdate
from app.services import lab_extraction, patient_service, supabase_repo
from app.services.medical_summary import build_summary

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("/me", response_model=PatientRecord)
def get_me(user: CurrentUser = Depends(get_current_user)) -> PatientRecord:
    with supabase_errors():
        record = supabase_repo.get_record(user) if settings.supabase_enabled else patient_service.get_patient(user.id)
    if not record:
        raise HTTPException(status_code=404, detail="Patient not found")
    return record


@router.patch("/me", response_model=PatientRecord)
def update_me(update: ProfileUpdate, user: CurrentUser = Depends(get_current_user)) -> PatientRecord:
    """Blood type, allergies, conditions (diagnoses) and medication (treatments) of the current user."""
    with supabase_errors():
        if settings.supabase_enabled:
            record = supabase_repo.update_profile(user, update)
        else:
            record = patient_service.update_profile(user.id, update)
    if not record:
        raise HTTPException(status_code=404, detail="Patient not found")
    return record


@router.get("/me/summary", response_model=MedicalSummary)
def my_summary(user: CurrentUser = Depends(get_current_user)) -> MedicalSummary:
    """The patient's own structured summary — the same view a doctor gets when every section is shared."""
    with supabase_errors():
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
                     "document_date": titles.get(v["document_id"], (None, None))[1]}
                    for v in lab_extraction.demo_list(user.id)]
    if not record:
        raise HTTPException(status_code=404, detail="Patient not found")
    from app.services import import_repo
    return build_summary(record, record.documents, labs, import_repo.facts_or_empty(user))
