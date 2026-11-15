"""
Prioritised Emergency Passport + per-document summary — pure functions over data the caller may already read.

One builder for every view (doctor QR, guardian, patient preview), so the profile, document facts, lab values and
the passport never diverge:
  • profile (entered / confirmed by the patient)           → confirmed
  • document facts (confirmed import; certainty preserved)  → suspected / not in profile → "needs confirmation"
  • lab values (confirmed by the patient, with source)      → classified against their own reference range
Sources disagreeing → `conflict` with every value kept; no value is chosen. Nothing here creates a diagnosis.
"""
from collections.abc import Iterable

from app.schemas.emergency_passport import (
    DocumentSummary,
    LabPoint,
    LabReading,
    PassportItem,
    PassportSource,
    PrioritizedPassport,
)
from app.services import clinical_rules as rules

ACTIVE_CERTAINTY = ("confirmed", None, "")
MAX_PREVIOUS = 3


def _s(value: object) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def _date(value: object) -> str | None:
    text = _s(value)
    return text[:10] if text else None


def _key(kind: str, label: str) -> str:
    folded = rules.fold(label)
    if kind in ("medication", "allergy"):  # "Warfarină 5 mg" ≈ "warfarina" ≈ "warfarin"
        folded = (folded.split(" ") or [""])[0][:7]
    return f"{kind}:{folded}"


def _profile_source() -> PassportSource:
    return PassportSource(kind="profile")


def _fact_source(f: dict) -> PassportSource:
    return PassportSource(kind="document", document_id=_s(f.get("document_id")), document_title=_s(f.get("document_title")),
                          date=_date(f.get("event_date")), page=f.get("source_page"),
                          excerpt=(_s(f.get("source_excerpt")) or "")[:300] or None)


class _Collector:
    def __init__(self) -> None:
        self.items: dict[str, PassportItem] = {}
        self.values: dict[str, dict[str, str]] = {}   # key → {source label: value} for conflict detection

    def add(self, item: PassportItem, compare: str | None = None, source_label: str = "profil") -> PassportItem:
        existing = self.items.get(item.key)
        if existing is None:
            self.items[item.key] = item
            existing = item
        else:
            existing.sources.extend(s for s in item.sources if s not in existing.sources)
            existing.flags = list(dict.fromkeys([*existing.flags, *item.flags]))
            existing.confirmed = existing.confirmed or item.confirmed
            existing.severity = existing.severity or item.severity
            existing.detail = existing.detail or item.detail
        if compare:
            seen = self.values.setdefault(item.key, {})
            seen.setdefault(source_label, compare)
            distinct = list(dict.fromkeys(rules.fold(v) for v in seen.values()))
            if len(distinct) > 1:
                existing.conflict = True
                existing.conflict_values = [f"{v} ({k})" for k, v in seen.items()][:6]
        return existing


def _src_label(f: dict) -> str:
    return " · ".join(x for x in (_s(f.get("document_title")) or "document", _date(f.get("event_date"))) if x)


# ─────────────────────────────────────────────────────────── labs

def _lab_groups(labs: Iterable[dict]) -> list[PassportItem]:
    groups: dict[tuple[str, str], list[dict]] = {}
    for row in labs or []:
        if not _s(row.get("name")) or not _s(row.get("value")):
            continue
        groups.setdefault((rules.fold(row["name"]), rules.fold(row.get("unit"))), []).append(row)
    out = []
    for (name_key, unit_key), rows in groups.items():
        rows.sort(key=lambda r: _date(r.get("measured_at") or r.get("document_date")) or "", reverse=True)
        last_date = _date(rows[0].get("measured_at") or rows[0].get("document_date"))
        today = [r for r in rows if _date(r.get("measured_at") or r.get("document_date")) == last_date]
        same_day = {str(r["value"]).strip() for r in today}
        # Same-day disagreement: no value is chosen as "true"; the most severe one decides placement so it is never hidden.
        last = max(today, key=lambda r: (rules.is_critical_lab(r["name"], r["value"], r.get("unit"), r.get("reference_range")),
                                         rules.lab_status(r["value"], r.get("reference_range")) in ("low", "high")))
        rows = [last, *[r for r in rows if r is not last and r not in today]]
        status = rules.lab_status(last["value"], last.get("reference_range"))
        critical = rules.is_critical_lab(last["name"], last["value"], last.get("unit"), last.get("reference_range"))
        previous = [LabPoint(value=str(r["value"]), date=_date(r.get("measured_at") or r.get("document_date")))
                    for r in rows[1:1 + MAX_PREVIOUS]]
        item = PassportItem(
            key=f"lab:{name_key}:{unit_key}", kind="lab", label=str(last["name"])[:200],
            flags=["critical_lab"] if critical else ["abnormal_lab"] if status in ("low", "high") else [],
            lab=LabReading(value=str(last["value"]), unit=_s(last.get("unit")), reference_range=_s(last.get("reference_range")),
                           status=status, critical=critical, date=last_date, previous=previous),
            sources=[PassportSource(kind="lab", document_id=_s(last.get("document_id")),
                                    document_title=_s(last.get("document_title")), date=last_date)],
        )
        if len(same_day) > 1:  # two documents, same day, different values → keep both, choose none
            item.conflict = True
            item.conflict_values = sorted(same_day)[:6]
        out.append(item)
    return sorted(out, key=lambda i: i.label.lower())


# ─────────────────────────────────────────────────────────── passport

def build_passport(profile: dict | None, facts: Iterable[dict] | None = None, labs: Iterable[dict] | None = None) -> PrioritizedPassport:
    profile = profile or {}
    c = _Collector()

    for a in profile.get("allergies") or []:
        if not isinstance(a, dict) or not _s(a.get("substance")):
            continue
        sev = a.get("severity") if a.get("severity") in ("mild", "moderate", "severe") else None
        c.add(PassportItem(key=_key("allergy", a["substance"]), kind="allergy", label=a["substance"][:200],
                           detail=_s(a.get("reaction")), severity=sev,
                           flags=rules.allergy_flags(a["substance"], a.get("reaction"), sev), sources=[_profile_source()]),
              compare=sev)

    for d in profile.get("conditions") or []:
        if not isinstance(d, dict) or not _s(d.get("name")):
            continue
        active = d.get("status", "active") != "resolved"
        kind = "condition" if active else "history"
        c.add(PassportItem(key=_key("condition", d["name"]), kind=kind, label=d["name"][:200],
                           detail=_s(d.get("icd10")), status="active" if active else "resolved",
                           flags=["emergency_condition"] if active and rules.is_emergency_condition(d["name"]) else [],
                           sources=[_profile_source()]),
              compare="activ" if active else "rezolvat")

    for m in profile.get("medications") or []:
        if not isinstance(m, dict) or not _s(m.get("name")) or m.get("active", True) is False:
            continue
        dose = " · ".join(x for x in (_s(m.get("dosage")), _s(m.get("frequency"))) if x) or None
        c.add(PassportItem(key=_key("medication", m["name"]), kind="medication", label=m["name"][:200], detail=dose,
                           status="active", flags=rules.medication_flags(m["name"]), sources=[_profile_source()]),
              compare=_s(m.get("dosage")))

    for s in profile.get("surgeries") or []:
        if isinstance(s, dict) and _s(s.get("name")):
            c.add(PassportItem(key=_key("procedure", s["name"]), kind="procedure", label=s["name"][:200],
                               detail=_s(s.get("date")), sources=[_profile_source()]))

    for f in facts or []:
        label, kind, status = _s(f.get("label")), f.get("kind"), _s(f.get("status"))
        if not label or status == "ruled_out":
            continue
        src, value = _fact_source(f), f.get("value") if isinstance(f.get("value"), dict) else {}
        if kind == "allergy":
            sev = value.get("severity") if value.get("severity") in ("mild", "moderate", "severe") else None
            key = _key("allergy", label)
            in_profile = key in c.items
            c.add(PassportItem(key=key, kind="allergy", label=label[:200], detail=_s(f.get("detail")), severity=sev,
                               flags=rules.allergy_flags(label, f.get("detail"), sev), confirmed=in_profile, sources=[src]),
                  compare=sev, source_label=_src_label(f))
        elif kind == "diagnosis":
            key = _key("condition", label)
            if status == "history":
                c.add(PassportItem(key=key, kind="history", label=label[:200], status="history", sources=[src]))
                continue
            suspected = status == "suspected"
            existing = c.items.get(key)
            item = PassportItem(key=key, kind="condition", label=label[:200], status=status or "confirmed",
                                flags=["suspected"] if suspected else
                                (["emergency_condition"] if rules.is_emergency_condition(label) else []),
                                confirmed=not suspected and existing is not None, sources=[src])
            # profile "resolved" vs document "confirmed" → conflict (both kept)
            c.add(item, compare=None if suspected else "activ", source_label=_src_label(f))
            if existing is not None and existing.kind == "history" and not suspected:
                existing.conflict = True
        elif kind == "medication":
            key = _key("medication", label)
            flags = rules.medication_flags(label)
            if key in c.items:  # active in profile: add the source; a different documented dose is a conflict
                c.add(PassportItem(key=key, kind="medication", label=label[:200], sources=[src]),
                      compare=_s(value.get("dosage")) or None, source_label=_src_label(f))
            elif flags:  # historical high-risk medication not in the profile → warn, unconfirmed
                c.add(PassportItem(key=key, kind="medication", label=label[:200], detail=_s(f.get("detail")),
                                   status=status, flags=[*flags, "historical_medication"], confirmed=False, sources=[src]))
        elif kind == "procedure":
            c.add(PassportItem(key=_key("procedure", label), kind="procedure", label=label[:200],
                               detail=_date(f.get("event_date")), sources=[src]))

    critical, essential = [], []
    for item in c.items.values():
        if item.kind == "allergy":
            critical.append(item)
        elif item.kind == "condition" and "emergency_condition" in item.flags and "suspected" not in item.flags:
            critical.append(item)
        elif item.kind == "medication" and any(f in rules.HIGH_RISK_MEDS for f in item.flags):
            critical.append(item)
        else:
            essential.append(item)

    if _s(profile.get("blood_type")):
        essential.insert(0, PassportItem(key="blood_type", kind="blood_type", label=str(profile["blood_type"]),
                                         sources=[_profile_source()]))

    investigations, normal = [], []
    for lab in _lab_groups(labs or []):
        (critical if lab.lab and lab.lab.critical else investigations if lab.lab and lab.lab.status in ("low", "high")
         else normal).append(lab)

    order = {"allergy": 0, "condition": 1, "medication": 2, "lab": 3}
    critical.sort(key=lambda i: (order.get(i.kind, 9), i.severity != "severe", i.label.lower()))
    order2 = {"blood_type": 0, "medication": 1, "condition": 2, "history": 3, "procedure": 4}
    essential.sort(key=lambda i: (order2.get(i.kind, 9), i.label.lower()))
    everything = [*critical, *essential, *investigations, *normal]
    return PrioritizedPassport(
        allergies_status="known" if any(i.kind == "allergy" for i in critical) else "unknown",
        critical=critical, essential=essential, investigations=investigations, normal_labs=normal,
        conflicts=sum(i.conflict for i in everything), unconfirmed=sum(not i.confirmed for i in everything),
    )


def profile_dict(record) -> dict:
    """PatientRecord → the same shape the emergency RPC returns."""
    if record is None:
        return {}
    return {
        "blood_type": record.blood_type,
        "allergies": [a.model_dump() for a in record.allergies],
        "conditions": [d.model_dump() for d in record.diagnoses],
        "medications": [t.model_dump() for t in record.treatments],
        "surgeries": [s.model_dump() for s in record.surgeries],
    }


# ─────────────────────────────────────────────────────────── per-document summary

def build_document_summary(document_id: str, document_type: str, date: str | None,
                           facts: Iterable[dict] | None, labs: Iterable[dict] | None) -> DocumentSummary:
    facts = [f for f in facts or [] if _s(f.get("label"))]
    summary = DocumentSummary(document_id=document_id, document_type=document_type, date=_date(date))
    seen: set[str] = set()

    def once(item: PassportItem) -> bool:
        if item.key in seen:
            return False
        seen.add(item.key)
        return True

    for f in facts:
        kind, status, label, src = f.get("kind"), _s(f.get("status")), str(f["label"])[:200], _fact_source(f)
        value = f.get("value") if isinstance(f.get("value"), dict) else {}
        if kind == "diagnosis":
            if status == "ruled_out":
                continue
            item = PassportItem(key=_key("condition", label), kind="condition" if status != "history" else "history",
                                label=label, status=status or "confirmed", sources=[src],
                                flags=["suspected"] if status == "suspected" else
                                (["emergency_condition"] if rules.is_emergency_condition(label) else []),
                                confirmed=status != "suspected")
            if once(item):
                summary.diagnoses.append(item)
                if "emergency_condition" in item.flags and item.kind == "condition":
                    summary.emergency_relevant.append(item)
        elif kind == "medication":
            dose = " · ".join(x for x in (_s(value.get("dosage")), _s(value.get("frequency"))) if x) or _s(f.get("detail"))
            item = PassportItem(key=_key("medication", label), kind="medication", label=label, detail=dose,
                                status=status, flags=rules.medication_flags(label), sources=[src])
            if once(item):
                summary.treatment.append(item)
                if item.flags:
                    summary.emergency_relevant.append(item)
        elif kind in ("recommendation", "follow_up"):
            item = PassportItem(key=_key("recommendation", label), kind="recommendation", label=label,
                                detail=_s(f.get("detail")), sources=[src])
            if once(item):
                summary.treatment.append(item)
        elif kind == "allergy":
            sev = value.get("severity") if value.get("severity") in ("mild", "moderate", "severe") else None
            item = PassportItem(key=_key("allergy", label), kind="allergy", label=label, detail=_s(f.get("detail")),
                                severity=sev, flags=rules.allergy_flags(label, f.get("detail"), sev), sources=[src])
            if once(item):
                summary.findings.append(item)
                summary.emergency_relevant.append(item)
        elif kind in ("symptom", "investigation", "procedure", "reason", "vaccination"):
            item = PassportItem(key=_key("finding", label), kind="procedure" if kind == "procedure" else "finding",
                                label=label, detail=_s(f.get("detail")), status=kind, sources=[src])
            if once(item):
                summary.findings.append(item)

    for lab in _lab_groups(labs or []):
        if lab.lab and lab.lab.status in ("low", "high"):
            summary.abnormal_labs.append(lab)
            if lab.lab.critical:
                summary.emergency_relevant.append(lab)
        else:
            summary.normal_labs_count += 1
    summary.abnormal_labs.sort(key=lambda i: (not (i.lab and i.lab.critical), i.label.lower()))
    summary.needs_confirmation = sum(not i.confirmed for i in (*summary.diagnoses, *summary.treatment, *summary.findings))
    return summary
