# WWHealth — AI (LungVision)

Owner: **Developer 1 (AI)**. DenseNet121 chest X-ray classifier + Grad-CAM.

```
ai/
  config.py            labels, weights path, image size
  notebooks/           exploration, training experiments (Colab/Jupyter)
  data/                local datasets (gitignored)
  training/train.py    training script
  evaluation/          metrics + Grad-CAM samples
  inference/
    predict.py         ← predict_xray(): THE contract with the backend
    model.py           DenseNet121 build/load
    gradcam.py         heatmap overlay
  models/              trained weights (gitignored)
```

## Setup

```bash
python3.12 -m venv ai/.venv && source ai/.venv/bin/activate
pip install -r ai/requirements.txt
```

## Contract: `predict_xray()`

```python
from ai.inference.predict import predict_xray
result = predict_xray(image_bytes, with_gradcam=True)
# {
#   "predictions": [{"label": "Normal", "probability": 0.88}, ...],  # sorted desc, 0..1
#   "top_label": "Normal",
#   "heatmap_png_base64": "iVBORw0..." | None,
#   "model_version": "densenet121-v0",
#   "is_demo": False
# }
```

Full details in the docstring of `inference/predict.py`. Until weights exist it returns a random
placeholder with `is_demo: True`, so the backend integration can be built in parallel.

**Test the contract** (from the repo root, no torch needed for the placeholder):

```bash
python3 -c "from ai.inference.predict import predict_xray; print(predict_xray(b''))"
```

**Hook into the backend:** set `USE_AI_MODEL=true` in `backend/.env` and install `ai/requirements.txt`
in the backend's venv. The backend calls `predict_xray` and converts the result to the API response.
