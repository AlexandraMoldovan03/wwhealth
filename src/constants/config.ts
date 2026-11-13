/**
 * APP CONFIG — backend URL and feature flags.
 *
 * Values come from `.env` (see `.env.example`). Only `EXPO_PUBLIC_*` variables
 * are available in the app, and they are PUBLIC — never put secrets here
 * (Gemini, ElevenLabs, Auth0 client secrets, DB passwords stay in backend/.env).
 */

/** FastAPI base URL. On a physical device use your computer's LAN IP, not `localhost`. */
export const API_BASE_URL: string = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

/** MOCK mode (default) works without a backend. Set EXPO_PUBLIC_USE_MOCKS=false for API mode. */
export const USE_MOCKS: boolean = process.env.EXPO_PUBLIC_USE_MOCKS !== 'false';

/** Request timeout in ms. AI endpoints can be slow, so this is generous. */
export const API_TIMEOUT_MS = 30_000;

/** Simulated network delay for mock services (ms). */
export const MOCK_DELAY_MS = 700;

export const APP_INFO = {
  name: 'WWHealth',
  fullName: 'WorldWideHealth',
  version: '1.0.0',
  description: 'Your medical record, documents and AI-assisted X-ray insights — shareable with doctors via a temporary QR passport.',
} as const;

/** Shown next to every AI output. */
export const MEDICAL_DISCLAIMER =
  'DEMO — not a medical device. AI output must be reviewed by a qualified clinician.';

/** Trim quotes/whitespace and strip the protocol — the SDK wants only the hostname. */
const clean = (value: string | undefined) =>
  (value ?? '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');

export const AUTH0 = {
  domain: clean(process.env.EXPO_PUBLIC_AUTH0_DOMAIN),
  clientId: clean(process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID),
  audience: clean(process.env.EXPO_PUBLIC_AUTH0_AUDIENCE),
  /** Must match the `customScheme` in app.config.ts. */
  customScheme: 'wwhealth',
  roleClaim: 'https://wwhealth.app/role',
};
