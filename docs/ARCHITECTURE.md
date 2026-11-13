# WWHealth — System architecture

```
┌────────────────────────┐      HTTPS / JSON (camelCase)      ┌──────────────────────────────┐
│  Mobile app (Expo)     │  ───────────────────────────────▶  │  Backend (FastAPI)  backend/ │
│  repo root: app/, src/ │   Authorization: Bearer <Auth0>    │                              │
│                        │   multipart for images/documents   │  routes → services → db      │
│  MOCK mode: no backend │  ◀───────────────────────────────  │                              │
└──────────┬─────────────┘                                    └──┬───────┬────────┬───────┬──┘
           │ login (later)                                       │       │        │       │
           ▼                                                     ▼       ▼        ▼       ▼
      ┌─────────┐                                         PostgreSQL  Gemini  ElevenLabs  ai/
      │  Auth0  │ ◀──── JWT validation (JWKS) ────────────  (records)  (docs)   (voice)  predict_xray()
      └─────────┘                                                                  DenseNet121 + Grad-CAM
```

- **The app never talks to Gemini, ElevenLabs, PostgreSQL or the model directly.** Only the backend
  holds secrets (`backend/.env`). The app only knows `EXPO_PUBLIC_API_BASE_URL`.
- **The model runs inside the backend process** as a Python import: `xray_service.py` →
  `ai/inference/predict.py::predict_xray(image_bytes)`. No separate model server needed for the hackathon.
- **Contract first:** `docs/API_CONTRACT.md` ⇄ `src/types/medical.ts` ⇄ `backend/app/schemas/`.
  Change all three together, in the same PR when possible.

## Main flows

| Flow | Path |
|---|---|
| Patient record | App `api.getMyPatient()` → `GET /api/v1/patients/me` → `patient_service` → PostgreSQL |
| Document upload | App picks photo → `POST /api/v1/documents/analyze` (multipart) → `document_service` → Gemini → stored extraction |
| LungVision | App picks X-ray → `POST /api/v1/xray/analyze` → `xray_service` → `predict_xray()` → predictions + Grad-CAM base64 → `heatmapUrl` |
| QR passport | Patient: `POST /access/grant` → short-lived token → QR (`wwhealth://access/<token>`). Doctor: scans → `POST /access/redeem` → patient data filtered by scopes |
| Voice summary | Doctor: `POST /voice/summary` → summary text (Gemini) → ElevenLabs audio URL |

## Modes

| | Mobile | Backend |
|---|---|---|
| Demo | `EXPO_PUBLIC_USE_MOCKS=true` (default) — no backend at all | in-memory demo data, `isDemo: true` |
| Integrated | `EXPO_PUBLIC_USE_MOCKS=false` + LAN URL | `DATABASE_URL`, `AUTH0_*`, `GEMINI_API_KEY`, `ELEVENLABS_*`, `USE_AI_MODEL=true` |

Details per part: [MOBILE_ARCHITECTURE.md](./MOBILE_ARCHITECTURE.md) · [../backend/README.md](../backend/README.md) · [../ai/README.md](../ai/README.md)
