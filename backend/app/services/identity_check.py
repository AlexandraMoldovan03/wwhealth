"""
Smart Import — patient identity check. A document is integrated automatically only when it CLEARLY belongs to the
signed-in patient: the same name alone is never enough (a second identifier — date of birth — must match).

  match         name and date of birth match the profile
  unverified    only the name matches (or the profile lacks a date of birth) → explicit confirmation required
  insufficient  no usable identifier in the document (missing / placeholders like [Name], John Doe, MM/DD/YYYY)
  mismatch      a written identifier differs from the profile → strong warning, explicit confirmation required
  demo          synthetic / demo document → only accepted in demo contexts, flagged and kept apart from real data
"""
import re

from app.schemas.smart_import import IdentityCheck
from app.services.document_intelligence import fold, is_placeholder

PLACEHOLDER_NAMES = {"john doe", "jane doe", "ion popescu", "maria popescu", "nume prenume", "patient name", "name",
                     "test test", "pacient test"}


def _tokens(name: str | None) -> set[str]:
    return {t for t in fold(name).replace(",", " ").split() if len(t) >= 2 and not re.fullmatch(r"(mr|mrs|ms|dr|d|dna)\.?", t)}


def _name_status(doc_name: str | None, profile_name: str | None) -> str:
    """same / different / unknown."""
    if not doc_name or not profile_name or is_placeholder(doc_name):
        return "unknown"
    a, b = _tokens(doc_name), _tokens(profile_name)
    if not a or not b:
        return "unknown"
    common = a & b
    if len(common) >= 2 or (common and (len(a) == 1 or len(b) == 1)):
        return "same"
    return "different"


def check(document: dict, profile: dict, *, synthetic: bool = False) -> IdentityCheck:
    """document: {name, birth_date, sex}; profile: {full_name, date_of_birth, sex}."""
    name = document.get("name")
    dob = document.get("birth_date")
    sex = document.get("sex")
    reasons: list[str] = []
    placeholder = bool(name and (is_placeholder(name) or fold(name) in PLACEHOLDER_NAMES)) or bool(document.get("name_placeholder"))
    if placeholder:
        reasons.append("placeholder_identity")
    if document.get("birth_placeholder"):
        reasons.append("placeholder_birth_date")

    base = {"document_name": None if placeholder else name, "document_birth_date": dob}
    if synthetic:
        return IdentityCheck(status="demo", reasons=["synthetic_document", *reasons], requires_confirmation=True, **base)

    name_state = "unknown" if placeholder else _name_status(name, profile.get("full_name"))
    profile_dob = (profile.get("date_of_birth") or "")[:10] or None
    dob_state = "unknown" if not dob or not profile_dob else ("same" if dob == profile_dob else "different")
    sex_state = "unknown" if not sex or not profile.get("sex") or profile.get("sex") == "other" else (
        "same" if sex == profile.get("sex") else "different")

    for label, state in (("name", name_state), ("dob", dob_state), ("sex", sex_state)):
        if state != "unknown":
            reasons.append(f"{label}_{'match' if state == 'same' else 'mismatch'}")
    if not profile_dob:
        reasons.append("profile_missing_birth_date")

    if "different" in (name_state, dob_state, sex_state):
        return IdentityCheck(status="mismatch", reasons=reasons, requires_confirmation=True, **base)
    if name_state == "same" and dob_state == "same":
        return IdentityCheck(status="match", reasons=reasons, requires_confirmation=False, **base)
    if name_state == "same" or dob_state == "same":
        return IdentityCheck(status="unverified", reasons=reasons, requires_confirmation=True, **base)
    return IdentityCheck(status="insufficient", reasons=[*reasons, "no_identifiers"] if not reasons else reasons,
                         requires_confirmation=True, **base)
