"""Paired synthetic evaluation for Smart Import. Run from backend with PYTHONPATH=."""
import argparse
import json
import math
import re
import time
from collections import Counter
from pathlib import Path

from app.core.config import settings
from app.schemas.smart_import import GeminiDocument
from app.services import document_intelligence as di, gemini_client, medical_ner

# Each tuple specifies the truth explicitly. All notes describe fictitious encounters.
CASES = (
    ("consultation", "2021-03-15", "hypertension", "diabetes", "lisinopril", "10 mg", "daily"),
    ("discharge_summary", "2020-07-21", "pneumonia", "asthma", "amoxicillin", "500 mg", "three times daily"),
    ("consultation", "2022-02-10", "migraine", "epilepsy", "sumatriptan", "50 mg", "as needed"),
    ("consultation", "2023-05-02", "eczema", "psoriasis", "hydrocortisone", "1%", "twice daily"),
    ("discharge_summary", "2018-04-13", "atrial fibrillation", "stroke", "warfarin", "5 mg", "daily"),
    ("prescription", "2024-08-06", "hypothyroidism", "hyperthyroidism", "levothyroxine", "50 mcg", "daily"),
    ("consultation", "2024-01-17", "asthma", "pneumonia", "salbutamol", "100 mcg", "as needed"),
    ("discharge_summary", "2017-09-29", "heart failure", "myocardial infarction", "furosemide", "20 mg", "daily"),
    ("prescription", "2022-06-30", "type 2 diabetes", "hypoglycemia", "metformin", "500 mg", "twice daily"),
    ("consultation", "2023-12-05", "anemia", "leukemia", "ferrous sulfate", "325 mg", "daily"),
    ("discharge_summary", "2019-11-11", "deep vein thrombosis", "pulmonary embolism", "apixaban", "5 mg", "twice daily"),
    ("consultation", "2020-10-07", "allergic rhinitis", "sinusitis", "cetirizine", "10 mg", "daily"),
    ("consultation", "2021-03-20", "depression", "bipolar disorder", "sertraline", "50 mg", "daily"),
    ("prescription", "2024-02-19", "gout", "rheumatoid arthritis", "allopurinol", "100 mg", "daily"),
    ("discharge_summary", "2016-07-08", "gastritis", "gastric ulcer", "omeprazole", "20 mg", "daily"),
    ("prescription", "2023-02-24", "osteoarthritis", "gout", "acetaminophen", "500 mg", "as needed"),
    ("imaging_report", "2022-09-03", "cholelithiasis", "cholecystitis", None, None, None),
    ("imaging_report", "2021-11-08", "pleural effusion", "pneumothorax", None, None, None),
    ("lab_result", "2024-06-12", None, "diabetes", None, None, None),
    ("other", "2020-06-10", None, None, None, None, None),
)

ALIASES = {
    "hypertension": ("hipertensiune arterială", "arterial hypertension"),
    "type 2 diabetes": ("diabet zaharat de tip 2", "type 2 diabetes mellitus"),
    "diabetes": ("diabet", "diabet zaharat", "diabetes mellitus"),
    "acetaminophen": ("paracetamol",),
    "salbutamol": ("albuterol",),
    "ruled_out": ("ruled out",),
    "daily": ("o dată pe zi", "once daily", "zilnic"),
    "twice daily": ("de două ori pe zi", "two times daily"),
    "three times daily": ("de trei ori pe zi",),
    "as needed": ("la nevoie",),
}
ROMANIAN = (
    "pneumonie", "astm", "migrenă", "epilepsie", "eczemă", "psoriazis",
    "fibrilație atrială", "accident vascular cerebral", "hipotiroidism", "hipertiroidism",
    "insuficiență cardiacă", "infarct miocardic", "hipoglicemie", "anemie", "leucemie",
    "tromboză venoasă profundă", "embolie pulmonară", "rinită alergică", "sinuzită",
    "depresie", "tulburare bipolară", "gută", "artrită reumatoidă", "gastrită",
    "ulcer gastric", "osteoartrită", "colelitiază", "colecistită", "revărsat pleural", "pneumotorax",
)
ENGLISH = (
    "pneumonia", "asthma", "migraine", "epilepsy", "eczema", "psoriasis",
    "atrial fibrillation", "stroke", "hypothyroidism", "hyperthyroidism",
    "heart failure", "myocardial infarction", "hypoglycemia", "anemia", "leukemia",
    "deep vein thrombosis", "pulmonary embolism", "allergic rhinitis", "sinusitis",
    "depression", "bipolar disorder", "gout", "rheumatoid arthritis", "gastritis",
    "gastric ulcer", "osteoarthritis", "cholelithiasis", "cholecystitis", "pleural effusion", "pneumothorax",
)
NORMALIZE = {di.fold(alias): canonical for canonical, aliases in ALIASES.items() for alias in aliases}
NORMALIZE.update({di.fold(ro): en for ro, en in zip(ROMANIAN, ENGLISH, strict=True)})


def normalize(text):
    folded = di.fold(text)
    return NORMALIZE.get(folded, folded)


def corpus():
    for i, (category, date, positive, negative, drug, dose, frequency) in enumerate(CASES, 1):
        first = [f"Synthetic {category.replace('_', ' ')}. Document and encounter date: {date}."]
        evidence = {}
        if positive:
            line = f"Confirmed diagnosis: {positive}."
            first.append(line)
            evidence[("diagnosis", positive, "confirmed")] = (1, line)
        second = []
        if negative:
            line = f"{negative.capitalize()} was ruled out at this visit."
            (second if i % 2 == 0 else first).append(line)
            evidence[("diagnosis", negative, "ruled_out")] = (2 if i % 2 == 0 else 1, line)
        if drug:
            historical = i % 3 == 0
            status = "prior" if historical else "prescribed"
            line = (f"Prior medication: {drug} {dose} {frequency}, discontinued before this visit." if historical
                    else f"New prescription: {drug} {dose} {frequency}.")
            (second if i % 2 == 0 else first).append(line)
            evidence[("medication", drug, dose, frequency, status)] = (2 if i % 2 == 0 else 1, line)
        if not positive and not drug:
            first.append("No medications were recorded. The report was printed for administrative review.")
        yield str(i), ["\n".join(first)] + (["\n".join(second)] if second else []), evidence, date, category


def fields(doc):
    rows = [(("diagnosis", normalize(x.name), x.certainty), x.page, x.excerpt) for x in doc.diagnoses]
    rows += [(("medication", normalize(x.name), normalize(x.dose), normalize(x.frequency), x.context), x.page, x.excerpt)
             for x in doc.medications]
    return rows


def score(doc, evidence, date, category):
    actual = fields(doc)
    expected = Counter(evidence.keys())
    observed = Counter(row[0] for row in actual)
    groups = {}
    for kind in ("diagnosis", "medication"):
        exp = Counter({k: v for k, v in expected.items() if k[0] == kind})
        obs = Counter({k: v for k, v in observed.items() if k[0] == kind})
        groups[kind] = [sum((exp & obs).values()), sum(obs.values()), sum(exp.values())]
    groups["date"] = [int(doc.document_date == date) + int(doc.event_date == date),
                      int(bool(doc.document_date)) + int(bool(doc.event_date)), 2]
    groups["category"] = [int(doc.category == category), 1, 1]
    negative = {k for k in evidence if k[0] == "diagnosis" and k[2] == "ruled_out"}
    correctly_negated = sum(observed[key] == 1 and sum(
        n for candidate, n in observed.items() if candidate[:2] == key[:2]) == 1 for key in negative)
    grounded = sum(1 for key, page, quote in actual if key in evidence and page == evidence[key][0]
                   and len(di.fold(quote)) >= 4 and di.fold(quote) in di.fold(evidence[key][1])
                   and normalize(key[1]) in di.fold(evidence[key][1]))
    groups["provenance"] = [grounded, len(actual), len(evidence)]
    groups["negation"] = [correctly_negated, sum(n for k, n in observed.items() if k[0] == "diagnosis" and k[2] == "ruled_out"), len(negative)]
    return groups


def summarize(rows, variant):
    subset = [r for r in rows if r["variant"] == variant]
    valid = [r for r in subset if "scores" in r]
    groups = {}
    for name in ("diagnosis", "medication", "date", "category", "negation", "provenance"):
        tp, pred, gold = (sum(r["scores"][name][i] for r in valid) for i in range(3))
        groups[name] = {"precision": tp / pred if pred else None, "recall": tp / gold if gold else None,
                        "f1": 2 * tp / (pred + gold) if pred + gold else None}
    result = {"successful": len(valid), "quality_successes_only": groups}
    for metric in ("attempts", "prompt_tokens", "output_tokens", "estimated_usd", "gemini_ms", "ner_ms", "total_ms"):
        values = sorted(r[metric] for r in subset if r[metric] is not None)
        result[metric] = {"samples": len(values), "sum": sum(values), "mean": sum(values)/len(values) if values else None,
                          "p95": values[math.ceil(.95*len(values))-1] if values else None}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", help="Make paid calls only after approval")
    parser.add_argument("--input-price", type=float, default=settings.gemini_price_input_per_m)
    parser.add_argument("--output-price", type=float, default=settings.gemini_price_output_per_m)
    parser.add_argument("--max-usd", type=float, default=.06)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    if any(not math.isfinite(v) or v < 0 for v in (args.input_price, args.output_price, args.max_usd)):
        parser.error("Prices and budget must be finite and nonnegative")
    fixtures = list(corpus())
    # Conservative reserve for this small ASCII corpus, static system instructions and JSON schema.
    # Provider pricing and hidden billable usage are outside the local guard.
    input_reserve = 10_000
    output_limit = 1024
    calls = len(fixtures) * 2
    reserve = calls * (input_reserve * args.input_price + output_limit * args.output_price) / 1e6
    plan = {"documents": len(fixtures), "maximum_gemini_attempts": calls, "retries": 0,
            "estimated_reserve_usd": reserve, "budget_usd": args.max_usd,
            "input_usd_per_million": args.input_price, "output_usd_per_million": args.output_price,
            "max_output_tokens": output_limit, "model": settings.gemini_document_model}
    print(json.dumps(plan), flush=True)
    if not args.run:
        return
    if reserve > args.max_usd or not args.out or not gemini_client.configured():
        parser.error("Paid run requires configured Gemini, --out, and sufficient --max-usd")
    gemini_client.RETRY_DELAYS = ()
    start = time.perf_counter()
    if medical_ner._load() is None:
        parser.error("Local NER model is required")
    load_ms = (time.perf_counter()-start)*1000
    if medical_ner.extract(["Warmup. The patient denies diabetes."], True) is None:
        parser.error("Local NER warmup failed")
    rows = []
    for num, pages, evidence, date, category in fixtures:
        for variant in ("AB" if int(num) % 2 else "BA"):
            started = time.perf_counter()
            # NER remains active in both production arms; isolate the effect of sending hints.
            terms = medical_ner.extract(pages, True)
            if terms is None:
                raise RuntimeError("Local NER inference failed")
            ner_ms = (time.perf_counter()-started)*1000
            contents, _ = di.gemini_prompt_contents(pages, settings.gemini_document_max_input_chars,
                                                     terms if variant == "B" else None)
            system = di.system_prompt()
            bound = len((system + contents + json.dumps(gemini_client.gemini_schema(GeminiDocument))).encode())
            if bound > input_reserve:
                raise RuntimeError("Request exceeds the preflight input reserve")
            usage = {}
            remote = time.perf_counter()
            result = {"document": num, "variant": variant, "ner_ms": ner_ms,
                      "ner_terms": len(terms), "hints_sent": variant == "B" and "Unverified hints." in contents}
            try:
                doc = gemini_client.generate_structured(GeminiDocument, system, contents, "ner_benchmark",
                    model_override=settings.gemini_document_model, usage=usage, max_output_tokens=output_limit)
                result["scores"] = score(doc, evidence, date, category)
            except Exception as exc:
                result["error"] = type(exc).__name__
            inp, out = usage.get("prompt_tokens"), usage.get("output_tokens")
            result.update(attempts=usage.get("attempts", 0), prompt_tokens=inp, output_tokens=out,
                          estimated_usd=(inp * args.input_price + out * args.output_price)/1e6
                          if inp is not None and out is not None else None,
                          gemini_ms=(time.perf_counter()-remote)*1000, total_ms=(time.perf_counter()-started)*1000)
            rows.append(result)
            args.out.write_text(json.dumps({"plan": plan, "ner_load_ms": load_ms, "rows": rows,
                "summary": {v: summarize(rows, v) for v in "AB"}}, indent=2) + "\n")


if __name__ == "__main__":
    main()
