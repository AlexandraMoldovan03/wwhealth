from fastapi import APIRouter

from app.api.routes import (
    care_journey,
    doctor_access,
    documents,
    emergency,
    intake,
    intelligence,
    patients,
    smart_care,
    smart_import,
    voice,
    xray,
)

api_v1 = APIRouter(prefix="/api/v1")
for module in (patients, documents, xray, doctor_access, intelligence, emergency, voice, intake, smart_care, care_journey, smart_import):
    api_v1.include_router(module.router)
