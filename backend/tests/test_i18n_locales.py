"""App translations (frontend/i18n): RO and EN have the same keys and placeholders, and every literal t('key') exists."""
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ROOT / "frontend" / "i18n" / "locales"
PLURAL = re.compile(r"_(zero|one|two|few|many|other)$")
VAR = re.compile(r"{{\s*(\w+)\s*}}")


def _flat(d: dict, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        out.update(_flat(v, key) if isinstance(v, dict) else {key: v})
    return out


def _load(lang: str) -> dict[str, str]:
    return _flat(json.loads((LOCALES / f"{lang}.json").read_text(encoding="utf-8")))


EN, RO = _load("en"), _load("ro")


def _base(keys) -> set[str]:
    return {PLURAL.sub("", k) for k in keys}


def test_same_keys_in_both_languages():
    assert sorted(_base(EN) - _base(RO)) == [] and sorted(_base(RO) - _base(EN)) == []


def test_no_empty_values():
    assert [k for k, v in {**EN, **RO}.items() if not str(v).strip()] == []


def test_same_placeholders():
    def variables(table: dict[str, str]) -> dict[str, set[str]]:
        out: dict[str, set[str]] = {}
        for k, v in table.items():
            out.setdefault(PLURAL.sub("", k), set()).update(VAR.findall(str(v)))
        return out
    en, ro = variables(EN), variables(RO)
    assert {k: (en[k], ro[k]) for k in en if k in ro and en[k] != ro[k]} == {}


def _sources():
    for folder in ("frontend", "app"):
        for path in (ROOT / folder).rglob("*.ts*"):
            if "node_modules" not in path.parts and path.suffix in (".ts", ".tsx"):
                yield path


@pytest.mark.parametrize("lang", ["en", "ro"])
def test_every_literal_key_exists(lang):
    table = _base(_load(lang))
    used = set()
    call = re.compile(r"""\bt\(\s*['"]([a-zA-Z][\w./\[\]-]*)['"]""")
    for path in _sources():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.lstrip().startswith(("*", "//", "/*")):
                continue  # doc examples
            # keys ending in "." are prefixes completed at runtime (t('enums.severity.' + value))
            used.update(m for m in call.findall(line) if "." in m and not m.endswith("."))
    missing = sorted(k for k in used if k not in table and not any(t.startswith(k + ".") for t in table))
    assert missing == []
