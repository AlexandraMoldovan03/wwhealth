import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * APP CONFIG — backend URL and feature flags.
 *
 * Values come from `.env` (see `.env.example`). Only `EXPO_PUBLIC_*` variables
 * are available in the app, and they are PUBLIC — never put secrets here
 * (Gemini, ElevenLabs, Supabase secret key, DB passwords stay in backend/.env).
 */

const API_PORT = process.env.EXPO_PUBLIC_API_PORT ?? '8000';

/**
 * Host of the computer serving the JS bundle (Metro). In Expo Go this is the Mac's current LAN IP,
 * so the backend URL follows Wi-Fi / hotspot changes without editing `.env`.
 */
function devServerHost(): string | null {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? window.location.hostname : null;
  }
  const hostUri = Constants.expoConfig?.hostUri ?? null; // e.g. "192.168.1.160:8082"
  return hostUri ? hostUri.split(':')[0] : null;
}

/**
 * FastAPI base URL.
 * • `EXPO_PUBLIC_API_BASE_URL=auto` (or unset) → same machine as Metro, port EXPO_PUBLIC_API_PORT (8000).
 * • An explicit URL (e.g. a deployed backend) always wins.
 */
function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured && configured !== 'auto') return configured;
  const host = devServerHost();
  return `http://${host || 'localhost'}:${API_PORT}`;
}

export const API_BASE_URL: string = resolveApiBaseUrl();

/** MOCK mode (default) works without a backend. Set EXPO_PUBLIC_USE_MOCKS=false for API mode. */
export const USE_MOCKS: boolean = process.env.EXPO_PUBLIC_USE_MOCKS !== 'false';

/**
 * Supabase Auth. The publishable key is public by design — medical data is protected by RLS.
 * NEVER put the secret key here (it stays in backend/.env).
 */
export const SUPABASE_URL: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY: string = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
/** false → demo login (any email/password), used by MOCK mode without a Supabase project. */
export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

/** Default request timeout (ms). Uploads / AI endpoints pass their own, longer timeout. */
export const API_TIMEOUT_MS = 15_000;

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
