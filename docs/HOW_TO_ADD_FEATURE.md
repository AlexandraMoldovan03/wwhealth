# How to add a feature (mobile)

Recipes with real file names. Copy, paste, rename.

---

## 1. Add a new page

### a) A new bottom tab (e.g. "Camera")

**Step 1 — create the screen** `src/screens/CameraScreen.tsx`:

```tsx
import { AppButton, AppText, ScreenContainer } from '@/components/ui';

export function CameraScreen() {
  return (
    <ScreenContainer>
      <AppText variant="title">Camera</AppText>
      <AppText color="textMuted">My new feature.</AppText>
      <AppButton title="Do something" icon="camera-outline" onPress={() => {}} />
    </ScreenContainer>
  );
}
```

**Step 2 — create the route** `app/(tabs)/camera.tsx`:

```tsx
export { CameraScreen as default } from '@/screens/CameraScreen';
```

**Step 3 — register the tab** in `src/constants/navigation.ts`:

```ts
export const TABS: TabConfig[] = [
  // ...existing tabs (keep max 5)
  { name: 'camera', title: 'Camera', icon: 'camera-outline', iconFocused: 'camera' },
];
```

> In SDK 58 only tabs declared in the layout appear in the bar, so step 3 is required. Keep it to ~5 tabs.

### b) A secondary page (opens on top, with a back button)

**Route** `app/profile.tsx` → URL `/profile`:

```tsx
export { ProfileScreen as default } from '@/screens/ProfileScreen';
```

**Header title** in `src/constants/navigation.ts` → `STACK_SCREENS`:

```ts
{ name: 'profile', title: 'Profile' },
```

**Navigate to it** from anywhere:

```tsx
import { router } from 'expo-router';

<AppButton title="Open profile" onPress={() => router.push('/profile')} />
```

Inside stack pages use `<ScreenContainer edges={['bottom']}>` because the header already covers the top safe area.

### c) A page with a parameter

`app/items/[id].tsx` → `/items/42`:

```tsx
import { useLocalSearchParams } from 'expo-router';

export default function ItemRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ItemScreen id={id} />;
}
```

Navigate: `router.push({ pathname: '/items/[id]', params: { id: '42' } })`.
See the working examples in `app/history/[id].tsx` and `app/doctor/patient/[id]/`.

### d) A modal

```tsx
// app/_layout.tsx
<Stack.Screen name="upload-modal" options={{ presentation: 'modal', title: 'Upload' }} />
```

---

## 2. Add a component

**Generic & reusable** (used by many features) → `src/components/ui/`.
**Specific to one feature** → `src/features/<feature>/components/`.

Example `src/components/ui/InfoRow.tsx`:

```tsx
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/constants/theme';

import { AppText } from './AppText';

export interface InfoRowProps {
  label: string;
  value: string;
}

export function InfoRow({ label, value }: InfoRowProps) {
  return (
    <View style={styles.row}>
      <AppText color="textMuted">{label}</AppText>
      <AppText variant="subheading">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
});
```

Then export it from `src/components/ui/index.ts`:

```ts
export * from './InfoRow';
```

Use it: `import { InfoRow } from '@/components/ui';`

Rules: use `AppText` for text, `useTheme()` for colours, tokens from `@/constants/theme` for sizes.

### Available UI components

| Component | Usage |
|---|---|
| `AppText` | `<AppText variant="title" color="textMuted">` — variants: display, title, heading, subheading, body, caption, label |
| `AppButton` | `<AppButton title="Save" icon="save-outline" variant="primary" loading={x} onPress={…} />` — variants: primary, secondary, outline, ghost, danger, inverse |
| `AppCard` | `<AppCard onPress={…}>…</AppCard>` (pressable if `onPress` given) |
| `AppInput` | `<AppInput label="Email" icon="mail-outline" value={v} onChangeText={setV} error={err} />` |
| `ScreenContainer` | Root of every screen. `scroll={false}` for FlatList screens, `refreshControl` for pull-to-refresh |
| `SectionHeader` | `<SectionHeader title="Recent" actionLabel="See all" onActionPress={…} />` |
| `LoadingState` / `EmptyState` / `ErrorState` | Async UI states |
| `Badge`, `IconBadge` | Status pills, icon squares |

Icons: any name from the **Ionicons** set at https://icons.expo.fyi (`icon="heart-outline"`).

---

## 3. Connect a backend endpoint

All HTTP goes through **one interface**, `WWHealthApi` (`src/types/wwhealthApi.ts`), implemented twice:

| File | Mode |
|---|---|
| `src/services/api/realApi.ts` | API — real `fetch` to FastAPI (via `apiClient`) |
| `src/services/mock/mockApi.ts` | MOCK — in-memory demo data, no backend |
| `src/services/backend.ts` | exports `api` = one of the two, based on `EXPO_PUBLIC_USE_MOCKS` |

Screens and hooks only ever do `import { api } from '@/services/backend'`.

### Switch to the real backend

`.env` (copy from `.env.example`), then restart with `npx expo start --clear`:

```bash
EXPO_PUBLIC_USE_MOCKS=false
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:8000   # laptop LAN IP (macOS: ipconfig getifaddr en0), NOT localhost
```

### Add a new endpoint (example: `GET /api/v1/appointments`)

1. **Contract** — add it to `docs/API_CONTRACT.md` and agree with the backend dev.
2. **Types** — `src/types/medical.ts`: `export interface Appointment { id: string; date: string; doctor: string }`
3. **Path** — `src/services/api/endpoints.ts`: `appointments: '/api/v1/appointments',`
4. **Interface** — `src/types/wwhealthApi.ts`: `getAppointments(): Promise<Appointment[]>;`
5. **Real** — `src/services/api/realApi.ts`: `getAppointments: () => apiClient.get(ENDPOINTS.appointments),`
6. **Mock** — `src/services/mock/mockApi.ts`:
   ```ts
   async getAppointments() {
     await delay(MOCK_DELAY_MS);
     return [{ id: 'ap1', date: '2026-12-01T10:00:00Z', doctor: 'Dr. Demo' }];
   },
   ```
   TypeScript fails until both implementations have the method — that's intended.
7. **Use it**:
   ```tsx
   const { data, isLoading, error, reload } = useAsync(api.getAppointments);   // load on mount
   const save = useSubmit(api.analyzeXray);  // on button press: save.run(file), save.isLoading, save.data
   ```

`apiClient` methods: `get`, `post` (JSON), `put`, `delete`, `upload` (multipart/form-data). Errors throw
`ApiError` (`status`, `userMessage`); FastAPI's `{"detail": "..."}` becomes the message.
Auth (later, Auth0): `setAuthTokenProvider(async () => accessToken)` in `src/services/api/client.ts`
adds `Authorization: Bearer …` to every request.

---

## 4. Replace a DEMO AI result with a real one

The app does not change: it already calls `api.analyzeXray(file)` → `POST /api/v1/xray/analyze`.

1. **AI dev** implements `predict_xray()` in `ai/inference/predict.py` (contract in its docstring).
2. **Backend dev** sets `USE_AI_MODEL=true` in `backend/.env`; `backend/app/services/xray_service.py`
   converts the result to `XrayAnalysis` (Grad-CAM → `heatmapUrl` data URI, `isDemo: false`).
3. **Mobile dev** sets `EXPO_PUBLIC_USE_MOCKS=false`. `HeatmapPreview` shows the heatmap as soon as
   `heatmapUrl` is not null, and the DEMO badge disappears when `isDemo` is false.

Same pattern for documents (Gemini → `document_service.py`) and voice (ElevenLabs → `voice_service.py`).

---

## 5. Change the theme

All in `src/constants/theme.ts`:

- **Primary colour:** change `palette.brand` (light) and `palette.brandDark` (dark). Also update `primaryMuted`
  (same colour at ~12% opacity) in `lightColors` / `darkColors`.
- **Backgrounds / text:** edit `lightColors` and `darkColors`.
- **Spacing:** `spacing` (4-pt grid). **Corners:** `radius`. **Fonts:** `typography`.

New colour token? Add it to the `ThemeColors` interface, then to **both** `lightColors` and `darkColors` —
TypeScript will tell you if one is missing. Use it with `const { colors } = useTheme(); colors.myToken`.

Note: `Badge`/`IconBadge` tint by appending alpha to the colour (`${color}1F`), so keep semantic colours as 6-digit hex.

**Default theme:** users pick Light / Dark / System in Settings (saved on the device).
The default is `'system'` in `src/context/ThemeContext.tsx`.

**Custom font:** `npx expo install expo-font @expo-google-fonts/inter`, load it in `app/_layout.tsx`
with `useFonts`, then add `fontFamily` to the variants in `typography`.

---

## 6. Add images and icons

- Put files in `assets/images/` (or `assets/icons/`).
- Use: `<Image source={require('../../assets/images/logo.png')} style={{ width: 80, height: 80 }} />`
  (path is relative to the file using it).
- App icon / splash: replace `assets/images/icon.png`, `splash-icon.png`, `android-icon-*.png` (paths in `app.json`).
- UI icons: use Ionicons names (https://icons.expo.fyi) in any `icon` prop — no files needed.

---

## 7. Edit demo data

| File | Shown in |
|---|---|
| `src/data/quickActions.ts` | Patient dashboard → Quick actions |
| `src/data/activity.ts` | Patient dashboard → Recent activity |
| `src/data/features.ts` | Explore cards (each `route` opens a screen) |
| `src/data/mockPatient.ts` | MOCK patient record: profile, history, documents, X-rays, demo QR code |
| `src/services/mock/mockApi.ts` | Simulated AI / Gemini / access / voice responses |

---

## Checklist before pushing

```bash
npm run check   # TypeScript + ESLint
```
