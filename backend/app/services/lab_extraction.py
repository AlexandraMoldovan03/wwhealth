"""
Local lab-value extraction — nothing leaves this server, no external AI service.

• Digital PDFs: text layer via pypdf.
• Images and scanned PDFs: OCR with the local Tesseract binary *if installed* (`brew install tesseract
  tesseract-lang`). Without it the API says so (`ocr_available=False`) instead of guessing.

Rules (no guessing): a value is returned only when a line explicitly contains
  <name> <number> and at least a unit or a reference range, e.g. "Hemoglobina 13,5 g/dL 12,0 - 16,0".
Values, units and ranges are copied exactly as written. No interpretation, no diagnosis.
Every OCR value is marked `needs_review` — the user must confirm it before it can be saved.
"""
import io
import re
import shutil
import subprocess
import tempfile
from datetime import date
from pathlib import Path

from PIL import Image, ImageOps

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


DATE_PARTS_RE = re.compile(r"\b(\d{1,2})([./-])(\d{1,2})\2(\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b")
DATE_KEYWORDS = re.compile(
    r"recolt|data\s+(?:buletin|rezultat|analiz|prelev)|prelevat|sample|collect|specimen|data\s*:|date\s*:",
    re.IGNORECASE,
)


def _parse_date(m: re.Match) -> date | None:
    try:
        if m.group(5):
            d = date(int(m.group(5)), int(m.group(6)), int(m.group(7)))
        else:
            d = date(int(m.group(4)), int(m.group(3)), int(m.group(1)))  # RO/EU order: dd.mm.yyyy
    except ValueError:
        return None
    return d if date(1990, 1, 1) <= d <= date.today() else None


def find_document_date(text: str) -> str | None:
    """ISO date of the analyses, only when the document states it unambiguously:
    a date on a line labelled "recoltare / data / collected…", or the single date found in the whole text."""
    labelled: list[date] = []
    all_dates: set[date] = set()
    for line in text.splitlines():
        for m in DATE_PARTS_RE.finditer(line):
            d = _parse_date(m)
            if d is None:
                continue
            all_dates.add(d)
            if DATE_KEYWORDS.search(line):
                labelled.append(d)
    if labelled:
        return labelled[0].isoformat()
    return next(iter(all_dates)).isoformat() if len(all_dates) == 1 else None


# ─────────────────────────────────────────────────────────── OCR (optional, local)

OCR_MAX_PAGES = 10
OCR_TIMEOUT_S = 60


def ocr_available() -> bool:
    return shutil.which("tesseract") is not None


def _ocr_languages() -> str:
    try:
        out = subprocess.run(["tesseract", "--list-langs"], capture_output=True, text=True, timeout=10).stdout
    except (OSError, subprocess.SubprocessError):
        return "eng"
    langs = {line.strip() for line in out.splitlines()[1:]}
    return "+".join(lang for lang in ("ron", "eng") if lang in langs) or "eng"


def ocr_image(content: bytes) -> str:
    """Text of one image (JPEG/PNG bytes) via local Tesseract. Raises ValueError if the image is unreadable."""
    try:
        img = Image.open(io.BytesIO(content))
        img = ImageOps.exif_transpose(img).convert("L")
    except Exception as exc:  # noqa: BLE001 — any decoder error = unreadable image
        raise ValueError("Unreadable image") from exc
    if max(img.size) < 1600:  # small phone crops → upscale helps Tesseract
        scale = 1600 / max(img.size)
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    img = ImageOps.autocontrast(img)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "page.png"
        img.save(path)
        try:
            result = subprocess.run(
                ["tesseract", str(path), "stdout", "-l", _ocr_languages(), "--psm", "6"],
                capture_output=True, text=True, timeout=OCR_TIMEOUT_S,
            )
        except subprocess.TimeoutExpired as exc:
            raise ValueError("OCR timed out") from exc
    return result.stdout


# Tesseract often reads the caret of "10^3/µL" as "1", "%", "°" or "*" ("1013/uL", "10%3/uL") or drops it
# ("106/uL"), which made the whole line unparseable. Only these count-per-volume units are restored; the value
# itself is never touched and every OCR value still needs manual confirmation.
OCR_POWER_UNIT_RE = re.compile(r"(?<![\d.,])10(?:[\^%°*]|1)?(3|6|9|12)\s*/\s*((?:[uµμm]?[lL])\b|mm3\b)")


def fix_ocr_units(text: str) -> str:
    return OCR_POWER_UNIT_RE.sub(lambda m: f"10^{m.group(1)}/{m.group(2)}", text)


def pdf_page_images(content: bytes) -> list[bytes]:
    """Embedded page images of a scanned PDF (one per page usually) — no rasteriser needed."""
    reader = PdfReader(io.BytesIO(content))
    images: list[bytes] = []
    for page in reader.pages[:OCR_MAX_PAGES]:
        try:
            page_images = list(page.images)
        except Exception:  # noqa: BLE001 — unsupported image filter → skip that page
            continue
        if page_images:
            biggest = max(page_images, key=lambda im: len(im.data))
            images.append(biggest.data)
    return images


def extract(content: bytes, mime_type: str) -> dict:
    """Full pipeline → {text_found, page_count, method, ocr_available, document_date, values}."""
    can_ocr = ocr_available()
    text, pages, method = "", 1, "none"
    if mime_type == "application/pdf":
        text, pages = extract_text(content)
        method = "text" if text.strip() else "none"
        if not text.strip() and can_ocr:
            text = "\n".join(ocr_image(img) for img in pdf_page_images(content))
            method = "ocr" if text.strip() else "none"
    elif can_ocr:
        text = ocr_image(content)
        method = "ocr" if text.strip() else "none"
    if method == "ocr":
        text = fix_ocr_units(text)
    values = parse_lab_values(text)
    if method == "ocr":
        for v in values:
            v["needs_review"] = True
    return {
        "text_found": bool(text.strip()),
        "page_count": pages,
        "method": method,
        "ocr_available": can_ocr,
        "document_date": find_document_date(text) if text else None,
        "values": values,
    }


# DEMO store (no Supabase): document_id → confirmed values. Lost on restart.
_demo_values: dict[tuple[str, str], list[dict]] = {}


def demo_get(user_id: str, document_id: str) -> list[dict]:
    return _demo_values.get((user_id, document_id), [])


def demo_save(user_id: str, document_id: str, values: list[dict]) -> list[dict]:
    if values:
        _demo_values[(user_id, document_id)] = values
    else:
        _demo_values.pop((user_id, document_id), None)
    return values


def demo_list(user_id: str) -> list[dict]:
    return [
        {**v, "document_id": doc_id}
        for (uid, doc_id), values in _demo_values.items() if uid == user_id
        for v in values
    ]


def extract_pages(content: bytes) -> tuple[list[str], int]:
    """([text of each page], page_count) — first MAX_PAGES pages. Raises ValueError for unreadable / encrypted PDFs."""
    try:
        reader = PdfReader(io.BytesIO(content))
        if reader.is_encrypted:
            raise ValueError("Encrypted PDF")
        return [(p.extract_text() or "") for p in reader.pages[:MAX_PAGES]], len(reader.pages)
    except PdfReadError as exc:
        raise ValueError("Unreadable PDF") from exc


def extract_text(content: bytes) -> tuple[str, int]:
    """(text, page_count). Raises ValueError for unreadable / encrypted PDFs."""
    pages, count = extract_pages(content)
    return "\n".join(pages), count


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
                       "reference_range": ref, "source_line": line,
                       # no unit (only a range) → less explicit → the user must confirm it
                       "needs_review": unit is None})
        if len(values) >= MAX_VALUES:
            break
    return values
