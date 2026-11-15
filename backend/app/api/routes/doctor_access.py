"""Doctor Access & Consent. Patient routes: own grants only. Doctor routes: doctor role (public.profiles) + valid consent."""
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.api.supabase_errors import supabase_errors
from app.core.security import CurrentUser, get_current_doctor, get_current_user, get_sensitive_user
from app.core import rate_limit
from app.core.config import settings
from app.schemas.doctor_access import (
    AccessOverview,
    DoctorGrant,
    DoctorIdentity,
    DoctorPatient,
    GrantRequest,
    PatientAccessView,
    VerifiedDoctor,
)
from app.services import doctor_access_service as svc

router = APIRouter(prefix="/doctor-access", tags=["doctor-access"])


# ─────────────────────────────────────────────────────────── patient

@router.get("/doctors", response_model=list[VerifiedDoctor])
def search_doctors(q: str = Query("", max_length=60), user: CurrentUser = Depends(get_current_user)) -> list[VerifiedDoctor]:
    """Verified doctors only (role assigned by an administrator), by name or doctor code."""
    with supabase_errors():
        return svc.search_doctors(user, q)


@router.get("/grants", response_model=AccessOverview)
def my_grants(user: CurrentUser = Depends(get_current_user)) -> AccessOverview:
    """The patient's grants (active / expired / revoked) and every grant / revoke / view / denial."""
    with supabase_errors():
        return svc.overview(user)


@router.post("/grants", response_model=DoctorGrant, status_code=201)
def create_grant(body: GrantRequest, user: CurrentUser = Depends(get_sensitive_user)) -> DoctorGrant:
    """The signed-in user shares THEIR OWN data. Replaces an active grant to the same doctor (never stacks).
    High-risk: needs a recent sign-in (and TOTP when enabled). Revoking stays one tap, without step-up."""
    rate_limit.hit(f"grant:{user.id}", settings.doctor_grants_per_hour, 3600)
    if bool(body.doctor_id) == bool(body.doctor_code):
        raise HTTPException(status_code=422, detail="Choose a doctor or enter a doctor code")
    try:
        with supabase_errors():
            return svc.grant(user, body)
    except svc.DoctorNotFound as exc:
        raise HTTPException(status_code=404, detail="Verified doctor not found") from exc


@router.post("/grants/{grant_id}/revoke", status_code=204)
def revoke_grant(grant_id: str, user: CurrentUser = Depends(get_current_user)) -> Response:
    with supabase_errors():
        revoked = svc.revoke(user, grant_id)
    if not revoked:
        raise HTTPException(status_code=404, detail="Active access not found")
    return Response(status_code=204)


# ─────────────────────────────────────────────────────────── doctor

@router.get("/me", response_model=DoctorIdentity)
def doctor_me(doctor: CurrentUser = Depends(get_current_doctor)) -> DoctorIdentity:
    """The doctor's own name + code (patients can type the code to find them)."""
    with supabase_errors():
        return svc.identity(doctor)


@router.get("/patients", response_model=list[DoctorPatient])
def my_patients(q: str = Query("", max_length=60), doctor: CurrentUser = Depends(get_current_doctor)) -> list[DoctorPatient]:
    """Patients who granted this doctor access (latest grant each, with its status)."""
    with supabase_errors():
        return svc.patients(doctor, q)


@router.get("/patients/{patient_id}", response_model=PatientAccessView)
def open_patient(patient_id: str, doctor: CurrentUser = Depends(get_current_doctor)) -> PatientAccessView:
    """Medical summary + shared documents / lab values. Without valid consent: status only, no data."""
    with supabase_errors():
        return svc.open_patient(doctor, patient_id)


@router.get("/patients/{patient_id}/documents/{document_id}/file")
def patient_document_file(patient_id: str, document_id: str, doctor: CurrentUser = Depends(get_current_doctor)) -> Response:
    with supabase_errors():
        status, found = svc.document_file(doctor, patient_id, document_id)
    if status in ("expired", "revoked", "scope"):
        raise HTTPException(status_code=403, detail=f"Access {status}")
    if status != "ok" or found is None:
        raise HTTPException(status_code=404, detail="Document not found")
    content, mime_type, filename = found
    return Response(content=content, media_type=mime_type, headers={
        "Content-Disposition": f'inline; filename="{filename}"', "Cache-Control": "no-store",
    })
