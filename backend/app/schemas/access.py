from typing import Literal

from pydantic import Field

from app.schemas.base import CamelModel
from app.schemas.patient import PatientRecord

AccessScope = Literal["profile", "history", "documents", "xrays"]


class AccessGrantRequest(CamelModel):
    scopes: list[AccessScope] = Field(min_length=1)
    ttl_minutes: int = Field(default=15, ge=1)


class AccessGrantResponse(CamelModel):
    token: str
    qr_payload: str
    expires_at: str
    scopes: list[AccessScope]


class AccessRedeemRequest(CamelModel):
    token: str = Field(min_length=4)


class AccessRedeemResponse(CamelModel):
    access_id: str
    expires_at: str
    scopes: list[AccessScope]
    patient: PatientRecord
