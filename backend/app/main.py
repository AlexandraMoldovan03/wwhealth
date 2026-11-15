"""WWHealth API. Run from backend/:  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_v1
from app.api.routes import health, lung
from app.core.config import settings

app = FastAPI(title=settings.app_name, version=settings.version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-WWHealth-Step-Up", "Retry-After"],
)

if settings.app_env == "production" and "*" in settings.cors_origin_list:
    # The mobile app does not need CORS; only a web build does. Set CORS_ORIGINS to its exact HTTPS origin.
    logging.getLogger("wwhealth.security").warning("CORS_ORIGINS is '*' in production: restrict it to the web app origin.")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("X-Frame-Options", "DENY")
    if settings.app_env == "production":
        # Only meaningful once the API is served over HTTPS (TLS terminated by the reverse proxy).
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response

app.include_router(health.router)
app.include_router(api_v1)
app.include_router(lung.router)  # POST /api/ai/lung/analyze
