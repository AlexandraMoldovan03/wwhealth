"""Authentication. DEMO: everyone is the demo patient until Auth0 is wired in.

TODO(backend): validate the Auth0 JWT from `Authorization: Bearer <token>`
(issuer https://{AUTH0_DOMAIN}/, audience AUTH0_AUDIENCE) and read the role claim.
"""
from typing import Literal

from fastapi import Header
from pydantic import BaseModel

from app.services.demo_data import DEMO_PATIENT_ID

Role = Literal["patient", "doctor"]


class CurrentUser(BaseModel):
    id: str
    role: Role


async def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    # Placeholder: ignore the token, return the demo patient.
    _ = authorization
    return CurrentUser(id=DEMO_PATIENT_ID, role="patient")


async def get_current_doctor(authorization: str | None = Header(default=None)) -> CurrentUser:
    # Placeholder: in production, reject users without the "doctor" role (403).
    _ = authorization
    return CurrentUser(id="doc_demo_001", role="doctor")
