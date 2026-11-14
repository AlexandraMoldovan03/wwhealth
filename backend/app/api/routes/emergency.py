"""
Emergency Medical Passport.

Patient:  POST /emergency/tokens            → new 5-minute single-use QR token (previous one is revoked)
          POST /emergency/tokens/{id}/revoke
          GET  /emergency/audit             → who accessed / tried to access
Doctor:   POST /emergency/redeem            → blood type, allergies, conditions, medication — nothing else
          GET  /emergency/my-accesses       → the doctor's own access history

The token is validated here (hash + atomic consume in the database), never in the app.
"""
from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.supabase_errors import supabase_errors
from app.core.config import settings
from app.core.security import CurrentUser, get_current_doctor, get_current_user
from app.schemas.emergency import EmergencyAccessEvent, EmergencyData, EmergencyRedeemRequest, EmergencyTokenResponse
from app.services import emergency_service as es
from app.services import supabase_repo

router = APIRouter(prefix="/emergency", tags=["emergency"])

NO_STORE = {"Cache-Control": "no-store, private"}
REJECTIONS = {
    "not_found": (404, "Invalid emergency code"),
    "expired": (410, "Emergency code expired"),
    "revoked": (410, "Emergency code revoked"),
    "used": (409, "Emergency code already used"),
    "forbidden": (403, "Doctor account required"),
}


@router.post("/tokens", response_model=EmergencyTokenResponse)
def create_token(response: Response, user: CurrentUser = Depends(get_current_user)) -> EmergencyTokenResponse:
    token = es.new_token()
    token_hash = es.hash_token(token)
    with supabase_errors():
        if settings.supabase_enabled:
            created = supabase_repo.create_emergency_token(user, token_hash)
        else:
            created = es.demo_create(user.id, token_hash)
    response.headers.update(NO_STORE)
    return EmergencyTokenResponse(
        token_id=str(created["token_id"]), token=token, qr_payload=f"{es.QR_PREFIX}{token}",
        expires_at=str(created["expires_at"]), ttl_seconds=int(es.TTL.total_seconds()),
    )


@router.post("/tokens/{token_id}/revoke", status_code=204)
def revoke_token(token_id: str, user: CurrentUser = Depends(get_current_user)) -> Response:
    with supabase_errors():
        if settings.supabase_enabled:
            revoked = supabase_repo.revoke_emergency_token(user, token_id)
        else:
            revoked = es.demo_revoke(user.id, token_id)
    if not revoked:
        raise HTTPException(status_code=404, detail="No active emergency code to revoke")
    return Response(status_code=204)


@router.post("/redeem", response_model=EmergencyData)
def redeem(body: EmergencyRedeemRequest, response: Response,
           doctor: CurrentUser = Depends(get_current_doctor)) -> EmergencyData:
    token_hash = es.hash_token(es.parse_token(body.token))
    with supabase_errors():
        if settings.supabase_enabled:
            result = supabase_repo.redeem_emergency_token(doctor, token_hash)
        else:
            result = es.demo_redeem(doctor.id, token_hash)
    status = result.get("status") if isinstance(result, dict) else None
    if status != "ok":
        code, detail = REJECTIONS.get(status or "", (502, "Unexpected response"))
        raise HTTPException(status_code=code, detail=detail, headers=NO_STORE)
    response.headers.update(NO_STORE)
    return es.emergency_data(result)


def _events(rows: list[dict]) -> list[EmergencyAccessEvent]:
    return [EmergencyAccessEvent(id=str(r["id"]), event=r["event"], reason=r.get("reason"),
                                 actor_name=r.get("actor_name"), created_at=str(r["created_at"])) for r in rows]


@router.get("/audit", response_model=list[EmergencyAccessEvent])
def audit(user: CurrentUser = Depends(get_current_user)) -> list[EmergencyAccessEvent]:
    with supabase_errors():
        rows = supabase_repo.emergency_audit(user) if settings.supabase_enabled else es.demo_audit(user.id)
    return _events(rows)


@router.get("/my-accesses", response_model=list[EmergencyAccessEvent])
def my_accesses(doctor: CurrentUser = Depends(get_current_doctor)) -> list[EmergencyAccessEvent]:
    """Doctor's own emergency scans (opened / refused). Contains no patient identity or medical data."""
    with supabase_errors():
        if settings.supabase_enabled:
            rows = supabase_repo.emergency_doctor_accesses(doctor)
        else:
            rows = es.demo_doctor_accesses(doctor.id)
    return _events(rows)
