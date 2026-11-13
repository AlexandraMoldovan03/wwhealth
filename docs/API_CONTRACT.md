# API contract — v1

Source of truth for mobile ⇄ backend. Mirrors: `src/types/medical.ts` (TS) and `backend/app/schemas/` (Pydantic).
Live docs when the backend runs: `http://localhost:8000/docs`.

## Conventions

- Base URL: `EXPO_PUBLIC_API_BASE_URL`, prefix `/api/v1` (except `/health`).
- JSON keys **camelCase**. Dates: ISO 8601 strings (`2026-11-13T10:00:00Z`; dates of birth `YYYY-MM-DD`).
- IDs: strings with a prefix (`pat_`, `doc_`, `xray_`, `acc_`).
- Probabilities: floats `0..1`.
- Anything simulated has `isDemo: true` — the app shows a DEMO badge.
- Uploads: `multipart/form-data`, field `file`; JPEG/PNG/WEBP (documents also HEIC/PDF); max 10 MB.

### Errors

FastAPI format: `{ "detail": "Human readable message" }` (422 validation errors: `detail` is a list).

| Status | Meaning |
|---|---|
| 400 / 422 | invalid input |
| 401 | missing/invalid token |
| 403 | wrong role (e.g. patient calling a doctor endpoint) |
| 404 | not found / invalid access token |
| 410 | access token expired (optional, 404 also accepted) |
| 413 / 415 | file too large / unsupported type |
| 5xx | server error — app shows a generic message |

### Authentication

- Now: none (backend returns a demo user). App sends nothing.
- Target: Auth0. App sends `Authorization: Bearer <access_token>`. Backend validates via Auth0 JWKS
  (issuer `https://<AUTH0_DOMAIN>/`, audience `AUTH0_AUDIENCE`) and reads a role claim: `patient` | `doctor`.
- Patient endpoints: `patients/me`, `documents/analyze`, `xray/analyze`, `access/grant`.
- Doctor endpoints: `access/redeem`, `voice/summary` (voice also requires an active grant for that patient).
- **No secrets in the app.** Ever.

## Types

```ts
PatientRecord {
  id, fullName, dateOfBirth, sex: 'female'|'male'|'other', bloodType|null, heightCm|null, weightKg|null,
  emergencyContact: { name, phone, relation } | null,
  allergies:  { id, substance, reaction, severity: 'mild'|'moderate'|'severe' }[],
  diagnoses:  { id, name, icd10|null, diagnosedAt, status: 'active'|'resolved' }[],
  treatments: { id, name, dosage, frequency, startDate, endDate|null, active }[],
  history:    MedicalEvent[], documents: MedicalDocument[], xrays: XrayAnalysis[]
}
MedicalEvent    { id, type: 'diagnosis'|'treatment'|'allergy'|'document'|'xray'|'visit', title, description, date, details: Record<string,string> }
MedicalDocument { id, title, type: 'lab_result'|'prescription'|'discharge_summary'|'imaging_report'|'other',
                  uploadedAt, fileUrl|null, status: 'processing'|'analyzed'|'failed', extraction: DocumentExtraction|null, isDemo }
DocumentExtraction { summary, diagnoses: string[], allergies: string[], medications: string[],
                     labValues: { name, value, unit|null, flag: 'low'|'normal'|'high'|null }[] }
XrayAnalysis    { id, createdAt, imageUrl|null, heatmapUrl|null, predictions: { label, probability }[],
                  topLabel, modelVersion, processingTimeMs, isDemo, disclaimer }
AccessScope = 'profile' | 'history' | 'documents' | 'xrays'
```

## Endpoints

### `GET /health`
```json
{ "status": "ok", "version": "0.1.0" }
```

### `GET /api/v1/patients/me` — patient
Response: `PatientRecord`.

### `POST /api/v1/documents/analyze` — patient, multipart
Fields: `file` (required), `documentType` (`DocumentType`, default `other`), `title` (optional).
Response:
```json
{ "document": { "id": "doc_1a2b", "title": "Blood test", "type": "lab_result", "uploadedAt": "2026-11-13T10:00:00Z",
  "fileUrl": null, "status": "analyzed", "isDemo": false,
  "extraction": { "summary": "…", "diagnoses": [], "allergies": ["Penicillin"], "medications": [],
                  "labValues": [{ "name": "Ferritin", "value": "11", "unit": "ng/mL", "flag": "low" }] } } }
```

### `POST /api/v1/xray/analyze` — patient, multipart
Fields: `file` (JPEG/PNG/WEBP chest X-ray). Response: `XrayAnalysis`
```json
{ "id": "xray_9f8e", "createdAt": "2026-11-13T10:00:00Z", "imageUrl": null,
  "heatmapUrl": "data:image/png;base64,iVBOR…",
  "predictions": [{ "label": "Normal", "probability": 0.88 }, { "label": "Pneumonia", "probability": 0.07 }],
  "topLabel": "Normal", "modelVersion": "densenet121-v0", "processingTimeMs": 840,
  "isDemo": false, "disclaimer": "Not a medical device…" }
```

### `POST /api/v1/access/grant` — patient
Request: `{ "scopes": ["profile", "xrays"], "ttlMinutes": 15 }` (ttl capped by `ACCESS_TOKEN_MAX_TTL_MINUTES`)
Response:
```json
{ "token": "WWH-K3P9-ZQ2M", "qrPayload": "wwhealth://access/WWH-K3P9-ZQ2M",
  "expiresAt": "2026-11-13T10:15:00Z", "scopes": ["profile", "xrays"] }
```

### `POST /api/v1/access/redeem` — doctor
Request: `{ "token": "WWH-K3P9-ZQ2M" }` (raw token or the full `qrPayload`)
Response: `{ "accessId": "acc_77aa", "expiresAt": "…", "scopes": ["profile","xrays"], "patient": PatientRecord }`
— arrays outside the granted scopes are **empty**. Errors: 404 invalid, 404/410 expired.

### `POST /api/v1/voice/summary` — doctor
Request: `{ "patientId": "pat_demo_001", "language": "en" }` (`en` | `ro`)
Response: `{ "text": "Maria Ionescu, born …", "audioUrl": "https://…/summary.mp3", "isDemo": false }`
(`audioUrl` is `null` until ElevenLabs is integrated.)

## Changing the contract

1. Edit this file in a PR, tag the other two devs. 2. Update `src/types/medical.ts` + `backend/app/schemas/`.
3. Prefer **adding** optional fields over renaming/removing during the hackathon.
