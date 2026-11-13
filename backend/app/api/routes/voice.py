from fastapi import APIRouter, Depends, HTTPException

from app.core.security import CurrentUser, get_current_doctor
from app.schemas.voice import VoiceSummaryRequest, VoiceSummaryResponse
from app.services import patient_service, voice_service

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/summary", response_model=VoiceSummaryResponse)
def summary(body: VoiceSummaryRequest, doctor: CurrentUser = Depends(get_current_doctor)) -> VoiceSummaryResponse:
    _ = doctor  # TODO(backend): check the doctor has an active access grant for this patient
    record = patient_service.get_patient(body.patient_id)
    if not record:
        raise HTTPException(status_code=404, detail="Patient not found")
    return voice_service.build_summary(record, body.language)
