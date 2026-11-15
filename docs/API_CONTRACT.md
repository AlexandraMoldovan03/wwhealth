# API contract — v1

Source of truth for mobile ⇄ backend. Mirrors: `frontend/types/medical.ts` (TS) and `backend/app/schemas/` (Pydantic).
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
- Patient endpoints: `patients/me`, `documents/analyze`, `xray/analyze`, `doctor-access/grants`.
- Doctor endpoints: `doctor-access/patients*`, `doctor-access/me`, `voice/summary`.
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
MedicalEvent    { id, type: 'diagnosis'|'treatment'|'allergy'|'document'|'xray'|'visit', title, description, date, details: Record<string,string>, documentId?: string|null }
MedicalDocument { id, title, type: 'lab_result'|'prescription'|'discharge_summary'|'imaging_report'|'other',
                  uploadedAt, fileUrl|null, mimeType?, sizeBytes?, status: 'uploaded'|'processing'|'analyzed'|'failed',
                  extraction: DocumentExtraction|null, isDemo }
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

### `PATCH /api/v1/patients/me` — patient (Smart Medical Profile)
Only the fields sent are changed; lists replace the whole list. Items without `id` are new (server assigns ids).
Personal details accept fullName, dateOfBirth (YYYY-MM-DD, no future dates), sex (female, male or other), heightCm (30-260) and weightKg (1-400). Use null to clear any of these fields except fullName.
```json
{ "bloodType": "O-",                       // A+ A- B+ B- AB+ AB- O+ O- or null
  "allergies":  [{ "id": "al1", "substance": "Penicillin", "reaction": "Rash", "severity": "moderate" }],
  "diagnoses":  [{ "name": "Hypertension", "status": "active" }],          // "conditions" in the UI
  "treatments": [{ "name": "Lisinopril", "dosage": "10 mg", "frequency": "1x daily", "active": true }] }  // "medication"
```
Response: `PatientRecord`. `422` invalid values.

### `POST /api/v1/documents` — patient, multipart (private upload, no OCR / AI)
Fields: `file` (PDF/JPEG/PNG, max 10 MB, type checked from file bytes), `documentType`, `title` (optional).
Response `201`: `{ "document": MedicalDocument }` with `status: "uploaded"`, `mimeType`, `sizeBytes`,
`fileUrl: "/api/v1/documents/{id}/file"`. Also adds a `MedicalEvent` `{ type: "document", documentId }` to `history`.
Files are stored outside any public folder (`backend/storage/`, owner-only permissions, server-generated names).

### `GET /api/v1/documents/{id}/file` — patient
The file, only for its owner (`404` otherwise — no existence leak). Headers: `Cache-Control: no-store, private`.
The app sends `Authorization: Bearer <token>` (Image / WebView headers on mobile, fetch → blob on web).

### `POST /api/v1/documents/analyze` — patient, multipart
Fields: `file` (required), `documentType` (`DocumentType`, default `other`), `title` (optional).
Response:
```json
{ "document": { "id": "doc_1a2b", "title": "Blood test", "type": "lab_result", "uploadedAt": "2026-11-13T10:00:00Z",
  "fileUrl": null, "status": "analyzed", "isDemo": false,
  "extraction": { "summary": "…", "diagnoses": [], "allergies": ["Penicillin"], "medications": [],
                  "labValues": [{ "name": "Ferritin", "value": "11", "unit": "ng/mL", "flag": "low" }] } } }
```

### `POST /api/v1/intake/voice` — patient, multipart

Send a recording in the required `file` field (up to 25 MiB). The backend sends
audio to ElevenLabs for transcription, then sends the transcript to Gemini for
structured extraction. It detects the spoken language and keeps descriptive
fields in that language. The patient reviews the form before saving.

```json
{
  "transcript": "De trei zile mă doare capul.",
  "language": "ron",
  "summary": "Durere de cap de trei zile.",
  "symptoms": [{ "name": "Durere de cap", "duration": "3 zile", "severity": null, "notes": null }],
  "medicationsMentioned": [],
  "allergiesMentioned": [],
  "urgentWarning": false,
  "isDemo": false,
  "disclaimer": "AI structures what the patient said. It does not diagnose. In an emergency call 112."
}
```

`language` is the provider's language code or null. `severity` is `mild`,
`moderate`, `severe`, or null. A missing provider key returns a fixed example
with `isDemo: true`. Empty audio or speech returns 400, oversized audio returns
413, and provider failures return 502. The endpoint does not save the audio
or form. History stores confirmed forms on the current device, scoped to the
signed-in patient. The forms are unavailable to the doctor and other devices.
Use fictional patient data for the hackathon demo.

### `POST /api/v1/xray/analyze` — patient, multipart
Fields: `file` (JPEG/PNG/WEBP chest X-ray). Response: `XrayAnalysis`
```json
{ "id": "xray_9f8e", "createdAt": "2026-11-13T10:00:00Z", "imageUrl": null,
  "heatmapUrl": "data:image/png;base64,iVBOR…",
  "predictions": [{ "label": "Normal", "probability": 0.88 }, { "label": "Pneumonia", "probability": 0.07 }],
  "topLabel": "Normal", "modelVersion": "densenet121-v0", "processingTimeMs": 840,
  "isDemo": false, "disclaimer": "Not a medical device…" }
```

### `POST /api/ai/lung/analyze` — LungVision (real model), multipart
Fields: `file` (JPEG/PNG chest X-ray, max 10 MB, min 64×64 px). The image is processed in memory and **not stored**.
Model: DenseNet121 + `Linear(1024, 1)` trained on PneumoniaMNIST (`ai/notebooks/LungVision_Training.ipynb`).
`score` = sigmoid output (positive class = pneumonia), **not a clinical probability**; flagged when `score >= 0.3`.
Errors: `415` wrong type · `413` too large · `400` not a valid/usable image · `503` model or ML deps missing (never a fake result).
```json
{ "score": 0.0713, "threshold": 0.3, "aboveThreshold": false, "label": "Not flagged (experimental)",
  "heatmapPngBase64": "iVBOR…", "modelVersion": "lungvision-densenet121-pneumoniamnist-v1",
  "processingTimeMs": 284, "isExperimental": true, "disclaimer": "Educational prototype, not a medical device…" }
```

### Doctor Access & Consent — `/api/v1/doctor-access` (migration `20261115000000_doctor_access_consent.sql`)
Enforced in Postgres (RLS + security-definer RPCs, audited in `doctor_access_log`); the backend re-checks sections.
Doctor role = `public.profiles.role` (set by an admin), never token metadata. 503 = migration not applied yet.

Patient (own data only):
- `GET /doctors?q=` → `[{ "id", "fullName", "doctorCode": "DR-1A2B3C" }]` — verified doctors by name or exact code.
- `GET /grants` → `{ "grants": [DoctorGrant], "events": [AccessEvent] }` (status `active|expired|revoked`).
- `POST /grants` `{ "doctorId" | "doctorCode", "scopes": ["profile","documents","labs"], "durationHours": 1|24|168 }`
  → 201 `DoctorGrant`. Replaces an active grant to the same doctor. 422 invalid, 404 unknown doctor.
- `POST /grants/{id}/revoke` → 204 (immediate), 404 if not the caller's active grant.
- `GET /patients/me/summary` → `MedicalSummary` of the caller (no AI; sections not shared are `null`).

Doctor (role doctor + valid consent):
- `GET /me` → `{ "fullName", "doctorCode" }`.
- `GET /patients?q=` → `[DoctorPatient]` (latest grant per patient, with status).
- `GET /patients/{id}` → `PatientAccessView { status: ok|none|expired|revoked|forbidden, patientName, scopes, expiresAt,
  summary, documents, labs }` — without valid consent only the status (no data).
- `GET /patients/{id}/documents/{docId}/file` → file; 403 expired/revoked/section not shared, 404 otherwise.

The Emergency Passport (`/emergency/*`) uses single-use QR tokens that expire after five minutes. Patients can
check `GET /emergency/tokens/{id}/status` for `active|used|revoked|expired|not_found`; this exposes only the
status of their own token. The schema migration `20261117000000_emergency_token_status.sql` adds the Supabase RPC.

### AI Medical Intelligence — `/api/v1/intelligence` (migration `20261116000000_ai_medical_intelligence.sql`)
Gemini (Google Gen AI SDK) runs only in the backend (`GEMINI_API_KEY`, optional `GEMINI_SUMMARY_MODEL` in backend/.env).
Nothing is sent without the patient's explicit consent. Only minimal facts are sent (no name, email, date of birth,
files or OCR text). The answer is a strict JSON schema; every statement must cite real fact ids of the right kind or
it is dropped. Priority uses explicit rules (anaphylaxis / severe allergy / lab outside its printed range).

Patient: `GET|PUT /consent` `{ "granted": bool }` (withdrawing deletes the saved summary) · `GET /me` →
`IntelligenceView { status: ok|none|no_consent|not_configured, aiConfigured, consent, summary }` ·
`POST /me/generate` `{ "language": "ro"|"en" }` · `DELETE /me`.
Doctor (role + valid consent): `GET /patients/{id}` (saved summary only if the active grant covers every section it was
built from) · `POST /patients/{id}/generate` (granted sections only, needs the patient's AI consent, not stored).
Errors: 403 no consent / access, 429 rate limit (`AI_SUMMARY_PER_USER_PER_HOUR`, default 6), 503 not configured,
504 Gemini timeout, 502 invalid Gemini answer. `PATCH /patients/me` also accepts `surgeries: [{ name, date?, notes? }]`.

### Smart Care — `/api/v1/smart-care` (migration `20261117000100_smart_care_appointments.sql`)
Specialty recommendation (optional AI) + booking with verified doctors. Specialty ids come only from the backend
catalog (`backend/app/services/specialty_catalog.py`, same ids seeded in `medical_specialties`).

Patient:
- `GET /specialties?q=&lang=ro|en` → `[{ id, name }]` — manual search, no AI.
- `POST /transcribe` (multipart `file`, `elevenlabsConsent=true`) → `{ transcript, language, isDemo }` — ElevenLabs only,
  no Gemini; 422 without consent, 503 without `ELEVENLABS_API_KEY` (demo text only in demo mode).
- `POST /triage` `{ symptoms, source: text|voice, confirmed: true, useHistory, answers: [{question, answer}] (≤3), language }` →
  `TriageResult { status: ok|emergency|no_consent|not_configured|failed, aiUsed, historyUsed, symptomSummary,
  specialties: [{id, name, reason}] (≤3), reasoning, clarificationQuestions (≤3), warningSigns, recommendedNextStep,
  emergency: { level: call_112|urgent, codes } | null, discarded }`. Order: emergency regex rules (no AI; `call_112` →
  Gemini is never called) → AI consent (same as `/intelligence/consent`) → `GEMINI_API_KEY` → Gemini strict schema →
  filter (catalog ids only, no diagnosis / percentages / scores / treatment). History (only with `useHistory`): active
  conditions, allergies, active medication names — no name. 422 when `confirmed` is false, 429 rate limit.
- `GET /specialties/{id}/doctors` → `[{ id, fullName, doctorCode, nextSlot, freeSlots }]` (verified doctors, 14 days).
- `GET /doctors/{id}/slots?days=14` → `[{ id, startsAt, endsAt }]` free slots only.
- `POST /appointments?lang=` `{ slotId, specialtyId?, note? }` → `Appointment` (201) · 409 slot taken · 403 not a patient.
- `GET /appointments?lang=` · `POST /appointments/{id}/action` `{ action: accept_proposal|decline_proposal|cancel }`.

Doctor (role `doctor`): `GET /doctor/appointments` · `POST /doctor/appointments/{id}/respond`
`{ action: accept|reject|propose, slotId? (propose), note? }` · `GET /doctor/availability` (own future slots) ·
`GET /doctor/free-slots` · `POST /doctor/availability` `{ startsAt, endsAt (ISO with timezone, ≤12 h), slotMinutes:
15|20|30|45|60 }` → `{ added }` · `DELETE /doctor/availability/{slotId}`.

`Appointment { id, patientId, doctorId, patientName (doctor only), doctorName, specialtyId, specialtyName, startsAt,
endsAt, status: requested|proposed|confirmed|rejected|cancelled, proposedStartsAt, proposedEndsAt, patientNote,
doctorNote, createdAt, updatedAt }`. 503 when the migration is not applied.

### `POST /api/v1/voice/summary` — doctor
Request: `{ "patientId": "pat_demo_001", "language": "en" }` (`en` | `ro`)
Response: `{ "text": "Maria Ionescu, born …", "audioUrl": "https://…/summary.mp3", "isDemo": false }`
(`audioUrl` is `null` until ElevenLabs is integrated.)

## Changing the contract

1. Edit this file in a PR, tag the other two devs. 2. Update `frontend/types/medical.ts` + `backend/app/schemas/`.
3. Prefer **adding** optional fields over renaming/removing during the hackathon.
