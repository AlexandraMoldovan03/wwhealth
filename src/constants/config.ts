/**
 * APP CONFIG — backend URL and feature flags.
 *
 * Values come from `.env` (see `.env.example`). Only `EXPO_PUBLIC_*` variables
 * are available in the app, and they are PUBLIC — never put secrets here.
 */

/** FastAPI base URL. On a physical device use your computer's LAN IP, not `localhost`. */
export const API_BASE_URL: string = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

/** When true, services return mock data instead of calling the backend. */
export const USE_MOCK_API: boolean = process.env.EXPO_PUBLIC_USE_MOCK_API !== 'false';

/** Request timeout in ms. AI endpoints can be slow, so this is generous. */
export const API_TIMEOUT_MS = 30_000;

/** Simulated network delay for mock services (ms). */
export const MOCK_DELAY_MS = 900;

export const APP_INFO = {
  name: 'WWHealth',
  version: '1.0.0',
  description: 'Expo + TypeScript starter for AI / CV / ML hackathon projects.',
} as const;
