from fastapi import APIRouter, Depends, HTTPException

from app.core.security import CurrentUser, get_current_user
from app.schemas.patient import PatientRecord
from app.services import patient_service

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("/me", response_model=PatientRecord)
def get_me(user: CurrentUser = Depends(get_current_user)) -> PatientRecord:
    record = patient_service.get_patient(user.id)
    if not record:
        raise HTTPException(status_code=404, detail="Patient not found")
    return record
