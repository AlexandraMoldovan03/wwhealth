from fastapi import APIRouter

from app.api.routes import access, documents, patients, voice, xray

api_v1 = APIRouter(prefix="/api/v1")
for module in (patients, documents, xray, access, voice):
    api_v1.include_router(module.router)
