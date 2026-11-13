from fastapi import APIRouter, Depends, File, UploadFile

from app.api.uploads import read_upload
from app.core.security import CurrentUser, get_current_user
from app.schemas.xray import XrayAnalysis
from app.services import xray_service

router = APIRouter(prefix="/xray", tags=["lungvision"])


@router.post("/analyze", response_model=XrayAnalysis)
async def analyze(file: UploadFile = File(...), user: CurrentUser = Depends(get_current_user)) -> XrayAnalysis:
    image = await read_upload(file, allowed={"image/jpeg", "image/png", "image/webp"})
    return xray_service.analyze_xray(user.id, image)
