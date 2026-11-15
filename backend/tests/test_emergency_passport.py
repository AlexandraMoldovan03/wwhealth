"""Prioritised Emergency Passport + document summary: pure rules, no AI."""
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.emergency_passport import PrioritizedPassport
from app.services import clinical_rules as rules
from app.services.emergency_passport import build_document_summary, build_passport

client = TestClient(app)


def fact(kind, label, status=None, doc="d1", date="2025-03-01", **value):
    return {"kind": kind, "label": label, "status": status, "document_id": doc, "document_title": f"Doc {doc}",
            "event_date": date, "source_page": 1, "source_excerpt": label, "value": value}


def lab(name, value, unit, ref, date="2025-03-01", doc="d1"):
    return {"name": name, "value": value, "unit": unit, "reference_range": ref, "measured_at": date,
            "document_id": doc, "document_title": f"Doc {doc}"}


def keys(items):
    return [(i.kind, i.label) for i in items]


def test_empty_record_shows_unknown_allergies_not_no_allergies():
    p = build_passport({})
    assert p.allergies_status == "unknown"
    assert p.critical == p.essential == p.investigations == p.normal_labs == []
    PrioritizedPassport.model_validate(p.model_dump())  # schema-valid JSON


def test_critical_first_by_clinical_rules():
    p = build_passport({
        "blood_type": "A+",
        "allergies": [{"substance": "Polen", "reaction": "rinită", "severity": "mild"},
                      {"substance": "Penicilină", "reaction": "șoc anafilactic", "severity": "moderate"}],
        "conditions": [{"name": "Fibrilație atrială", "status": "active"}, {"name": "Gastrită", "status": "active"},
                       {"name": "Apendicită", "status": "resolved"}],
        "medications": [{"name": "Xarelto", "dosage": "20 mg", "frequency": "1/zi", "active": True},
                        {"name": "Omeprazol", "dosage": "20 mg", "active": True},
                        {"name": "Insulină Lantus", "dosage": "18 UI", "active": True},
                        {"name": "Amoxicilină", "active": False}],
        "surgeries": [{"name": "Apendicectomie", "date": "2010"}],
    })
    assert p.allergies_status == "known"
    crit = keys(p.critical)
    assert crit[0] == ("allergy", "Penicilină")  # anaphylaxis → treated as severe, listed first
    assert {"anaphylaxis", "severe_allergy", "drug_allergy"} <= set(p.critical[0].flags)
    assert ("condition", "Fibrilație atrială") in crit and ("condition", "Gastrită") not in crit
    assert ("medication", "Xarelto") in crit and ("medication", "Insulină Lantus") in crit
    ess = keys(p.essential)
    assert ess[0] == ("blood_type", "A+")
    assert ("medication", "Omeprazol") in ess and ("condition", "Gastrită") in ess
    assert ("history", "Apendicită") in ess and ("procedure", "Apendicectomie") in ess
    assert all(label != "Amoxicilină" for _, label in crit + ess)  # past medication not shown as active
    labels = [label for _, label in crit + ess]
    assert len(labels) == len(set(labels))  # no duplicates


def test_critical_lab_is_not_hidden_and_normal_labs_stay_apart():
    p = build_passport({}, labs=[
        lab("Potasiu", "6,8", "mmol/L", "3.5 - 5.1"),
        lab("Hemoglobină", "11.9", "g/dL", "12 - 16"),
        lab("Colesterol", "180", "mg/dL", "< 200"),
        lab("Hemoglobină", "12.8", "g/dL", "12 - 16", date="2024-01-10"),
    ])
    assert keys(p.critical) == [("lab", "Potasiu")] and p.critical[0].lab.critical
    assert keys(p.investigations) == [("lab", "Hemoglobină")]
    hb = p.investigations[0].lab
    assert hb.status == "low" and hb.reference_range == "12 - 16" and hb.previous[0].value == "12.8"  # trend kept
    assert keys(p.normal_labs) == [("lab", "Colesterol")]


def test_lab_thresholds_need_a_known_unit():
    assert rules.is_critical_lab("Glicemie", "450", "mg/dL", "70-110")
    assert not rules.is_critical_lab("Glicemie", "450", "unknown", "70-110")
    assert rules.is_critical_lab("Troponină I", "0.9", "ng/mL", "< 0.04")
    assert rules.lab_status("abc", "1-2") == "unknown" and rules.lab_status("5", None) == "unknown"


def test_incomplete_extraction_is_marked_needs_confirmation():
    p = build_passport({"medications": [{"name": "Metformin", "dosage": "500 mg", "active": True}]}, facts=[
        fact("diagnosis", "Diabet zaharat tip 2", "suspected"),
        fact("diagnosis", "Insuficiență cardiacă", "confirmed"),       # not in profile → needs confirmation
        fact("allergy", "Latex"),                                       # not in profile → needs confirmation
        fact("medication", "Warfarină", "at_discharge"),                # historical high-risk → warn, unconfirmed
        fact("medication", "Paracetamol", "prescribed"),                # historical, low risk → not on passport
        fact("diagnosis", "Pneumonie", "ruled_out"),                    # ruled out → never shown
        fact("diagnosis", "", "confirmed"),                              # empty → ignored
    ])
    by = {i.label: i for i in [*p.critical, *p.essential]}
    assert "suspected" in by["Diabet zaharat tip 2"].flags and not by["Diabet zaharat tip 2"].confirmed
    assert by["Diabet zaharat tip 2"] in p.essential  # a suspicion is never promoted to critical
    assert not by["Insuficiență cardiacă"].confirmed and by["Insuficiență cardiacă"] in p.critical
    assert not by["Latex"].confirmed and p.allergies_status == "known"
    assert {"anticoagulant", "historical_medication"} <= set(by["Warfarină"].flags) and not by["Warfarină"].confirmed
    assert "Paracetamol" not in by and "Pneumonie" not in by
    assert by["Diabet zaharat tip 2"].sources[0].document_id == "d1"  # traceable source
    assert p.unconfirmed == 4


def test_contradictions_keep_every_source_and_choose_nothing():
    p = build_passport(
        {"allergies": [{"substance": "Penicilină", "reaction": "urticarie", "severity": "mild"}],
         "conditions": [{"name": "Astm bronșic", "status": "resolved"}],
         "medications": [{"name": "Warfarină", "dosage": "5 mg", "active": True}]},
        facts=[fact("allergy", "Penicilina", severity="severe"),
               fact("diagnosis", "Astm bronșic", "confirmed", doc="d2"),
               fact("medication", "Warfarina", "at_discharge", doc="d3", dosage="2.5 mg")],
        labs=[lab("Potasiu", "4.1", "mmol/L", "3.5-5.1", doc="a"), lab("Potasiu", "5.9", "mmol/L", "3.5-5.1", doc="b")],
    )
    items = {i.label: i for i in [*p.critical, *p.essential, *p.investigations, *p.normal_labs]}
    pen = items["Penicilină"]
    assert pen.conflict and len(pen.sources) == 2 and pen.severity == "mild"  # profile value kept, conflict shown
    assert items["Astm bronșic"].conflict
    war = items["Warfarină"]
    assert war.conflict and any("5 mg" in v for v in war.conflict_values) and any("2.5 mg" in v for v in war.conflict_values)
    assert items["Potasiu"].conflict and items["Potasiu"].conflict_values == ["4.1", "5.9"]
    assert p.conflicts == 4


def test_document_without_relevant_data_has_empty_sections():
    s = build_document_summary("d9", "other", None, facts=[], labs=[])
    assert s.findings == s.abnormal_labs == s.diagnoses == s.treatment == s.emergency_relevant == []
    assert s.normal_labs_count == 0 and s.needs_confirmation == 0


def test_document_summary_structures_and_flags():
    s = build_document_summary("d1", "discharge_summary", "2025-03-01T10:00:00", facts=[
        fact("diagnosis", "Pneumonie comunitară", "confirmed"),
        fact("diagnosis", "Neoplasm pulmonar", "suspected"),
        fact("diagnosis", "TBC", "history"),
        fact("diagnosis", "COVID-19", "ruled_out"),
        fact("medication", "Clexane", "at_discharge", dosage="0.4 ml", frequency="1/zi"),
        fact("recommendation", "Control peste 2 săptămâni"),
        fact("symptom", "Febră"),
    ], labs=[lab("Leucocite", "35", "10^3/uL", "4-10"), lab("Sodiu", "140", "mmol/L", "135-145")])
    assert s.date == "2025-03-01"
    diag = {i.label: i for i in s.diagnoses}
    assert set(diag) == {"Pneumonie comunitară", "Neoplasm pulmonar", "TBC"}
    assert not diag["Neoplasm pulmonar"].confirmed and diag["TBC"].kind == "history"
    assert [i.label for i in s.treatment] == ["Clexane", "Control peste 2 săptămâni"]
    assert s.treatment[0].detail == "0.4 ml · 1/zi"
    assert [i.label for i in s.abnormal_labs] == ["Leucocite"] and s.abnormal_labs[0].lab.critical
    assert s.normal_labs_count == 1
    assert {i.label for i in s.emergency_relevant} == {"Clexane", "Leucocite"}  # suspicion is not emergency data
    assert s.needs_confirmation == 1


def test_patient_preview_endpoint_and_missing_document():
    res = client.get("/api/v1/emergency/passport")
    assert res.status_code == 200 and res.headers["cache-control"].startswith("no-store")
    body = res.json()
    assert set(body) >= {"allergiesStatus", "critical", "essential", "investigations", "normalLabs", "conflicts"}
    assert client.get("/api/v1/documents/nope/summary").status_code == 404
