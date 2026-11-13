from fastapi import APIRouter, Depends, HTTPException

from app.core.security import CurrentUser, get_current_doctor, get_current_user
from app.schemas.access import AccessGrantRequest, AccessGrantResponse, AccessRedeemRequest, AccessRedeemResponse
from app.services import access_service, patient_service

router = APIRouter(prefix="/access", tags=["access"])


@router.post("/grant", response_model=AccessGrantResponse)
def grant(body: AccessGrantRequest, user: CurrentUser = Depends(get_current_user)) -> AccessGrantResponse:
    token, g = access_service.create_grant(user.id, body.scopes, body.ttl_minutes)
    return AccessGrantResponse(
        token=token, qr_payload=f"wwhealth://access/{token}", expires_at=g.expires_at.isoformat(), scopes=g.scopes
    )


@router.post("/redeem", response_model=AccessRedeemResponse)
def redeem(body: AccessRedeemRequest, doctor: CurrentUser = Depends(get_current_doctor)) -> AccessRedeemResponse:
    _ = doctor  # TODO(backend): log who accessed what (audit trail)
    redeemed = access_service.redeem(body.token)
    if not redeemed:
        raise HTTPException(status_code=404, detail="Invalid or expired access token")
    access_id, g = redeemed
    record = patient_service.get_patient(g.patient_id)
    if not record:
        raise HTTPException(status_code=404, detail="Patient not found")
    return AccessRedeemResponse(
        access_id=access_id, expires_at=g.expires_at.isoformat(), scopes=g.scopes,
        patient=patient_service.filter_by_scopes(record, g.scopes),
    )
