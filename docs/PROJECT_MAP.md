# PROJECT MAP — unde găsesc ce?

`@/` = `frontend/` (alias din `tsconfig.json`).

## Răspunsuri rapide

| Vreau să schimb… | Fișier |
|---|---|
| **Designul global** (culori, spațieri, fonturi, umbre, raze) | `frontend/design-system/theme.ts` |
| Tema light/dark | `frontend/design-system/ThemeContext.tsx` |
| Animații (fade, spring, haptic) | `frontend/design-system/motion.ts` |
| Componente UI generice (AppButton, AppCard, ListRow…) | `frontend/design-system/components/` (exportate din `frontend/design-system/index.ts`) |
| **Bara de navigare jos** (aspect) | `frontend/design-system/AppTabBar.tsx` |
| Ce taburi vede fiecare rol + titluri header + ecrane sheet | `frontend/config/navigation.ts` |
| URL backend / mock on-off | `.env` → `frontend/config/config.ts` |
| **Traduceri** RO / EN | `frontend/i18n/locales/ro.json`, `frontend/i18n/locales/en.json` |
| **Apeluri API** (frontend) | `api` din `frontend/services/backend.ts` → real: `frontend/services/api/realApi.ts`, căi: `frontend/services/api/endpoints.ts`, mock: `frontend/services/mock/mockApi.ts` |
| Autentificare (Supabase Auth, rol curent) | `frontend/services/auth/` |
| Tipuri comune frontend ⇄ backend | `frontend/types/` (contract: `docs/API_CONTRACT.md`) |
| **Rute API** (backend FastAPI) | `backend/app/api/routes/*.py` (logică: `backend/app/services/`, modele JSON: `backend/app/schemas/`) |
| **Modelul AI** LungVision | inferență: `backend/app/ml/lungvision/`, greutăți: `backend/models/lungvision_best.pth`, antrenare/evaluare: `ai/` |
| Extragerea valorilor din analize (OCR) | `backend/app/services/lab_extraction.py` |
| Baza de date (tabele, RLS) | `supabase/migrations/` — nu edita migrări vechi, adaugă una nouă |

## Unde e fiecare ecran

Rutele (URL-urile) sunt în `app/`; fiecare fișier de rută doar importă un ecran din `frontend/screens/`.

| Rută (`app/…`) | Ecran (`frontend/screens/…`) |
|---|---|
| `(tabs)/index` — Acasă (pacient sau medic) | `shared/home/` → `patient/dashboard/` sau `doctor/dashboard/` |
| `(tabs)/records`, `(tabs)/insights`, `(tabs)/transfer` — secțiunile pacientului (Dosarul meu, AI Insights, Transfer & Access) | `patient/hubs/` |
| `(tabs)/files` — Dosare medicale (medic) | `doctor/records/` |
| Help contextual (?) — `HelpProvider`, registru de subiecte, conținut în `help.*` (i18n) | `frontend/help/` |
| `(tabs)/history`, `history/[id]` — Istoric medical (din Dosarul meu, în afara barei) | `patient/timeline/` |
| `(tabs)/analysis`, `patient/xray-results` — LungVision (din AI Insights) | `patient/lungvision/` |
| `(tabs)/explore` — toate funcționalitățile (din Profil) | `shared/explore/` |
| `(tabs)/settings` | `shared/settings/` |
| `(tabs)/scan`, `doctor/emergency` — medic scanează pașaportul | `doctor/emergency-scan/` |
| `(tabs)/access` — jurnal accesări medic (din Dosare medicale) | `doctor/access-log/` |
| `doctor/index` | `doctor/dashboard/` |
| `(tabs)/patients`, `doctor/patient/[id]/*` (rezumat, documente, analize) — pacienți cu consimțământ | `doctor/patient-access/` |
| `patient/emergency` — Emergency Passport (QR) | `patient/emergency-passport/` |
| `patient/doctor-access`, `patient/grant-access`, `patient/summary` — Acces medici + rezumat | `patient/doctor-access/` |
| `patient/intelligence`, `doctor/patient/[id]/intelligence` — AI Medical Intelligence (Gemini) | `patient/intelligence/`, `doctor/patient-access/` |
| `patient/profile`, `patient/edit-profile` | `patient/medical-profile/` |
| `patient/documents`, `patient/upload-document`, `patient/document/[id]` | `patient/documents/` |
| `patient/lab-review/[id]`, `patient/lab-trend` — analize | `patient/lab-results/` |
| `login`, `register`, `auth/callback` | `auth/` |
| `onboarding` | `shared/onboarding/` |
| `+not-found` | `shared/not-found/` |

Componente folosite și de pacient, și de medic (DocumentList, XrayResultCard, MedicalEventList…): `frontend/screens/shared/components/`.

## Cum e organizat un folder de ecran

```
frontend/screens/patient/documents/
  MedicalDocumentsScreen.tsx   ecranul (nume descriptiv, ușor de căutat)
  UploadDocumentScreen.tsx
  useDocumentPicker.ts         hook doar pentru acest feature
  components/                  componente doar pentru acest feature
  index.ts                     export * din ecrane → importat de app/
```

## Adaug o pagină nouă

1. Ecran: `frontend/screens/<patient|doctor|shared>/<feature>/MyScreen.tsx` + `index.ts` cu `export * from './MyScreen';`
2. Rută: `app/<cale>.tsx` → `export { MyScreen as default } from '@/screens/patient/<feature>';`
3. Titlu header: `STACK_SCREENS` în `frontend/config/navigation.ts` (tab nou: `TABS`, același fișier).
4. Texte: cheile noi în `frontend/i18n/locales/ro.json` și `en.json`.

Detalii: [HOW_TO_ADD_FEATURE.md](./HOW_TO_ADD_FEATURE.md).

## Pornire

```bash
# Backend (FastAPI, port 8000)
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

```bash
# Frontend (Expo Go, port 8081) — din rădăcina repo-ului
npx expo start
```

Verificări: `npm run check` (TypeScript + ESLint), `cd backend && .venv/bin/python -m pytest -q`.

## Structură

```
app/        rute Expo Router (nu muta — URL-urile depind de ele)
frontend/   cod React Native + TS: screens/, design-system/, services/, i18n/, config/, hooks/, types/, utils/
backend/    FastAPI
ai/         antrenare / evaluare DenseNet121 (Python, nu intră în bundle)
supabase/   migrări SQL + scripturi demo
docs/       documentație
assets/     imagini, iconițe
```
Vezi și [UX_INFORMATION_ARCHITECTURE.md](UX_INFORMATION_ARCHITECTURE.md) pentru navigație și fluxuri.
