import pytest

from app.services import medical_ner


def test_bio_continuation_across_window_boundary():
    tokens = {
        (510, 515): ("B-Disease", .9),
        (515, 523): ("I-Disease", .8),
        (524, 525): ("O", .99),
    }
    assert list(medical_ner._spans(tokens)) == [("Disease", 510, 523, [.9, .8])]


def test_missing_model_preserves_import(monkeypatch, tmp_path):
    monkeypatch.setattr(medical_ner, "MODEL_DIR", tmp_path)
    medical_ner._load.cache_clear()
    try:
        assert medical_ner.extract(["hypertension"], False) is None
    finally:
        medical_ner._load.cache_clear()


@pytest.mark.skipif(not medical_ner.available(), reason="Local NER artifact not installed")
def test_local_model_and_long_document():
    pytest.importorskip("transformers")
    runtime = medical_ner._load()
    tokenizer, model, _ = runtime
    assert medical_ner._load() is runtime
    assert [tokenizer.pad_token_id, tokenizer.unk_token_id, tokenizer.cls_token_id,
            tokenizer.sep_token_id, tokenizer.mask_token_id] == [0, 100, 101, 102, 103]
    assert {label: index for index, label in model.config.id2label.items()} == model.config.label2id
    assert medical_ner.extract(["The report was printed today."], False) == []
    short = medical_ner.extract(["Aspirin was administered to patients with hypertension and diabetes."], False)
    assert short is not None and {"Chemical", "Disease"} <= {term.kind for term in short}
    text = "The report was printed today. " * 80 + "Aspirin was administered to patients with hypertension and diabetes."
    terms = medical_ner.extract([text], True)
    assert terms is not None
    assert any(term.text == "diabetes" and term.kind == "Disease" for term in terms)
    assert all(term.text == text[term.start:term.end] and term.page == 1 for term in terms)
    assert len({(term.start, term.end) for term in terms}) == len(terms)
