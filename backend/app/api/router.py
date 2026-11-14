from fastapi import APIRouter

from app.api.routes import doctor_access, documents, emergency, intake, intelligence, patients, voice, xray

api_v1 = APIRouter(prefix="/api/v1")
for module in (patients, documents, xray, doctor_access, intelligence, emergency, voice, intake):
    api_v1.include_router(module.router)
