# How to add a feature

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
  // ...existing tabs
  { name: 'camera', title: 'Camera', icon: 'camera-outline', iconFocused: 'camera' },
];
```

> In SDK 58 only tabs declared in the layout appear in the bar, so step 3 is required. Keep it to ~5 tabs.

### b) A secondary page (opens on top, with a back button)

**Route** `app/profile.tsx` → URL `/profile`:

```tsx
export { ProfileScreen as default } from '@/screens/ProfileScreen';
```

**(Optional) header title** in `app/_layout.tsx`:

```tsx
<Stack.Screen name="profile" options={{ title: 'Profile' }} />
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
See the working example in `app/history/[id].tsx`.

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

## 3. Connect a FastAPI endpoint

### Step 1 — set the URL

`.env` (copy from `.env.example`):

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:8000   # your laptop's LAN IP, NOT localhost
EXPO_PUBLIC_USE_MOCK_API=false
```

Restart with `npx expo start --clear`. Find your IP: macOS `ipconfig getifaddr en0`, Windows `ipconfig`.
Run FastAPI on all interfaces: `uvicorn main:app --host 0.0.0.0 --port 8000`.

### Step 2 — add the path

`src/services/api/endpoints.ts`:

```ts
export const ENDPOINTS = {
  // ...
  predictions: '/ml/predict',
} as const;
```

### Step 3 — add types

`src/types/prediction.ts` (and export it from `src/types/index.ts`):

```ts
export interface PredictionRequest { features: number[] }
export interface PredictionResponse { prediction: string; probability: number }
```

### Step 4 — write the service

`src/services/predictionService.ts`:

```ts
import { MOCK_DELAY_MS, USE_MOCK_API } from '@/constants/config';
import type { PredictionRequest, PredictionResponse } from '@/types';
import { delay } from '@/utils/async';

import { apiClient } from './api/client';
import { ENDPOINTS } from './api/endpoints';

export async function predict(input: PredictionRequest): Promise<PredictionResponse> {
  if (USE_MOCK_API) {
    await delay(MOCK_DELAY_MS);
    return { prediction: 'demo', probability: 0.9 };
  }
  return apiClient.post<PredictionResponse>(ENDPOINTS.predictions, { features: input.features });
}
```

Other client methods:

```ts
apiClient.get<Item[]>('/items', { params: { page: 1 } });         // GET /items?page=1
apiClient.post<Item>('/items', { name: 'A' });                     // JSON POST
apiClient.upload<Result>('/upload', { file: { uri, name, type } }, { note: 'hi' }); // multipart
```

Errors throw `ApiError` (`status`, `body`, `userMessage`). FastAPI's `{"detail": "..."}` becomes the message.

### Step 5 — use it in a screen

Loading on mount:

```tsx
const { data, isLoading, error, reload } = useAsync(getHistory);
if (isLoading) return <LoadingState />;
if (error) return <ErrorState message={error} onRetry={reload} />;
```

On a button press: see `src/features/analysis/useImageAnalysis.ts` for the pattern (status + error state).

### Matching FastAPI side (reference)

```python
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/ai/analyze-image")
async def analyze_image(file: UploadFile = File(...)):
    image_bytes = await file.read()
    # labels = my_model.predict(image_bytes)
    return {
        "id": "a1",
        "createdAt": "2026-01-01T12:00:00Z",
        "summary": "A cat on a sofa.",
        "labels": [{"label": "Cat", "confidence": 0.97}],
        "processingTimeMs": 120,
        "model": "resnet50",
        "isDemo": False,
    }
```

The form field name (`file`) must match the key in `apiClient.upload(..., { file: ... })`.
(CORS only matters for `npm run web`; native apps ignore it.)

### Authenticated requests (e.g. Supabase session)

```ts
import { setAuthTokenProvider } from '@/services/api/client';

setAuthTokenProvider(async () => session?.access_token ?? null); // adds Authorization: Bearer …
```

Only use the Supabase **anon** key in the app; keep the service-role key on the backend.

---

## 4. Replace the demo AI result with a real one

Everything goes through **one function**: `analyzeImage()` in `src/services/ai/aiService.ts`.

**Option A — just flip the flag** (recommended): build `POST /ai/analyze-image` in FastAPI returning the
`AnalysisResult` shape from `src/types/analysis.ts`, then set `EXPO_PUBLIC_USE_MOCK_API=false`. Done — no UI changes.

**Option B — different response shape:** map it inside the service so screens stay unchanged:

```ts
interface FastApiDetection { class_name: string; score: number }
interface FastApiResponse { detections: FastApiDetection[]; elapsed_ms: number; model_name: string }

export async function analyzeImage(imageUri: string): Promise<AnalysisResult> {
  if (USE_MOCK_API) return mockAnalyzeImage(imageUri);

  const name = imageUri.split('/').pop() ?? 'image.jpg';
  const res = await apiClient.upload<FastApiResponse>(ENDPOINTS.analyzeImage, {
    file: { uri: imageUri, name, type: guessMimeType(imageUri) },
  });

  return {
    id: createId('analysis'),
    createdAt: new Date().toISOString(),
    summary: `Found ${res.detections.length} objects`,
    labels: res.detections.map((d) => ({ label: d.class_name, confidence: d.score })),
    processingTimeMs: res.elapsed_ms,
    model: res.model_name,
    isDemo: false,
  };
}
```

**Option C — a new AI feature** (e.g. OCR): add `extractText(uri)` next to `analyzeImage` in `aiService.ts`
with the same `if (USE_MOCK_API)` pattern, a type in `src/types/`, a hook in `src/features/ocr/useOcr.ts`, and a screen.

When the backend is live you can delete `src/services/ai/mockAiService.ts`.

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
| `src/data/quickActions.ts` | Home → Quick actions |
| `src/data/activity.ts` | Home → Recent activity |
| `src/data/features.ts` | Explore cards (set `route` to make a card open a page) |
| `src/data/history.ts` | History list + detail |
| `src/services/ai/mockAiService.ts` | Simulated AI labels |

---

## Checklist before pushing

```bash
npm run check   # TypeScript + ESLint
```
