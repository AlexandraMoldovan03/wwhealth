# WWHealth (WorldWideHealth)

Medical record app for patients and doctors — built for **UniHack**.
Patients keep their profile, documents (Gemini extraction), medical history and **LungVision AI** chest X-ray
analyses (DenseNet121 + Grad-CAM), and share them temporarily with a doctor through a **QR Medical Passport**.

| Part | Folder | Stack | Owner |
|---|---|---|---|
| Mobile app | repo root (`app/`, `src/`) | React Native, Expo SDK 58 (Expo Go), TypeScript, Expo Router | Developer 2 |
| Backend | `backend/` | FastAPI, PostgreSQL, Auth0, Gemini, ElevenLabs | Developer 3 |
| AI | `ai/` | PyTorch, DenseNet121, Grad-CAM | Developer 1 |

📚 [docs/TEAM_GUIDE.md](docs/TEAM_GUIDE.md) · [docs/API_CONTRACT.md](docs/API_CONTRACT.md) · [docs/TASKS.md](docs/TASKS.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/MOBILE_ARCHITECTURE.md](docs/MOBILE_ARCHITECTURE.md) · [docs/HOW_TO_ADD_FEATURE.md](docs/HOW_TO_ADD_FEATURE.md)

> ⚠️ Hackathon prototype — not a medical device. All AI output is marked **DEMO** until the real model is integrated.

## Quick start — mobile

Requirements: Node.js 20+, the **Expo Go** app on your phone (supports SDK 58), phone and laptop on the same Wi-Fi.

```bash
npm install
cp .env.example .env     # MOCK mode by default — no backend needed
npm start                # scan the QR code (iPhone: Camera app · Android: Expo Go)
```

`npx expo start --tunnel` if the phone can't connect · `npx expo start --clear` after editing `.env` · `npm run check` before pushing.

**MOCK vs API mode** (`.env`): `EXPO_PUBLIC_USE_MOCKS=true` uses in-memory demo data;
`false` calls the FastAPI backend at `EXPO_PUBLIC_API_BASE_URL` (your laptop's LAN IP, not `localhost`).

## Quick start — backend / AI

See [backend/README.md](backend/README.md) and [ai/README.md](ai/README.md).

```bash
cd backend && python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt && cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000      # → http://localhost:8000/health
```

## App screens

| Area | Screen | Route |
|---|---|---|
| Tabs | Patient Dashboard · Explore · LungVision AI · Medical History · Settings | `/`, `/explore`, `/analysis`, `/history`, `/settings` |
| Patient | Medical Profile · Medical Documents · Upload Document · X-ray Results · Medical Passport QR | `/patient/profile`, `/patient/documents`, `/patient/upload-document`, `/patient/xray-results`, `/patient/passport` |
| Doctor | Doctor Dashboard · QR Scanner · Patient Summary · Patient Documents · LungVision Results | `/doctor`, `/doctor/scan`, `/doctor/patient/[id]`, `…/documents`, `…/lungvision` |

Doctor area: Home → "Open Doctor Dashboard" or Settings → Role. Demo access code in MOCK mode: **DEMO-1234**.

## Where do I…? (mobile)

| I want to… | Go to |
|---|---|
| Change the patient dashboard | `src/screens/patient/PatientDashboardScreen.tsx` |
| Add a page | file in `app/` + screen in `src/screens/` → [HOW_TO_ADD_FEATURE.md](docs/HOW_TO_ADD_FEATURE.md) |
| Change colours / spacing / fonts | `src/constants/theme.ts` |
| Tabs and header titles | `src/constants/navigation.ts` |
| Call the backend | `api` from `src/services/backend.ts` (real: `services/api/realApi.ts`, mock: `services/mock/mockApi.ts`) |
| Contract types | `src/types/medical.ts` |
| Mock data | `src/data/mockPatient.ts` |
| Reusable UI | `src/components/ui/` |

## Structure

```
app/            Expo Router routes (tabs, patient/*, doctor/*)
src/            mobile code: screens, components, features, services, hooks, constants, types, data, utils
assets/         images, icons
backend/        FastAPI (routes, schemas, services, db)
ai/             DenseNet121 training, Grad-CAM, evaluation, inference (predict_xray)
docs/           team guide, API contract, tasks, architecture
```

**Security:** no secrets in the app — everything bundled (including `EXPO_PUBLIC_*`) is public.
API keys live only in `backend/.env` (gitignored).
