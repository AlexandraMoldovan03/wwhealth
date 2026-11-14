"""Train DenseNet121 on chest X-rays. TODO(ai).

Plan: dataset → train/val/test split by PATIENT (avoid leakage) → augmentations (small rotation,
no horizontal flip for cardiomegaly) → BCEWithLogits (multi-label) → AdamW → save best on val AUROC
to ai/models/densenet121_lungvision.pt.

Run: python -m ai.training.train   (from the repo root)
"""

if __name__ == "__main__":
    raise SystemExit("TODO(ai): implement training")
