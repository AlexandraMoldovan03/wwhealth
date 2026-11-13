# Mobile architecture (Expo app)

Owner: **Developer 2 (Mobile)**. System overview: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Layers

```
app/                     ROUTES — tiny files, re-export a screen
  (tabs)/                Home(Patient Dashboard) · Explore · LungVision · History · Settings
  patient/*              Medical Profile, Documents, Upload, X-ray Results, Passport
  doctor/*               Doctor Dashboard, QR Scanner, patient/[id]/{index,documents,lungvision}
      ▼
src/screens/{patient,doctor}/   SCREENS — layout only
      ▼ uses
src/components/ui/       generic UI (AppButton, AppCard, ListRow, DemoNotice, …)
src/features/<module>/   module UI + logic hooks (lungvision, documents, history, patient, doctor)
      ▼ calls
src/hooks/               useAsync (load on mount), useSubmit (button actions), useImagePicker
      ▼ calls
src/services/backend.ts  `api` ─┬─ MOCK → services/mock/mockApi.ts (in-memory)
                                └─ API  → services/api/realApi.ts → apiClient (fetch) → FastAPI
```

**Rules:** screens never call `fetch`; services never import React; all backend types live in
`src/types/medical.ts` and must match `docs/API_CONTRACT.md`.

## Directories

| Directory | What goes there |
|---|---|
| `app/` | Expo Router routes. `_layout.tsx` = navigator. Header titles: `STACK_SCREENS` in `src/constants/navigation.ts`. |
| `src/screens/patient`, `src/screens/doctor` | One component per screen. |
| `src/components/ui/` | Reusable, theme-aware building blocks. No business logic. |
| `src/features/<module>/` | Module components (`components/`) + hooks (`use*.ts`). |
| `src/services/api/` | `apiClient`, `ApiError`, `ENDPOINTS`, `realApi`. |
| `src/services/mock/` | `mockApi` (same interface as `realApi`). |
| `src/constants/` | `theme.ts` (design tokens), `config.ts` (`USE_MOCKS`, API URL, disclaimer), `navigation.ts`. |
| `src/context/` | Theme provider (add the Auth0 session provider here later). |
| `src/data/` | Static content + mock patient. |
| `src/types/` | `medical.ts` (contract types), `wwhealthApi.ts` (API interface). |
| `src/utils/` | Pure helpers (dates, files, search, errors). |

## Example flow — LungVision "Analyze"

`LungVisionScreen` → `useXrayAnalysis()` (`src/features/lungvision/`) → `useImagePicker` gets a URI →
`useSubmit(api.analyzeXray)` → MOCK: random predictions with `isDemo: true` / API: multipart
`POST /api/v1/xray/analyze` → `<XrayResultCard>` (DEMO badge + disclaimer, Grad-CAM placeholder until `heatmapUrl`).

## Doctor flow

QR Scanner (code entry, camera later) → `api.redeemAccess` → result saved in
`src/features/doctor/doctorSession.ts` (memory) → `/doctor/patient/[id]` screens read it via `useDoctorPatient()`.

## Conventions

- TypeScript strict, no `any`. Functional components, named exports; route files `export default`.
- Components `PascalCase.tsx`, hooks `useX.ts`, other files `camelCase.ts`. Import via `@/`.
- No hard-coded colours/sizes — tokens from `@/constants/theme`, colours from `useTheme()`.
- Anything AI/simulated shows `<DemoNotice />` or a DEMO `Badge`.
- Only Expo Go–compatible packages, added with `npx expo install`.
- Before pushing: `npm run check`.
