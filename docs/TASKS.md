# Tasks

P0 = needed for the demo · P1 = makes it strong · P2 = only if time is left.
"Done" = merged to `main`, checks pass, works in the demo flow.

## Developer 1 — AI (`ai/`)

| ID | Pri | Task | Depends on | Done when |
|---|---|---|---|---|
| AI-1 | P0 | Pick dataset + final label list, write it in `ai/config.py` | — | labels committed, dataset source noted in `ai/README.md` |
| AI-2 | P0 | Train DenseNet121 (transfer learning) in a notebook/`training/train.py` | AI-1 | weights saved, shared link in `ai/models/README.md` |
| AI-3 | P0 | Implement `predict_xray()` (model.py load + preprocess + inference) | AI-2 | returns contract dict with `is_demo: False` on a real X-ray, < 3 s on CPU |
| AI-4 | P0 | Grad-CAM overlay → `heatmap_png_base64` | AI-3 | heatmap visible in the app via backend |
| AI-5 | P1 | Evaluation: AUROC/sensitivity per label + confusion matrix | AI-2 | numbers + 3 Grad-CAM examples in `ai/evaluation/` (for the pitch) |
| AI-6 | P2 | Reject non-X-ray images (low confidence / simple classifier) | AI-3 | random photo → clear "not a chest X-ray" result |

## Developer 2 — Mobile (repo root)

| ID | Pri | Task | Depends on | Done when |
|---|---|---|---|---|
| MO-1 | P0 | Polish existing screens + demo flow patient → QR → doctor | — | full flow works in MOCK mode on a phone |
| MO-2 | P0 | Real QR: show `qrPayload` (`react-native-qrcode-svg` + `react-native-svg`) | — | passport screen shows scannable QR |
| MO-3 | P0 | Real scanner: `expo-camera` `CameraView` barcode scanning → `redeemAccess` | MO-2 | scanning the patient phone opens Patient Summary |
| MO-4 | P0 | Switch to API mode and test every screen against the backend | BE-1..BE-4 | all screens work with `EXPO_PUBLIC_USE_MOCKS=false` |
| MO-5 | P1 | Auth0 login (`expo-auth-session`, Expo Go compatible) + `setAuthTokenProvider` + role → patient/doctor area | BE-5 | login works, token sent, doctor area only for doctors |
| MO-6 | P1 | Play voice summary (`expo-audio`) | BE-7 | audio plays on Patient Summary |
| MO-7 | P2 | PDF upload (`expo-document-picker`), onboarding, empty-state polish | — | — |

## Developer 3 — Backend (`backend/`)

| ID | Pri | Task | Depends on | Done when |
|---|---|---|---|---|
| BE-1 | P0 | PostgreSQL models + migrations (patients, allergies, diagnoses, treatments, documents, xrays, access_grants); seed demo patient | — | `GET /patients/me` reads from DB |
| BE-2 | P0 | Secure QR tokens in DB: random token, store hash, expiry, scopes, revoke, audit who redeemed | BE-1 | grant/redeem pass tests incl. expired + wrong scope |
| BE-3 | P0 | LungVision integration: `USE_AI_MODEL=true`, store image + result, return `heatmapUrl` | AI-3 | real prediction returned to the app |
| BE-4 | P0 | Gemini document extraction → `DocumentExtraction` JSON (structured output), store it | BE-1 | real document → extracted fields in the app |
| BE-5 | P1 | Auth0 JWT validation + roles in `core/security.py` | — | 401 without token, 403 wrong role |
| BE-6 | P1 | Serve uploaded files (`fileUrl`, `imageUrl`) | BE-1 | images open in the app |
| BE-7 | P1 | Voice summary: Gemini text + ElevenLabs audio URL | BE-1 | `audioUrl` playable |
| BE-8 | P2 | Deploy (Railway/Render/Fly) so the demo doesn't depend on local Wi-Fi | BE-1 | public HTTPS URL in mobile `.env` |

## Before the hackathon starts (everyone)

- [ ] Clone the repo, run your part (see TEAM_GUIDE) and the app in Expo Go on your phone.
- [ ] Read `docs/API_CONTRACT.md` together (15 min) and agree on the labels (AI-1).
- [ ] Create accounts/keys: Auth0 tenant, Gemini API key, ElevenLabs key (keys go only in `backend/.env`, shared privately).
- [ ] Install PostgreSQL locally or create a free hosted DB (Neon/Supabase Postgres).
- [ ] AI: download the dataset and check GPU access (Colab/Kaggle) — training is the long pole.
