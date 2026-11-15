/**
 * Supabase client — used ONLY for authentication (sign in / sign up / session refresh).
 * Medical data goes through FastAPI, which forwards the user's access token so RLS applies.
 * The session (tokens only, no medical data) is persisted in the Keychain / Keystore (expo-secure-store,
 * see security/secureSessionStorage.ts); an older AsyncStorage copy is migrated once and deleted.
 */
import 'react-native-url-polyfill/auto';
import './cryptoPolyfill'; // before supabase-js: SHA-256 PKCE + secure random on native

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { SUPABASE_ENABLED, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/config/config';
import { sessionStorage } from '@/services/security/secureSessionStorage';

// Web static rendering runs without `window` — no storage / refresh timers there.
const isServer = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase: SupabaseClient | null = SUPABASE_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: isServer ? undefined : sessionStorage,
        persistSession: !isServer,
        autoRefreshToken: !isServer,
        detectSessionInUrl: false,
        // PKCE: OAuth returns a one-time `?code=` (exchanged in authService) instead of tokens in the URL.
        flowType: 'pkce',
      },
    })
  : null;

// Refresh tokens only while the app is in the foreground (recommended for React Native).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
