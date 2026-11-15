"""
Conservative LOINC / UCUM mapping for lab exports. A code is added ONLY when the analyte name matches an exact alias
AND the unit is the one that LOINC term is defined for; otherwise the Observation keeps `code.text` / a text unit.
"""
from app.services.clinical_rules import fold

UCUM_SYSTEM = "http://unitsofmeasure.org"
LOINC_SYSTEM = "http://loinc.org"

# printed unit (folded, no spaces) → UCUM code
UCUM: dict[str, str] = {
    "mmol/l": "mmol/L", "meq/l": "meq/L", "mg/dl": "mg/dL", "g/dl": "g/dL", "g/l": "g/L", "mg/l": "mg/L",
    "umol/l": "umol/L", "µmol/l": "umol/L", "ng/ml": "ng/mL", "pg/ml": "pg/mL", "ug/l": "ug/L", "u/l": "U/L",
    "ui/l": "U/L", "iu/l": "[IU]/L", "miu/l": "m[IU]/L", "uiu/ml": "u[IU]/mL", "%": "%", "fl": "fL", "pg": "pg",
    "10^3/ul": "10*3/uL", "x10^3/ul": "10*3/uL", "10^9/l": "10*9/L", "x10^9/l": "10*9/L", "10^6/ul": "10*6/uL",
    "x10^6/ul": "10*6/uL", "10^12/l": "10*12/L", "x10^12/l": "10*12/L", "mm/h": "mm/h", "s": "s", "sec": "s",
}

# (aliases, UCUM unit, LOINC code, LOINC display)
LOINC: tuple[tuple[tuple[str, ...], str, str, str], ...] = (
    (("potasiu", "potassium", "kaliu", "k"), "mmol/L", "2823-3", "Potassium [Moles/volume] in Serum or Plasma"),
    (("sodiu", "sodium", "natriu", "na"), "mmol/L", "2951-2", "Sodium [Moles/volume] in Serum or Plasma"),
    (("glucoza", "glucose", "glicemie", "glicemia"), "mg/dL", "2345-7", "Glucose [Mass/volume] in Serum or Plasma"),
    (("hemoglobina", "hemoglobin", "hgb", "hb"), "g/dL", "718-7", "Hemoglobin [Mass/volume] in Blood"),
    (("trombocite", "platelets", "plt"), "10*3/uL", "777-3", "Platelets [#/volume] in Blood by Automated count"),
    (("leucocite", "wbc", "leukocytes"), "10*3/uL", "6690-2", "Leukocytes [#/volume] in Blood by Automated count"),
    (("creatinina", "creatinine", "creatinina serica"), "mg/dL", "2160-0", "Creatinine [Mass/volume] in Serum or Plasma"),
    (("hba1c", "hemoglobina glicata", "hemoglobina glicozilata"), "%", "4548-4",
     "Hemoglobin A1c/Hemoglobin.total in Blood"),
    (("colesterol total", "cholesterol total", "total cholesterol", "colesterol"), "mg/dL", "2093-3",
     "Cholesterol [Mass/volume] in Serum or Plasma"),
    (("alt", "tgp", "alat"), "U/L", "1742-6", "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma"),
    (("ast", "tgo", "asat"), "U/L", "1920-8", "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma"),
    (("tsh",), "m[IU]/L", "3016-3", "Thyrotropin [Units/volume] in Serum or Plasma"),
    (("calciu", "calcium", "calciu seric", "calciu total"), "mg/dL", "17861-6", "Calcium [Mass/volume] in Serum or Plasma"),
    (("crp", "proteina c reactiva", "c reactive protein"), "mg/L", "1988-5", "C reactive protein [Mass/volume] in Serum or Plasma"),
    (("inr",), "{INR}", "6301-6", "INR in Platelet poor plasma by Coagulation assay"),
)


def ucum(unit: str | None) -> str | None:
    if not unit:
        return None
    return UCUM.get(fold(unit).replace(" ", "").replace("μ", "u"))


def loinc(name: str, unit: str | None) -> dict | None:
    key = fold(name)
    code_unit = ucum(unit) if unit else "{INR}"
    for aliases, expected_unit, code, display in LOINC:
        if key in aliases and code_unit == expected_unit:
            return {"system": LOINC_SYSTEM, "code": code, "display": display}
    return None
