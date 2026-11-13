# WWHealth — Expo + TypeScript

A clean, ready-to-extend mobile app template for hackathons (AI, Computer Vision, ML, API integrations).
Runs directly in **Expo Go** on iOS and Android — no native build required.

- **Expo SDK 58** · React Native 0.88 · React 19 · TypeScript (strict)
- **Expo Router** (file-based navigation): 5 bottom tabs + stack detail screen
- Central **design system** with Light / Dark / System theme
- Reusable **API client** (GET / POST / multipart upload) ready for FastAPI
- **Demo AI service** with simulated results, swappable for a real backend in one flag

> 📚 More docs: [ARCHITECTURE.md](./ARCHITECTURE.md) · [HOW_TO_ADD_FEATURE.md](./HOW_TO_ADD_FEATURE.md)

---

## 1. Install

Requirements: Node.js 20+ and npm. On your phone: the **Expo Go** app (App Store / Google Play), updated to the version that supports SDK 58.

```bash
npm install
cp .env.example .env    # optional — defaults work without it
```

## 2. Start

```bash
npm start               # = npx expo start
```

Useful variants:

```bash
npx expo start --clear  # clear Metro cache (do this after editing .env or babel/app config)
npx expo start --tunnel # if phone and laptop are NOT on the same Wi-Fi
npm run web             # open in the browser
```

## 3. Test in Expo Go

1. Phone and computer on the **same Wi-Fi network**.
2. Run `npm start` — a QR code appears in the terminal.
3. **iPhone:** open the Camera app, scan the QR code, tap the banner → opens in Expo Go.
   **Android:** open Expo Go → "Scan QR code".
4. Save any file → the app reloads instantly. Shake the phone for the developer menu.

If it doesn't connect: try `npx expo start --tunnel`, or make sure a firewall/VPN isn't blocking port 8081.

## 4. Scripts

| Command             | What it does                                 |
| ------------------- | -------------------------------------------- |
| `npm start`         | Start the dev server (Expo Go QR code)       |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`)            |
| `npm run lint`      | ESLint (`expo lint`)                         |
| `npm run check`     | typecheck + lint — run before every push     |
| `npm run doctor`    | Checks dependency versions match the SDK     |

Always add packages with `npx expo install <pkg>` (not `npm install`) so versions match the SDK.
Only use libraries that are **included in Expo Go** — anything else needs a development build.

## 5. Project structure

```
app/                         ← ROUTES (one file = one screen / URL)
  _layout.tsx                  root: providers + Stack navigator
  (tabs)/_layout.tsx           bottom tab bar
  (tabs)/index.tsx             "/"          → Home
  (tabs)/explore.tsx           "/explore"   → Explore
  (tabs)/analysis.tsx          "/analysis"  → AI Analysis
  (tabs)/history.tsx           "/history"   → History
  (tabs)/settings.tsx          "/settings"  → Settings
  history/[id].tsx             "/history/h1" → detail (stack, over tabs)
  +not-found.tsx               404
src/
  screens/                   ← screen UI (route files just re-export these)
  components/ui/             ← reusable building blocks (AppButton, AppCard, …)
  features/<feature>/        ← feature-specific components + hooks (logic)
  services/                  ← API client, AI service, data services
  constants/theme.ts         ← 🎨 ALL colours, spacing, fonts, radii
  constants/config.ts        ← API_BASE_URL + mock flag
  constants/navigation.ts    ← bottom tab list (order, titles, icons)
  context/                   ← React Context (theme)
  hooks/                     ← generic hooks (useTheme, useAsync)
  data/                      ← demo / mock data
  types/                     ← TypeScript interfaces
  utils/                     ← pure helper functions
assets/
  images/                    ← app icon, splash, images
  icons/                     ← custom icons (most icons come from @expo/vector-icons)
```

## 6. "Where do I…?" cheat sheet

| I want to…                         | Go to                                                         |
| ---------------------------------- | ------------------------------------------------------------- |
| Change the Home page               | `src/screens/HomeScreen.tsx`                                  |
| Create a new page                  | add a file in `app/` → see HOW_TO_ADD_FEATURE.md              |
| Change colours / fonts / spacing   | `src/constants/theme.ts`                                      |
| Add or reorder a bottom tab        | `src/constants/navigation.ts` + file in `app/(tabs)/`         |
| Add a button                       | `<AppButton title="…" onPress={…} />` from `@/components/ui`  |
| Set the backend URL                | `.env` → `EXPO_PUBLIC_API_BASE_URL` (read in `constants/config.ts`) |
| Add an API call                    | `src/services/` + path in `src/services/api/endpoints.ts`     |
| Implement real AI                  | `src/services/ai/aiService.ts`                                |
| Edit demo data                     | `src/data/*.ts`                                               |
| Add images                         | `assets/images/` → `require('../../assets/images/x.png')`     |
| Find an icon                       | https://icons.expo.fyi (use the **Ionicons** set)             |

## Security

No secrets in the app. Everything in the bundle (including `EXPO_PUBLIC_*` env vars) can be read by anyone.
Keep API keys (OpenAI, Supabase service role, etc.) on the FastAPI backend.
# wwhealth
# wwhealth
