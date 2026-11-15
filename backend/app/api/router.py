from fastapi import APIRouter

from app.api.routes import (
    care_journey,
    doctor_access,
    documents,
    emergency,
    emergency_guardians,
    emergency_passport,
    exports,
    intake,
    intelligence,
    patients,
    smart_care,
    smart_import,
    voice,
    xray,
)

api_v1 = APIRouter(prefix="/api/v1")
for module in (patients, documents, xray, doctor_access, intelligence, emergency, emergency_guardians, emergency_passport, voice, intake, smart_care, care_journey, exports, smart_import):
    api_v1.include_router(module.router)
