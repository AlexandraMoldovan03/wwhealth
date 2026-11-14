# WWHealth — UX Information Architecture

Story: **COLLECT → UNDERSTAND → CONTROL → CONNECT**. Every patient section maps to one step; the visual identity
(colours, typography, animations, design system, brand background) is unchanged.

Status legend: **Live** = works end to end with the backend · **Needs config** = works once the server keys / migrations
are in place · **Experimental** = AI result, informative only · **Demo** = sample data shown only in MOCK mode.

## 1. Screen inventory

### Patient

| Route | Screen | What it does | Status |
|---|---|---|---|
| `/` | `PatientDashboardScreen` | Home: welcome, Emergency Passport, next step, record checklist, snapshot, “How WWHealth works” | Live |
| `/records` | `RecordsHubScreen` *(new)* | Section **My record** (COLLECT) | Live |
| `/insights` | `InsightsHubScreen` *(new)* | Section **AI Medical Insights** (UNDERSTAND) | Live |
| `/transfer` | `TransferHubScreen` *(new)* | Section **Transfer & Access** (CONTROL → CONNECT) | Live |
| `/settings` | `SettingsScreen` | Section **Profile**: account, theme, language, backend info, checklist toggle, all features | Live |
| `/history` | `MedicalHistoryScreen` | Timeline + lab trends (confirmed values only) | Live (opened from My record) |
| `/analysis` | `LungVisionScreen` | Chest X-ray analysis, DenseNet121 + Grad-CAM | Experimental (opened from AI Insights) |
| `/explore` | `ExploreScreen` | Searchable list of every module | Live (opened from Profile) |
| `/patient/profile` | `MedicalProfileScreen` | Profile sections | Live |
| `/patient/edit-profile` | `EditProfileScreen` | Blood type, allergies, conditions, medication, surgeries | Live (surgeries need migration `20261116000000`) |
| `/patient/documents` | `MedicalDocumentsScreen` | Documents + extracted data | Live |
| `/patient/upload-document` | `UploadDocumentScreen` | Upload photo / PDF, read lab values (PDF text / OCR), confirm | Live |
| `/patient/document/[id]` | `DocumentViewerScreen` | Original file + values | Live |
| `/patient/lab-review/[id]` | `LabReviewScreen` | Review and confirm extracted lab values | Live |
| `/patient/lab-trend` | `LabTrendScreen` | One analysis over time, with source documents | Live |
| `/patient/xray-results` | `XrayResultsScreen` | Previous LungVision analyses | Experimental |
| `/patient/intelligence` | `MedicalIntelligenceScreen` | Gemini summary with sources, explicit consent | Needs config (`GEMINI_API_KEY`, migration) |
| `/patient/intake` | `IntakeScreen` | Voice → transcript (ElevenLabs) → form (Gemini), saved on the device | Needs config (`ELEVENLABS_API_KEY`) |
| `/patient/smart-care` | `SmartCareScreen` | Symptoms (text / voice → transcript checked by the patient) → emergency rules → 1–3 specialties (Gemini, with consent) → doctors | Needs config (`GEMINI_API_KEY`, `ELEVENLABS_API_KEY` for voice, migration `20261117000000`) |
| `/patient/specialties` | `SpecialtySearchScreen` | Manual specialty search, no AI | Live (catalog) |
| `/patient/specialty/[id]` | `SpecialtyDoctorsScreen` | Verified doctors of a specialty with free slots (14 days); empty state with alternatives | Needs migration `20261117000000` |
| `/patient/book/[doctorId]` | `BookAppointmentScreen` | Pick a free slot, optional note, send a request | Needs migration `20261117000000` |
| `/patient/appointments` | `AppointmentsScreen` | Requests, proposals to confirm, confirmed, history; cancel | Needs migration `20261117000000` |
| `/patient/emergency` | `EmergencyPassportScreen` | Single-use 5-minute QR + access audit | Live |
| `/patient/doctor-access` | `DoctorAccessScreen` | Grants: give / revoke, access history | Live |
| `/patient/grant-access` | `GrantAccessScreen` | Pick doctor, sections, 1 h / 24 h / 7 days | Live |
| `/patient/summary` | `MedicalSummaryScreen` | What a doctor with every section sees | Live |
| `/history/[id]` | `MedicalEventDetailScreen` | Event details | Live |
| `/onboarding` | `OnboardingScreen` | First-run minimal profile (skippable) | Live |
| `/patient/passport` | redirect | → `/patient/doctor-access` (legacy link) | Redirect |

### Doctor

| Route | Screen | What it does | Status |
|---|---|---|---|
| `/` | `DoctorDashboardScreen` | Dashboard: scan CTA, own access stats, recent accesses, patients, doctor code | Live |
| `/patients` | `DoctorPatientsScreen` | **Authorised patients**: every grant with its status | Live |
| `/scan` | `EmergencyScanScreen` | **Scan QR** of an Emergency Passport | Live |
| `/files` | `DoctorRecordsScreen` *(new)* | **Medical records**: active consents only, with the shared sections + access log | Live |
| `/settings` | `SettingsScreen` | **Profile** | Live |
| `/doctor/appointments` | `DoctorAppointmentsScreen` | Requests (accept / reject / propose another slot) + publish / delete own free slots | Needs migration `20261117000000` |
| `/access` | `DoctorAccessLogScreen` | Emergency access log | Live (opened from Medical records) |
| `/doctor/patient/[id]` (+ `documents`, `labs`, `document/[docId]`, `intelligence`) | patient-access screens | Only the granted sections; re-checked on every request | Live |
| `/doctor`, `/doctor/emergency`, `/doctor/scan`, `/doctor/patient/[id]/lungvision` | legacy routes / redirects | Kept so old links keep working | Redirect |

### Shared
`/login`, `/register`, `/auth/callback`, `+not-found`.

## 2. Features and their real status

- **Medical profile** — Live. Blood type is the only basic field editable in the app; date of birth, sex, height /
  weight and emergency contact are shown when present but not editable in the app.
- **Documents + OCR** — Live. Lab values from PDF text or local OCR on our server; only values the patient confirms
  are stored as lab values.
- **Timeline & lab trends** — Live, built from the record and confirmed values.
- **AI Medical Intelligence (Gemini)** — needs `GEMINI_API_KEY` and migration `20261116000000`. Explicit consent,
  minimal facts, every statement grounded, rule-based priority, latest summary only, deleted on consent revoke.
- **LungVision** — Experimental (DenseNet121 + Grad-CAM). Informative only.
- **Voice intake** — needs `ELEVENLABS_API_KEY` (+ Gemini). Without the keys the server returns 503 for real
  accounts; the example form is shown only in demo mode.
- **Smart Care** — emergency rules (regex, RO / EN, negations) run before any AI and show 112 guidance; Gemini only
  with the AI consent, strict schema, catalog ids only, max 3 specialties and 3 clarification questions, no diagnosis /
  percentages / scores / treatment (filtered on the server). Voice goes to ElevenLabs only after an explicit switch.
  Booking: request → doctor accepts / rejects / proposes another slot → patient confirms. Doctors appear once an
  admin assigns their specialty (`doctor_specialties`) and they publish free slots.
- **Emergency Passport** — Live: single-use QR, 5 minutes, emergency data only, audited.
- **Doctor Access & Consent** — Live: per-section, time-limited, revocable, checked on every request.
- **FHIR** — *not implemented*. There is no FHIR import / export in the app or the backend, so the UI does not
  mention it.

## 3. New navigation

Patient bottom bar: **Home · My record · AI Insights · Transfer & Access · Profile**

| Section | Step | Contains |
|---|---|---|
| Home | — | Emergency Passport (one tap), recommended next step, record checklist, snapshot, journey cards |
| My record | COLLECT | Medical profile, voice intake, documents (+ upload), lab results, timeline |
| AI Medical Insights | UNDERSTAND | Smart Care (which specialty + manual search), AI summary (status, consent), LungVision, previous analyses, data-origin legend |
| Transfer & Access | CONTROL → CONNECT | Emergency Passport, doctor access (active grants), appointments, “What a doctor sees” |
| Profile | — | Account, appearance, “Show the checklist again”, all features (Explore), backend info, sign out |

Doctor bottom bar: **Dashboard · Authorised patients · Scan QR · Medical records · Profile**

Older tab routes (`/history`, `/analysis`, `/explore`, `/access`) still open; they are kept out of the bar and keep
their section highlighted (`parent` in `frontend/config/navigation.ts`). The Emergency Passport stays one tap away
from Home and Transfer & Access (and in Profile).

## 4. Flows

**Patient — first week**
1. Sign up → optional onboarding (blood type, allergies, conditions, medication).
2. Home shows the *recommended next step* = first unfinished checklist item.
3. COLLECT: upload a document → check the auto-extracted values → confirm → success screen offers “See lab trends” /
   “Refresh AI summary”.
4. UNDERSTAND: AI Insights → read what is sent → consent → generate → check sources.
5. CONTROL / CONNECT: Transfer & Access → give a doctor 24 h access to chosen sections, or show the 5-minute QR.

**Doctor**
1. Patient grants access using the doctor's name or code.
2. Medical records → open summary / documents / labs / AI summary (only the shared sections).
3. Emergency: Scan QR → emergency data → visible in the access log.
4. Expired or revoked consent → “no access” state; nothing is shown.

## 5. Duplicated, hidden or hard-to-find features (before → after)

| Issue | Change |
|---|---|
| Timeline, LungVision and Explore were tabs while documents, AI summary, doctor access lived only in quick actions / Explore | Grouped into the four story sections; Explore moved to Profile → “All features” |
| Upload document reachable only from the Documents screen or Explore | Next-step card on Home, CTA in My record, empty states, help links |
| X-ray results reachable only from a ghost button in LungVision | Row in AI Insights |
| Medical summary (“what a doctor sees”) reachable only from Doctor access / Explore | Row in Transfer & Access |
| AI summary status (consent / not configured) visible only after opening it | Status line in AI Insights |
| Lab trends hidden behind a segmented control in the Timeline | “Lab results” row in My record with the confirmed count |
| Doctor access log was a tab of its own | Inside Medical records, next to the records |
| Emergency Passport on Home, Profile and Explore | Kept (fast access is a requirement); one shared `EmergencyCard` component |
| Patient summary card vs AI summary | Kept separate and labelled: structured record vs experimental AI |

## 6. Contextual UX system

- **Help (?)** — `frontend/help/`: `HelpProvider` (one bottom sheet), `HelpButton`, `helpRegistry.ts` (topic → related
  links). Content in `help.topics.<topic>` (RO / EN): title, intro, what you can do, steps, FAQ. Static, offline, no AI.
  `ScreenContainer help="<topic>"` places the button top-right on tab screens or in the navigation header.
- **Smart onboarding** — `useRecordProgress`: blood type set · ≥1 history entry · ≥1 document · ≥1 confirmed lab
  value · AI summary available or opened. Hideable per account/device; “Show again” in Profile.
- **Data origin** — `DataOriginBadge` / `DataOriginLegend`: *Confirmed* (patient entered / confirmed),
  *Auto-extracted* (OCR / AI, to review), *Experimental AI*. Used on documents, lab review, upload success, X-ray
  results, AI summary items and AI Insights.
- **Explainers** — `FeatureExplainer`: OCR, Gemini, LungVision, QR, consent (and voice). No FHIR (not implemented).
- **Success → next step** — `NextSteps` after an upload and after confirming lab values.
- **Empty states** — explanatory text + CTA (documents, timeline, X-rays, doctor records).
- No alarmist wording, no invented clinical scores; demo data appears only in MOCK mode.
