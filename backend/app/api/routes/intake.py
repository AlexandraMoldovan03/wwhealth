from starlette.concurrency import run_in_threadpool

from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.supabase_errors import supabase_errors
from app.core.config import settings
from app.core.security import CurrentUser, get_current_user
from app.schemas.intake import IntakeForm
from app.services import supabase_repo
from app.services.intake_service import build_form

router = APIRouter(prefix="/intake", tags=["intake"])
MAX_AUDIO_BYTES = 25 * 1024 * 1024


@router.post("/voice", response_model=IntakeForm)
async def voice_intake(
    file: UploadFile = File(...),
    language: Literal["ro", "en"] = Form("ro"),  # app language: structured form + translation are written in it
    user: CurrentUser = Depends(get_current_user),
) -> IntakeForm:
    if settings.supabase_enabled:
        with supabase_errors():  # Supabase down / slow → 502 "Database unavailable", not a 500 traceback
            role = await run_in_threadpool(supabase_repo.get_role, user)
        if role != "patient":
            raise HTTPException(403, "Patient account required")
    audio = await file.read(MAX_AUDIO_BYTES + 1)
    if not audio:
        raise HTTPException(400, "Empty audio file")
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio file too large (max 25 MiB)")
    return await build_form(
        audio, file.filename or "recording.m4a", file.content_type or "application/octet-stream", language
    )
