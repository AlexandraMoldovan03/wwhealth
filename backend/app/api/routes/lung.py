"""POST /api/ai/lung/analyze — LungVision (experimental). The image is processed in memory and not stored."""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.uploads import read_upload
from app.core.security import CurrentUser, get_current_user
from app.ml.lungvision.errors import InvalidImageError, ModelUnavailableError
from app.schemas.lung import LungAnalysis
from app.services import lung_service

router = APIRouter(prefix="/api/ai/lung", tags=["lungvision"])

ALLOWED_TYPES = {"image/jpeg", "image/png"}


@router.post("/analyze", response_model=LungAnalysis)
async def analyze(file: UploadFile = File(...), _user: CurrentUser = Depends(get_current_user)) -> LungAnalysis:
    image = await read_upload(file, allowed=ALLOWED_TYPES)  # 415 wrong type, 413 > 10 MB
    try:
        # CPU-bound (model + Grad-CAM) — keep the event loop free.
        return await run_in_threadpool(lung_service.analyze_lung_image, image)
    except InvalidImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=f"LungVision is not available on this server: {exc}") from exc
