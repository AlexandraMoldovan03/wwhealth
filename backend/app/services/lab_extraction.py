"""
Local lab-value extraction from DIGITAL PDFs (text layer only, pypdf — nothing leaves the server).

Rules (no guessing): a value is returned only when a line explicitly contains
  <name> <number> and at least a unit or a reference range, e.g. "Hemoglobina 13,5 g/dL 12,0 - 16,0".
Values, units and ranges are copied exactly as written. No flags, no interpretation, no diagnosis.
Scanned PDFs / images have no text layer → `text_found=False` (OCR is not available).
"""
import io
import re

from pypdf import PdfReader
from pypdf.errors import PdfReadError

MAX_PAGES = 30
MAX_VALUES = 200

NUM = r"\d+(?:[.,]\d+)?"
LINE_RE = re.compile(
    rf"""^\s*
    (?P<name>[^\W\d_][^\d:]{{1,60}}?)\s*[:=]?\s+
    (?P<value>[<>≤≥]?\s?{NUM})
    (?:\s+(?P<unit>%|10\^\d+/\S+|[^\s\d\[\(<>≤≥][^\s\[\(]*))?
    (?:\s*[\[(]?\s*(?P<range>(?:{NUM}\s*[-–]\s*{NUM})|(?:[<>≤≥]\s?{NUM}))\s*[\])]?)?
    \s*$""",
    re.VERBOSE,
)
KNOWN_UNITS = {
    "g", "mg", "µg", "μg", "ug", "ng", "pg", "fl", "u", "ui", "iu", "mui", "mu", "ku", "mmol", "µmol", "μmol",
    "meq", "sec", "s", "mm", "cm", "kg", "ratio", "x", "mmhg",
}


def _looks_like_unit(unit: str) -> bool:
    u = unit.lower().rstrip(".,")
    return any(ch in u for ch in "/%^µμ") or u in KNOWN_UNITS


DATE_RE = re.compile(r"\b\d{1,2}([./-])\d{1,2}\1\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b")


# DEMO store (no Supabase): document_id → confirmed values. Lost on restart.
_demo_values: dict[tuple[str, str], list[dict]] = {}


def demo_get(user_id: str, document_id: str) -> list[dict]:
    return _demo_values.get((user_id, document_id), [])


def demo_save(user_id: str, document_id: str, values: list[dict]) -> list[dict]:
    _demo_values[(user_id, document_id)] = values
    return values


def extract_text(content: bytes) -> tuple[str, int]:
    """(text, page_count). Raises ValueError for unreadable / encrypted PDFs."""
    try:
        reader = PdfReader(io.BytesIO(content))
        if reader.is_encrypted:
            raise ValueError("Encrypted PDF")
        pages = reader.pages[:MAX_PAGES]
        return "\n".join((p.extract_text() or "") for p in pages), len(reader.pages)
    except PdfReadError as exc:
        raise ValueError("Unreadable PDF") from exc


def parse_lab_values(text: str) -> list[dict]:
    values: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for raw in text.splitlines():
        line = " ".join(raw.split())
        if len(line) < 4 or len(line) > 160 or DATE_RE.search(line):
            continue
        m = LINE_RE.match(line)
        if not m:
            continue
        name = m.group("name").strip(" .-")
        unit = (m.group("unit") or "").strip() or None
        ref = (m.group("range") or "").strip() or None
        if unit is not None and not _looks_like_unit(unit):
            if ref is None:
                continue  # "Varsta 45 ani", "Pagina 1 din 2" → not a lab value
            unit = None
        if sum(ch.isalpha() for ch in name) < 2 or (unit is None and ref is None):
            continue  # not explicit enough → skipped, never guessed
        key = (name.lower(), m.group("value"))
        if key in seen:
            continue
        seen.add(key)
        values.append({"name": name, "value": m.group("value").replace(" ", ""), "unit": unit,
                       "reference_range": ref, "source_line": line})
        if len(values) >= MAX_VALUES:
            break
    return values
