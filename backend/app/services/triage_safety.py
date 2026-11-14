"""
Emergency red flags — explicit rules, independent of Gemini (they run even when the AI is off or fails).

Text is accent-folded and lower-cased; a red flag preceded by a negation ("nu am durere in piept", "no chest pain")
does not count. call_112 = call the emergency number now; urgent = seek urgent care today.
"""
import re

from app.services.specialty_catalog import _fold

_NEG = r"(?<!\bnu am )(?<!\bnu are )(?<!\bfara )(?<!\bno )(?<!\bnot )(?<!\bwithout )(?<!\bdenies )"

RULES: tuple[tuple[str, str, str], ...] = (
    # code, level, pattern (on folded text)
    ("chest_pain", "call_112", r"(durere|dureri|apasare|presiune|strangere|junghi)\w* (puternic\w* )?(in|de|la) (piept|torace)|chest (pain|pressure|tightness)|pain in (my|the) chest"),
    ("breathing", "call_112", r"nu (mai )?pot (sa )?respir|(sufoc|insufic)\w*|respir\w* (foarte )?(greu|cu greu)|lipsa de aer (severa|brusca)|can'?t breathe|cannot breathe|struggling to breathe|severe shortness of breath|choking"),
    ("stroke", "call_112", r"(gura|fata) (stramb|cazut)\w*|vorbesc (greu|incurcat)|nu pot vorbi|(amortea|paraliz|slabiciune)\w* (brusc\w* )?(pe )?(o parte|jumatate|partea (stanga|dreapta))|face (drooping|droop)|slurred speech|(weakness|numbness) (on|in) one side|sudden (confusion|weakness)"),
    ("unconscious", "call_112", r"(lesin|lesinat|lesina|inconstien|pierd\w* (cunostinta|constienta))|(fainted|passed out|unconscious|loss of consciousness)"),
    ("seizure", "call_112", r"(convulsi|criza (de )?epilep)\w*|(seizure|convulsion)"),
    ("bleeding", "call_112", r"(sangerare|sangereaza|hemoragi)\w* (abundent|masiv|puternic|care nu se opreste)\w*|(vars|vomit)\w* (cu )?sange|(heavy|severe|uncontrolled) bleeding|vomiting blood|coughing up blood|tusesc (cu )?sange"),
    ("anaphylaxis", "call_112", r"(umfla)\w* (a |la )?(gatul|gat|limba|buzele|fata)\w*|(swelling|swollen) (of )?(the )?(throat|tongue|lips|face)|anaphyla\w*|soc anafilactic"),
    ("suicidal", "call_112", r"(vreau sa (mor|ma sinucid)|ma gandesc sa ma (omor|sinucid)|sinucid\w*|suicid\w*)|(want to die|kill myself|suicidal|end my life)"),
    ("meningitis", "urgent", r"(gat\w*|ceafa) (intepenit|rigid)\w*.*febr|febr\w*.*(gat\w*|ceafa) (intepenit|rigid)\w*|stiff neck.*fever|fever.*stiff neck"),
    ("severe_abdominal", "urgent", r"durere (abdominala|de burta|in burta) (foarte )?(puternica|insuportabila|severa)|(severe|unbearable) (abdominal|stomach) pain"),
    ("pregnancy_bleeding", "urgent", r"(insarcinata|sarcina).*(sanger|sange)|pregnan\w*.*bleed"),
    ("high_fever", "urgent", r"febr\w* (de )?(peste )?(40|41|42)|fever (of |above |over )?(40|104|105)"),
)

_COMPILED = [(code, level, re.compile(_NEG + "(?:" + pattern + ")")) for code, level, pattern in RULES]


def detect(text: str) -> tuple[str | None, list[str]]:
    """→ (level, codes). level is the highest found: call_112 > urgent > None."""
    folded = " ".join(_fold(text).split())
    codes = [code for code, _, rx in _COMPILED if rx.search(folded)]
    if not codes:
        return None, []
    levels = {level for code, level, _ in RULES if code in codes}
    return ("call_112" if "call_112" in levels else "urgent"), codes
