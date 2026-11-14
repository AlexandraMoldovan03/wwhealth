from fastapi import APIRouter, Depends, HTTPException

from app.api.supabase_errors import supabase_errors
from app.core.config import settings
from app.core.security import CurrentUser, get_current_user
from app.schemas.patient import PatientRecord, ProfileUpdate
from app.services import patient_service, supabase_repo

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
