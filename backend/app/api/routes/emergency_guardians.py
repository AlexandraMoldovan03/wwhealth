"""
Emergency guardians (family members linked to a patient's emergency passport).

Patient:   GET  /emergency/guardians                       → my guardians + invitations to me + people I protect
           POST /emergency/guardians                       → invite an account by email (pending until accepted)
           POST /emergency/guardians/{id}/revoke           → remove a guardian / cancel an invitation
Guardian:  POST /emergency/guardians/{id}/accept | decline → answer an invitation sent to MY confirmed email
           GET  /emergency/guardians/patients/{patient_id} → ONLY emergency data (audited)
           POST /emergency/guardians/patients/{patient_id}/tokens → the patient's 5-minute QR for a doctor
"""
from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.supabase_errors import supabase_errors
from app.core.security import CurrentUser, get_current_user
from app.schemas.emergency import EmergencyTokenResponse
from app.schemas.emergency_guardians import GuardianEmergencyView, GuardianInviteRequest, GuardianOverview
from app.services import emergency_guardian_service as svc
from app.services import emergency_service as es

router = APIRouter(prefix="/emergency/guardians", tags=["emergency-guardians"])

NO_STORE = {"Cache-Control": "no-store, private"}
INVITE_ERRORS = {
    "invalid_email": (422, "Enter a valid email address"),
    "self": (422, "You cannot add yourself"),
    "duplicate": (409, "This person is already invited"),
    "limit": (409, "You can add at most 5 emergency contacts"),
}


@router.get("", response_model=GuardianOverview)
def overview(response: Response, user: CurrentUser = Depends(get_current_user)) -> GuardianOverview:
    with supabase_errors():
        result = svc.overview(user)
    response.headers.update(NO_STORE)
    return result


@router.post("", status_code=201)
def invite(body: GuardianInviteRequest, user: CurrentUser = Depends(get_current_user)) -> dict[str, str]:
    try:
        with supabase_errors():
            link_id = svc.invite(user, body.email, body.relation)
    except svc.InviteRejected as exc:
        code, detail = INVITE_ERRORS.get(exc.status, (502, "Unexpected response"))
        raise HTTPException(status_code=code, detail=detail) from exc
    return {"id": link_id}


@router.post("/{link_id}/revoke", status_code=204)
def revoke(link_id: str, user: CurrentUser = Depends(get_current_user)) -> Response:
    with supabase_errors():
        ok = svc.revoke(user, link_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Emergency contact not found")
    return Response(status_code=204)


def _respond(link_id: str, user: CurrentUser, accept: bool) -> Response:
    with supabase_errors():
        ok = svc.respond(user, link_id, accept)
    if not ok:
        raise HTTPException(status_code=404, detail="Invitation not found")
    return Response(status_code=204)


@router.post("/{link_id}/accept", status_code=204)
def accept(link_id: str, user: CurrentUser = Depends(get_current_user)) -> Response:
    return _respond(link_id, user, True)


@router.post("/{link_id}/decline", status_code=204)
def decline(link_id: str, user: CurrentUser = Depends(get_current_user)) -> Response:
    """Decline an invitation, or stop being someone's emergency contact."""
    return _respond(link_id, user, False)


@router.get("/patients/{patient_id}", response_model=GuardianEmergencyView)
def emergency_view(patient_id: str, response: Response,
                   user: CurrentUser = Depends(get_current_user)) -> GuardianEmergencyView:
    with supabase_errors():
        view = svc.emergency_view(user, patient_id)
    if view is None:
        raise HTTPException(status_code=404, detail="Emergency passport not available", headers=NO_STORE)
    response.headers.update(NO_STORE)
    return view


@router.post("/patients/{patient_id}/tokens", response_model=EmergencyTokenResponse)
def create_token(patient_id: str, response: Response,
                 user: CurrentUser = Depends(get_current_user)) -> EmergencyTokenResponse:
    token = es.new_token()
    with supabase_errors():
        created = svc.create_token(user, patient_id, es.hash_token(token))
    if created is None:
        raise HTTPException(status_code=404, detail="Emergency passport not available", headers=NO_STORE)
    response.headers.update(NO_STORE)
    return EmergencyTokenResponse(
        token_id=str(created["token_id"]), token=token, qr_payload=f"{es.QR_PREFIX}{token}",
        expires_at=str(created["expires_at"]), ttl_seconds=int(es.TTL.total_seconds()),
    )
