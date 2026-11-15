"""Local, optional token classification. Findings are document annotations only."""
from functools import lru_cache
from pathlib import Path
from threading import Lock

from app.schemas.smart_import import NerTerm

MODEL_DIR = Path(__file__).resolve().parents[2] / "models" / "medical_ner"
MODEL_VERSION = "wwhealth-bc5cdr-v1.1"  # .1: word-level spans
MAX_CHARS = 80_000
MAX_TERMS = 200
OVERLAP = 96
_lock = Lock()


def available() -> bool:
    return (MODEL_DIR / "model.safetensors").is_file()


@lru_cache(maxsize=1)
def _load():
    if not available():
        return None
    import torch
    from transformers import AutoModelForTokenClassification, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR, local_files_only=True, trust_remote_code=False)
    model = AutoModelForTokenClassification.from_pretrained(
        MODEL_DIR, local_files_only=True, trust_remote_code=False, use_safetensors=True)
    labels = model.config.id2label
    expected = {"O", "B-Chemical", "I-Chemical", "B-Disease", "I-Disease"}
    if not tokenizer.is_fast or set(labels.values()) != expected or model.config.label2id != {
        label: index for index, label in labels.items()
    }:
        raise ValueError("Unsupported Medical NER tokenizer or label map")
    model.to("cuda" if torch.cuda.is_available() else "cpu").eval()
    return tokenizer, model, torch


def _spans(tokens):
    """Decode BIO labels after merging overlapping windows by token position."""
    span = None
    for (start, end), (label, confidence) in sorted(tokens.items()):
        prefix, _, kind = label.partition("-")
        if span and (prefix != "I" or span[0] != kind):
            yield span
            span = None
        if kind:
            if span:
                span = (kind, span[1], end, [*span[3], confidence])
            else:
                span = (kind, start, end, [confidence])
    if span:
        yield span


def _words(text, spans):
    """Snap spans to whole words and merge pieces of one word ("di" + "zziness" → "dizziness")."""
    merged = []
    for kind, start, end, scores in spans:
        while start > 0 and text[start - 1].isalnum():
            start -= 1
        while end < len(text) and text[end].isalnum():
            end += 1
        if merged and merged[-1][2] >= start:
            prev = merged[-1]
            merged[-1] = (prev[0], prev[1], max(prev[2], end), [*prev[3], *scores])
        else:
            merged.append((kind, start, end, list(scores)))
    return merged


def _page(text, tokenizer, model, torch):
    chunks = tokenizer(text, max_length=min(512, model.config.max_position_embeddings),
                       truncation=True, stride=OVERLAP, return_overflowing_tokens=True,
                       return_offsets_mapping=True, return_special_tokens_mask=True,
                       return_tensors="pt", padding="longest")
    offsets = chunks.pop("offset_mapping").tolist()
    special = chunks.pop("special_tokens_mask").tolist()
    chunks.pop("overflow_to_sample_mapping")
    chosen = {}
    with torch.inference_mode():
        for i, window in enumerate(offsets):
            inputs = {key: value[i:i+1].to(model.device) for key, value in chunks.items()}
            scores, labels = model(**inputs).logits[0].softmax(-1).max(-1)
            real = [j for j, (a, b) in enumerate(window) if b > a and not special[i][j]]
            for index, j in enumerate(real):
                key = tuple(window[j])
                margin = min(index, len(real) - index - 1)
                if key not in chosen or margin > chosen[key][0]:
                    chosen[key] = (margin, model.config.id2label[int(labels[j])], float(scores[j]))
    return _spans({key: (label, score) for key, (_, label, score) in chosen.items()})


def extract(pages: list[str], paginated: bool) -> list[NerTerm] | None:
    """Return None when unavailable or busy; [] is a successful empty result."""
    if not _lock.acquire(blocking=False):
        return None
    try:
        runtime = _load()
        if runtime is None:
            return None
        terms = []
        remaining = MAX_CHARS
        offset = 0
        for page, original in enumerate(pages, 1):
            if remaining <= 0:
                break
            text = original[:remaining]
            remaining -= len(text)
            if text.strip():
                for kind, start, end, scores in _words(text, _page(text, *runtime)):
                    terms.append(NerTerm(text=text[start:end], kind=kind, start=offset + start,
                                         end=offset + end, page=page if paginated else None,
                                         confidence=sum(scores) / len(scores),
                                         context=text[max(0, start-75):end+75]))
                    if len(terms) >= MAX_TERMS:
                        return terms
            offset += len(original) + 1  # pages joined by a single newline
        return terms
    except Exception:
        # Import remains usable when optional dependencies or local inference fail.
        # Never interpolate exception messages: tokenizer errors may include the text.
        return None
    finally:
        _lock.release()
