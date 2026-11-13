# Architecture

The goal: anyone on the team can find where to change something in under a minute.

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│ app/              ROUTES — thin files, define URLs/navigation │
└──────────────┬───────────────────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────────────────┐
│ src/screens/      SCREENS — compose UI, no business logic     │
│   uses ▸ src/components/ui      (generic building blocks)     │
│   uses ▸ src/features/*/components (feature-specific UI)      │
└──────────────┬───────────────────────────────────────────────┘
               ▼ calls hooks
┌──────────────────────────────────────────────────────────────┐
│ src/features/*/use*.ts, src/hooks/   LOGIC — state, loading,  │
│                                       errors, user actions    │
└──────────────┬───────────────────────────────────────────────┘
               ▼ calls services
┌──────────────────────────────────────────────────────────────┐
│ src/services/     DATA ACCESS — mock OR real API (one switch) │
│   aiService.ts ─┬─ USE_MOCK_API=true  → mockAiService.ts      │
│                 └─ USE_MOCK_API=false → apiClient → FastAPI   │
└──────────────┬───────────────────────────────────────────────┘
               ▼ HTTP (fetch)
┌──────────────────────────────────────────────────────────────┐
│ Python FastAPI backend (not in this repo)                     │
│   → ML / CV models, Supabase, external APIs, secret keys      │
└──────────────────────────────────────────────────────────────┘
```

**Rule of thumb:** screens never call `fetch` directly, and services never import React.

## Directories

| Directory | Responsibility | Example |
|---|---|---|
| `app/` | Expo Router routes. Each file = a URL. `_layout.tsx` = a navigator. Keep these files tiny: they re-export a screen. | `app/(tabs)/explore.tsx` |
| `app/(tabs)/` | Group shown as bottom tabs. Parentheses = not part of the URL. | `/explore`, not `/(tabs)/explore` |
| `src/screens/` | One component per screen. Layout + composition of components. | `HomeScreen.tsx` |
| `src/components/ui/` | Generic, theme-aware building blocks used everywhere. No feature knowledge. | `AppButton`, `AppCard`, `AppText`, `AppInput`, `ScreenContainer`, `SectionHeader`, `LoadingState`, `EmptyState`, `ErrorState`, `Badge`, `IconBadge` |
| `src/features/<name>/` | Everything specific to one feature: its components (`components/`) and its logic hooks (`use*.ts`). | `features/analysis/useImageAnalysis.ts` |
| `src/services/api/` | `apiClient` (fetch wrapper), `ApiError`, `ENDPOINTS`. | `apiClient.get<T>(path)` |
| `src/services/ai/` | AI service + its mock. The only AI entry point for the UI. | `analyzeImage(uri)` |
| `src/services/*.ts` | Domain services (history, health…). Each decides mock vs real. | `getHistory()` |
| `src/constants/` | `theme.ts` (design tokens), `config.ts` (API URL, flags), `navigation.ts` (tabs). | |
| `src/context/` | React Context providers. Currently only theme. Add auth here later. | `ThemeContext.tsx` |
| `src/hooks/` | Reusable hooks not tied to a feature. | `useTheme`, `useAsync` |
| `src/data/` | Mock/demo data. Shapes match the `types/`. | `history.ts` |
| `src/types/` | Shared TypeScript interfaces — the contract with the backend. | `AnalysisResult` |
| `src/utils/` | Pure functions, no React. | `formatDateTime`, `filterByQuery` |
| `assets/` | Static files: `images/` (icon, splash, pictures), `icons/` (custom icons). | |

## Data flow example — "Analyze" button

1. `AnalysisScreen` renders `<AppButton onPress={analyze} />`.
2. `analyze` comes from `useImageAnalysis()` (`src/features/analysis/`), which sets `status='loading'`.
3. The hook calls `analyzeImage(uri)` from `src/services/ai/aiService.ts`.
4. `aiService` checks `USE_MOCK_API` (from `src/constants/config.ts`):
   - `true` → `mockAnalyzeImage()` returns a fake `AnalysisResult` with `isDemo: true`.
   - `false` → `apiClient.upload('/ai/analyze-image', { file })` sends multipart/form-data to FastAPI.
5. Errors become `ApiError` → `getErrorMessage()` → shown by `<ErrorState />`.
6. Result → `<AnalysisResultCard />` (shows a "DEMO" badge when `isDemo`).

## Navigation

- `app/_layout.tsx` — root **Stack**. Contains the tab group plus any screen that should slide in on top (details, modals).
- `app/(tabs)/_layout.tsx` — **bottom tabs** (`expo-router/js-tabs`). Tab order/titles/icons come from `src/constants/navigation.ts`.
- Navigate with `router.push('/history/h1')`, `router.navigate('/explore')`, `router.back()` or `<Link href="/explore">`.
- Typed routes are enabled (`experiments.typedRoutes`): invalid paths are TypeScript errors after `expo start` generates `.expo/types`.

## Theming

- `src/constants/theme.ts` holds `lightColors`, `darkColors`, `spacing`, `radius`, `typography`, `sizes`, `shadows`.
- `ThemeProvider` (in `src/context/ThemeContext.tsx`) picks light/dark from the user preference (saved with AsyncStorage) or the system.
- Components read colours with `const { colors } = useTheme();` and spacing via `import { spacing } from '@/constants/theme'`.

## Code conventions

- **TypeScript strict**, no `any` (ESLint enforces it). Use `unknown` + narrowing, or add a type in `src/types/`.
- **Functional components** + hooks only. Named exports (`export function HomeScreen`); route files use `export default`.
- **File names:** components `PascalCase.tsx`, hooks `useCamelCase.ts`, everything else `camelCase.ts`.
- **Imports:** use the `@/` alias for `src/` (`import { AppButton } from '@/components/ui'`).
- **Styling:** `StyleSheet.create` at the bottom of the file. No hard-coded colours, font sizes or spacing — always tokens. Dynamic colours go inline from `useTheme()`.
- **Small files:** if a screen grows past ~150 lines, extract components into `src/features/<name>/components/`.
- **Logic out of screens:** state + side effects in a `use*` hook in the feature folder.
- **Mock vs real:** each service function has an `if (USE_MOCK_API)` branch. Static content (feature cards, quick actions) can be imported from `src/data/` directly; anything that will later come from the backend should go through a service (like `getHistory()`).
- Before pushing: `npm run check`.
