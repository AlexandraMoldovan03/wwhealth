"""
Explicit clinical prioritisation rules (no AI, no network). Used by the Emergency Passport and document summaries.

Rules only CLASSIFY data that is already documented; they never create a diagnosis. Critical lab thresholds are
applied only when the unit is one we know for that analyte (no unit conversion, no guessing).
"""
import re
import unicodedata

from app.schemas.emergency_passport import LabStatus


def fold(text: str | None) -> str:
    stripped = "".join(c for c in unicodedata.normalize("NFD", text or "") if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9%./^ ]", " ", stripped.lower()).split())


def _any(text: str, words: tuple[str, ...]) -> bool:
    return any(re.search(rf"(?<![a-z]){re.escape(w)}", text) for w in words)


# ─────────────────────────────────────────────────────────── medication with emergency-relevant risk
HIGH_RISK_MEDS: dict[str, tuple[str, ...]] = {
    "anticoagulant": ("warfarin", "acenocumarol", "sintrom", "trombostop", "apixaban", "eliquis", "rivaroxaban",
                      "xarelto", "dabigatran", "pradaxa", "edoxaban", "lixiana", "heparin", "enoxaparin", "clexane",
                      "fraxiparin", "nadroparin", "fondaparinux", "arixtra"),
    "antiplatelet": ("clopidogrel", "plavix", "ticagrelor", "brilique", "prasugrel", "efient", "acid acetilsalicilic",
                     "aspenter", "aspirin", "aspirina"),
    "insulin": ("insulin", "lantus", "toujeo", "levemir", "tresiba", "novorapid", "humalog", "apidra", "actrapid",
                "humulin", "mixtard", "fiasp"),
    "hypoglycemic": ("gliclazid", "diaprel", "glimepirid", "amaryl", "glibenclamid", "glipizid"),
    "opioid": ("morfin", "morphin", "fentanyl", "oxicodon", "oxycodon", "tramadol", "metadon", "methadon",
               "buprenorfin", "buprenorphin"),
    "antiepileptic": ("levetiracetam", "keppra", "valproat", "depakin", "carbamazepin", "tegretol", "lamotrigin",
                      "fenitoin", "phenytoin", "lacosamid", "topiramat"),
    "corticosteroid": ("prednison", "prednisolon", "metilprednisolon", "methylprednisolon", "medrol",
                       "hidrocortizon", "hydrocortison", "dexametazon", "dexamethason"),
    "immunosuppressant": ("tacrolimus", "ciclosporin", "cyclosporin", "micofenolat", "mycophenol", "azatioprin",
                          "azathioprin", "metotrexat", "methotrexat"),
    "cardiac_drug": ("digoxin", "amiodaron"),
    "lithium": ("litiu", "lithium"),
}

# ─────────────────────────────────────────────────────────── conditions that change emergency treatment
EMERGENCY_CONDITIONS: tuple[str, ...] = (
    "diabet", "diabetes", "epilep", "convulsi", "insuficienta cardiaca", "heart failure", "fibrilatie", "atrial fibrill",
    "aritmi", "arrhythm", "pacemaker", "stimulator cardiac", "defibrilator", "infarct", "myocardial infarction",
    "angina", "cardiopatie ischemica", "coronar", "astm", "asthma", "bpoc", "copd", "insuficienta renala",
    "boala cronica de rinichi", "kidney disease", "renal failure", "hemofil", "hemophil", "coagulopat", "tromboz",
    "thrombos", "embolie", "embolism", "accident vascular", "avc", "stroke", "sarcin", "pregnan", "transplant",
    "insuficienta suprarenal", "adrenal insufficiency", "addison", "miastenie", "myasthenia", "ciroz", "cirrhosis",
    "cancer", "neoplasm", "chimioterap", "chemotherap", "hiv", "dializ", "dialysis",
)

ANAPHYLAXIS = ("anafila", "anaphyla", "soc anafilactic", "edem glotic", "angioedem", "quincke", "anaphylactic")
DRUG_ALLERGENS = ("penicil", "amoxicil", "cefalospor", "sulfamid", "aspirin", "ains", "nsaid", "ibuprofen",
                  "anestez", "anesthe", "latex", "iod", "contrast", "morfin", "codein", "metamizol", "algocalmin")


def medication_flags(name: str) -> list[str]:
    text = fold(name)
    return [flag for flag, words in HIGH_RISK_MEDS.items() if _any(text, words)]


def is_emergency_condition(name: str) -> bool:
    return _any(fold(name), EMERGENCY_CONDITIONS)


def allergy_flags(substance: str, reaction: str | None, severity: str | None) -> list[str]:
    flags: list[str] = []
    if _any(fold(reaction), ANAPHYLAXIS):
        flags.append("anaphylaxis")
    if severity == "severe" or flags:
        flags.insert(0, "severe_allergy")
    if _any(fold(substance), DRUG_ALLERGENS):
        flags.append("drug_allergy")
    return flags


# ─────────────────────────────────────────────────────────── lab values
NUM_RE = re.compile(r"-?\d+(?:[.,]\d+)?")


def parse_number(raw: str | None) -> float | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if not NUM_RE.fullmatch(text.lstrip("<>≤≥= ").replace(" ", "")):
        return None
    return float(text.lstrip("<>≤≥= ").replace(" ", "").replace(",", "."))


def parse_range(raw: str | None) -> tuple[float | None, float | None] | None:
    """'3.5 - 5.1', '3,5-5,1', '< 5', '>= 60', '≤ 200' → (low, high). None when it cannot be read."""
    text = (raw or "").replace(",", ".").replace("–", "-").replace("—", "-").strip()
    if not text:
        return None
    m = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*", text)
    if m:
        low, high = float(m.group(1)), float(m.group(2))
        return (low, high) if low <= high else None
    m = re.fullmatch(r"\s*(<=?|≤)\s*(-?\d+(?:\.\d+)?)\s*", text)
    if m:
        return (None, float(m.group(2)))
    m = re.fullmatch(r"\s*(>=?|≥)\s*(-?\d+(?:\.\d+)?)\s*", text)
    if m:
        return (float(m.group(2)), None)
    return None


def lab_status(value: str | None, reference_range: str | None) -> LabStatus:
    number, bounds = parse_number(value), parse_range(reference_range)
    if number is None or bounds is None:
        return "unknown"
    low, high = bounds
    if low is not None and number < low:
        return "low"
    if high is not None and number > high:
        return "high"
    return "normal"


def _unit(text: str | None) -> str:
    return fold(text).replace(" ", "").replace("µ", "u").replace("μ", "u")


# analyte aliases → [(units, critical_low, critical_high)]; None = no bound on that side.
_K = ("mmol/l", "meq/l")
CRITICAL_LABS: tuple[tuple[tuple[str, ...], list[tuple[tuple[str, ...], float | None, float | None]]], ...] = (
    (("potasiu", "potassium", "kaliu", "k+", "k"), [(_K, 3.0, 6.0)]),
    (("sodiu", "sodium", "natriu", "na+", "na"), [(_K, 125, 155)]),
    (("glucoza", "glucose", "glicemie", "glicemia", "glycemia"), [(("mg/dl",), 54, 400), (("mmol/l",), 3.0, 22.0)]),
    (("hemoglobina", "hemoglobin", "haemoglobin", "hgb", "hb"), [(("g/dl",), 7.0, 20.0), (("g/l",), 70, 200)]),
    (("trombocite", "platelets", "plt", "numar trombocite"),
     [(("10^3/ul", "x10^3/ul", "10^9/l", "x10^9/l", "mii/ul", "10^3/mm3", "/mm3"), 50, 1000)]),
    (("leucocite", "wbc", "white blood cells", "numar leucocite"),
     [(("10^3/ul", "x10^3/ul", "10^9/l", "x10^9/l", "mii/ul", "10^3/mm3"), 2.0, 30.0)]),
    (("inr",), [(("",), None, 4.5)]),
    (("creatinina", "creatinine", "creatinina serica"), [(("mg/dl",), None, 4.0), (("umol/l",), None, 354)]),
    (("calciu", "calcium", "calciu seric", "calciu total"), [(("mg/dl",), 6.5, 13.0), (("mmol/l",), 1.6, 3.25)]),
)
ALWAYS_CRITICAL_IF_HIGH = ("troponin", "troponina")


def is_critical_lab(name: str, value: str | None, unit: str | None, reference_range: str | None) -> bool:
    key, number, u = fold(name), parse_number(value), _unit(unit)
    if number is None:
        return False
    if _any(key, ALWAYS_CRITICAL_IF_HIGH):
        return lab_status(value, reference_range) == "high"
    for aliases, rules in CRITICAL_LABS:
        if key in aliases or any(key.startswith(a + " ") for a in aliases if len(a) > 2):
            for units, low, high in rules:
                if u in units:
                    return (low is not None and number < low) or (high is not None and number > high)
    return False
