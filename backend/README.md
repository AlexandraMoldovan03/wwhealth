# WWHealth — Backend (FastAPI)

Owner: **Developer 3 (Backend)**. Contract: [../docs/API_CONTRACT.md](../docs/API_CONTRACT.md).

## Run

Requires Python 3.11+ (`python3.12` on macOS via Homebrew).

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Health: http://localhost:8000/health
- Interactive docs (Swagger): http://localhost:8000/docs
- Tests: `pytest`

`--host 0.0.0.0` lets a phone on the same Wi-Fi reach it. In the mobile `.env` set
`EXPO_PUBLIC_API_BASE_URL=http://<your-LAN-IP>:8000` and `EXPO_PUBLIC_USE_MOCKS=false`.

## LungVision (real model)

`POST /api/ai/lung/analyze` runs DenseNet121 + Grad-CAM on the server (`app/ml/lungvision/`).

```bash
pip install -r requirements-ml.txt            # torch, torchvision, grad-cam, pillow
# put the checkpoint at backend/models/lungvision_best.pth (git-ignored, never in the Expo app)
pytest tests/test_lungvision.py
```

Without the checkpoint or torch the endpoint answers `503` (the rest of the API still works).
The old `/api/v1/xray/analyze` demo endpoint is unchanged.

## Structure

```
app/
  main.py            FastAPI app, CORS, routers
  core/config.py     settings from .env
  core/security.py   auth (DEMO user → Auth0 JWT later)
  api/router.py      /api/v1 router
  api/routes/        one file per resource: patients, documents, xray, access, voice, health
  schemas/           Pydantic models (camelCase JSON) — must match src/types/medical.ts
  services/          business logic + integrations (Gemini, ElevenLabs, AI model)
  db/                SQLAlchemy engine/session + models (PostgreSQL)
tests/
```

## What is DEMO right now

All endpoints work and return contract-shaped JSON, but: data is in memory (`services/demo_data.py`),
auth returns a demo user, Gemini/ElevenLabs are not called, and LungVision returns random demo
probabilities unless `USE_AI_MODEL=true` (then it calls `ai/inference/predict.py::predict_xray`).
Responses from placeholders have `isDemo: true`.
