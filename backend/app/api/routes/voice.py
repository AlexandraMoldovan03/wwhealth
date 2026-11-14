from fastapi import APIRouter, Depends, HTTPException

from app.core.security import CurrentUser, get_current_doctor
from app.schemas.voice import VoiceSummaryRequest, VoiceSummaryResponse
from app.api.supabase_errors import supabase_errors
from app.services import doctor_access_service, patient_service, voice_service

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/summary", response_model=VoiceSummaryResponse)
def summary(body: VoiceSummaryRequest, doctor: CurrentUser = Depends(get_current_doctor)) -> VoiceSummaryResponse:
    # Same consent as the doctor dashboard: an active grant that includes the 'profile' section.
    with supabase_errors():
        status = doctor_access_service.check_section(doctor, body.patient_id, "profile")
    if status != "ok":
        raise HTTPException(status_code=403, detail="No valid consent from this patient")
    record = patient_service.get_patient(body.patient_id)
    if not record:
        raise HTTPException(status_code=404, detail="Patient not found")
    return voice_service.build_summary(record, body.language)
