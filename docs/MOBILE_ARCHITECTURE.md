# Mobile architecture (Expo app)

Owner: **Developer 2 (Mobile)**. System overview: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Layers

```
app/                     ROUTES — tiny files, re-export a screen
  (tabs)/                Home(Patient Dashboard) · Explore · LungVision · History · Settings
  patient/*              Medical Profile, Documents, Upload, X-ray Results, Passport
  doctor/*               Doctor Dashboard, QR Scanner, patient/[id]/{index,documents,lungvision}
      ▼
frontend/screens/<role>/<feature>/   SCREENS + their components/ and hooks (role = patient·doctor·auth·shared)
      ▼ uses
frontend/design-system/  theme, ThemeContext, AppTabBar, generic UI (AppButton, AppCard, ListRow, …)
frontend/screens/shared/components/  UI used by both patient and doctor (DocumentList, XrayResultCard, …)
      ▼ calls
frontend/hooks/          useAsync (load on mount), useSubmit (button actions), useImagePicker
      ▼ calls
frontend/services/backend.ts  `api` ─┬─ MOCK → services/mock/mockApi.ts (in-memory)
                                └─ API  → services/api/realApi.ts → apiClient (fetch) → FastAPI
```

**Rules:** screens never call `fetch`; services never import React; all backend types live in
`frontend/types/medical.ts` and must match `docs/API_CONTRACT.md`.

## Directories

| Directory | What goes there |
|---|---|
| `app/` | Expo Router routes. `_layout.tsx` = navigator. Header titles: `STACK_SCREENS` in `frontend/config/navigation.ts`. |
| `frontend/screens/{patient,doctor,auth,shared}/<feature>/` | Screen(s) + `components/` + hooks of one feature, `index.ts` exports the screens. |
| `frontend/screens/shared/components/` | Components used by several roles/features. |
| `frontend/design-system/` | `theme.ts` (tokens), `ThemeContext`, `useTheme`, `motion`, `AppTabBar`, `components/` (generic UI). No business logic. |
| `frontend/config/` | `config.ts` (`USE_MOCKS`, API URL, disclaimer), `navigation.ts` (tabs, header titles, sheets). |
| `frontend/services/api/` | `apiClient`, `ApiError`, `ENDPOINTS`, `realApi`. |
| `frontend/services/mock/` | `mockApi` + `mockPatient` (same interface as `realApi`). |
| `frontend/services/auth/` | Supabase Auth (`authService`), `useCurrentUser`, `useSignedIn`. |
| `frontend/i18n/` | i18next setup + `locales/{ro,en}.json`. |
| `frontend/types/` | `medical.ts` (contract types), `wwhealthApi.ts` (API interface). |
| `frontend/utils/` | Pure helpers (dates, files, search, errors). |

## Example flow — LungVision "Analyze"

`LungVisionScreen` → `useXrayAnalysis()` (`frontend/screens/patient/lungvision/`) → `useImagePicker` gets a URI →
`useSubmit(api.analyzeXray)` → MOCK: random predictions with `isDemo: true` / API: multipart
`POST /api/v1/xray/analyze` → `<XrayResultCard>` (DEMO badge + disclaimer, Grad-CAM placeholder until `heatmapUrl`).

## Doctor flow

QR Scanner (code entry, camera later) → `api.redeemAccess` → result saved in
`frontend/screens/doctor/patient-access/doctorSession.ts` (memory) → `/doctor/patient/[id]` screens read it via `useDoctorPatient()`.

## Conventions

- TypeScript strict, no `any`. Functional components, named exports; route files `export default`.
- Components `PascalCase.tsx`, hooks `useX.ts`, other files `camelCase.ts`. Import via `@/`.
- No hard-coded colours/sizes — tokens from `@/design-system/theme`, colours from `useTheme()`.
- Anything AI/simulated shows `<DemoNotice />` or a DEMO `Badge`.
- Only Expo Go–compatible packages, added with `npx expo install`.
- Before pushing: `npm run check`.
