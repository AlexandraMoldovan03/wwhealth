"""
Medical specialty catalog — controlled by the backend. Gemini may only return ids from this list; anything else is
dropped. The same ids are seeded into public.medical_specialties (migration 20261117000100) and a test keeps both in
sync. `terms` power the manual (non-AI) search in both languages.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Specialty:
    id: str
    name_ro: str
    name_en: str
    terms: tuple[str, ...] = ()

    def name(self, language: str) -> str:
        return self.name_ro if language == "ro" else self.name_en


CATALOG: tuple[Specialty, ...] = (
    Specialty("family_medicine", "Medicină de familie", "Family medicine", ("general", "medic de familie", "gp")),
    Specialty("internal_medicine", "Medicină internă", "Internal medicine", ("interne",)),
    Specialty("cardiology", "Cardiologie", "Cardiology", ("inima", "heart", "tensiune", "blood pressure")),
    Specialty("pulmonology", "Pneumologie", "Pulmonology", ("plamani", "lungs", "tuse", "cough", "respiratie")),
    Specialty("gastroenterology", "Gastroenterologie", "Gastroenterology", ("stomac", "stomach", "digestie", "intestin")),
    Specialty("neurology", "Neurologie", "Neurology", ("cap", "headache", "nervi", "migrena")),
    Specialty("dermatology", "Dermatologie", "Dermatology", ("piele", "skin", "eruptie", "rash")),
    Specialty("ent", "ORL", "ENT (ear, nose, throat)", ("ureche", "nas", "gat", "ear", "nose", "throat", "otorino")),
    Specialty("ophthalmology", "Oftalmologie", "Ophthalmology", ("ochi", "eye", "vedere", "vision")),
    Specialty("endocrinology", "Endocrinologie", "Endocrinology", ("tiroida", "thyroid", "diabet", "diabetes", "hormoni")),
    Specialty("nephrology", "Nefrologie", "Nephrology", ("rinichi", "kidney")),
    Specialty("urology", "Urologie", "Urology", ("urinar", "urinary", "prostata")),
    Specialty("gynecology", "Obstetrică-ginecologie", "Obstetrics & gynecology", ("ginecolog", "sarcina", "pregnancy")),
    Specialty("orthopedics", "Ortopedie", "Orthopedics", ("oase", "bones", "articulatii", "joints", "fractura")),
    Specialty("rheumatology", "Reumatologie", "Rheumatology", ("reumatism", "artrita", "arthritis")),
    Specialty("allergology", "Alergologie și imunologie", "Allergy & immunology", ("alergie", "allergy")),
    Specialty("psychiatry", "Psihiatrie", "Psychiatry", ("anxietate", "anxiety", "depresie", "depression", "somn")),
    Specialty("pediatrics", "Pediatrie", "Pediatrics", ("copil", "child", "copii", "children")),
    Specialty("infectious_diseases", "Boli infecțioase", "Infectious diseases", ("infectie", "infection", "febra")),
    Specialty("hematology", "Hematologie", "Hematology", ("sange", "blood", "anemie", "anemia")),
    Specialty("oncology", "Oncologie", "Oncology", ("cancer", "tumora", "tumor")),
    Specialty("general_surgery", "Chirurgie generală", "General surgery", ("chirurgie", "surgery", "hernie")),
    Specialty("emergency_medicine", "Medicină de urgență", "Emergency medicine", ("urgenta", "emergency")),
)

BY_ID = {s.id: s for s in CATALOG}


def _fold(text: str) -> str:
    table = str.maketrans("ăâîșşțţĂÂÎȘŞȚŢ", "aaisstt" + "AAISSTT")
    return text.translate(table).lower().strip()


def search(query: str) -> list[Specialty]:
    q = _fold(query)
    if not q:
        return list(CATALOG)
    return [s for s in CATALOG
            if q in _fold(s.name_ro) or q in _fold(s.name_en) or q in s.id or any(q in _fold(t) for t in s.terms)]
