"""DEMO patient used until PostgreSQL is connected. Fictional data, mirrors the mobile mock."""
from app.schemas.document import DocumentExtraction, LabValue, MedicalDocument
from app.schemas.patient import Allergy, Diagnosis, EmergencyContact, MedicalEvent, PatientRecord, Treatment

DEMO_PATIENT_ID = "pat_demo_001"
DISCLAIMER = "DEMO — not a medical device. AI output must be reviewed by a qualified clinician."


def demo_patient() -> PatientRecord:
    return PatientRecord(
        id=DEMO_PATIENT_ID,
        full_name="Maria Ionescu",
        date_of_birth="1991-04-17",
        sex="female",
        blood_type="A+",
        height_cm=168,
        weight_kg=61,
        emergency_contact=EmergencyContact(name="Andrei Ionescu", phone="+40 700 000 000", relation="Brother"),
        allergies=[Allergy(id="al1", substance="Penicillin", reaction="Skin rash", severity="moderate")],
        diagnoses=[
            Diagnosis(id="dg1", name="Mild persistent asthma", icd10="J45.30", diagnosed_at="2019-03-02", status="active")
        ],
        treatments=[
            Treatment(id="tr1", name="Budesonide inhaler", dosage="200 mcg", frequency="2x daily",
                      start_date="2019-03-02", active=True)
        ],
        history=[
            MedicalEvent(id="ev1", type="visit", title="Pulmonology check-up", description="Asthma well controlled.",
                         date="2026-10-01T09:00:00Z", details={"Clinic": "Demo Clinic"})
        ],
        documents=[
            MedicalDocument(
                id="doc1", title="Complete blood count", type="lab_result", uploaded_at="2026-11-01T10:00:00Z",
                status="analyzed", is_demo=True,
                extraction=DocumentExtraction(
                    summary="Ferritin slightly below range.",
                    lab_values=[LabValue(name="Ferritin", value="11", unit="ng/mL", flag="low")],
                ),
            )
        ],
        xrays=[],
    )
