/**  initial file
 * AUTH SERVICE — the only place the Login / Register screens call.
 *
 * TODO(auth): replace the bodies of `login`, `register` and `logout` with your real logic
 * (FastAPI `/api/v1/auth/*`, Auth0, Supabase, …). Keep the signatures and the screens keep working:
 *   - return an `AuthResponse` on success
 *   - `throw new Error('Message for the user')` on failure — the screen shows the message.
 *
 * Right now every call succeeds after a short delay with a fake DEMO user.

import { MOCK_DELAY_MS } from '@/constants/config';
import type { AuthResponse, AuthUser, LoginRequest, RegisterRequest } from '@/types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let currentUser: AuthUser | null = null;

export async function login(request: LoginRequest): Promise<AuthResponse> {
  // TODO(auth): e.g. `return apiClient.post<AuthResponse>('/api/v1/auth/login', request);`
  await delay(MOCK_DELAY_MS);
  const user: AuthUser = { id: 'demo-user', fullName: 'Demo User', email: request.email, role: 'patient' };
  currentUser = user;
  return { user, accessToken: 'demo-token' };
}

export async function register(request: RegisterRequest): Promise<AuthResponse> {
  // TODO(auth): e.g. `return apiClient.post<AuthResponse>('/api/v1/auth/register', request);`
  await delay(MOCK_DELAY_MS);
  const user: AuthUser = { id: 'demo-user', fullName: request.fullName, email: request.email, role: request.role };
  currentUser = user;
  return { user, accessToken: 'demo-token' };
}

export async function logout(): Promise<void> {
  // TODO(auth): clear the stored token / call the backend.
  currentUser = null;
}

export function getCurrentUser(): AuthUser | null {
  // TODO(auth): read from secure storage (expo-secure-store works in Expo Go).
  return currentUser;
}
*/

import { Platform } from 'react-native';
import Auth0 from 'react-native-auth0';
import { jwtDecode } from 'jwt-decode';

import { AUTH0 } from '@/constants/config';
import { markReady, setSession, getSession } from '@/features/auth/sessionStore';
import type { AuthResponse, LoginRequest, RegisterRequest, UserRole } from '@/types';

/** Native-only options; ignored on web, where the redirect URI is the page origin. */
const NATIVE_OPTIONS = { customScheme: AUTH0.customScheme };
type Auth0Options = ConstructorParameters<typeof Auth0>[0];

type Claims = { sub: string; name?: string; email?: string; [key: string]: unknown };

let auth0: Auth0 | null = null;

/**
 * The client is created lazily so a missing `.env` shows a readable error on the
 * login screen instead of crashing the whole app at import time.
 */
function getClient(): Auth0 {
  if (!AUTH0.domain || !AUTH0.clientId) {
    throw new Error(
      'Auth0 is not configured. Set EXPO_PUBLIC_AUTH0_DOMAIN and EXPO_PUBLIC_AUTH0_CLIENT_ID in .env, then restart Expo.',
    );
  }
  if (!auth0) {
    const options = {
      domain: AUTH0.domain,
      clientId: AUTH0.clientId,
      // On web, spa-js must persist tokens across the redirect reload.
      ...(Platform.OS === 'web' ? { cacheLocation: 'localstorage' as const } : {}),
    };
    auth0 = new Auth0(options as Auth0Options);
  }
  return auth0;
}

/** Ask for an API-scoped token when an audience is configured. */
const apiParameters = () => (AUTH0.audience ? { audience: AUTH0.audience } : undefined);

function toResponse(idToken: string, accessToken: string): AuthResponse {
  const c = jwtDecode<Claims>(idToken);
  const role: UserRole = c[AUTH0.roleClaim] === 'doctor' ? 'doctor' : 'patient';
  const user = { id: c.sub, fullName: c.name ?? c.email ?? 'User', email: c.email ?? '', role };
  setSession(user);
  return { user, accessToken };
}

async function start(signup: boolean): Promise<AuthResponse> {
  const client = getClient();
  try {
    const creds = await client.webAuth.authorize(
      {
        scope: 'openid profile email offline_access',
        ...(AUTH0.audience ? { audience: AUTH0.audience } : {}),
        additionalParameters: signup ? { screen_hint: 'signup' } : {},
      },
      NATIVE_OPTIONS,
    );
    await client.credentialsManager.saveCredentials(creds);
    return toResponse(creds.idToken, creds.accessToken);
  } catch (e) {
    const code = (e as { code?: string }).code;
    const message = e instanceof Error ? e.message : String(e);
    if (code === 'cancelled' || code === 'USER_CANCELLED' || /cancel/i.test(message)) {
      throw new Error('Sign in was cancelled.');
    }
    // Surface the real Auth0 error (callback mismatch, wrong client, …).
    throw new Error(message || 'Sign in failed.');
  }
}

/** True right after Auth0 redirected back to the web app. */
function isWebRedirect(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('code') && params.has('state');
}

/** Guards against exchanging the same `?code=…` twice (React 19 dev remounts). */
let webRedirectHandled = false;

/** On web, exchange the `?code=…` in the URL for tokens and clean the address bar. */
async function completeWebRedirect(client: Auth0): Promise<void> {
  if (webRedirectHandled || !isWebRedirect()) return;
  webRedirectHandled = true;
  try {
    await client.webAuth.handleRedirectCallback();
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (e) {
    webRedirectHandled = false;
    throw e;
  }
}

export const login = (_request?: LoginRequest) => start(false);
export const register = (_request?: RegisterRequest) => start(true);

/** Call once at app start: finishes a web redirect and restores a saved session. */
export async function restoreSession() {
  try {
    const client = getClient();
    await completeWebRedirect(client);
    if (await client.credentialsManager.hasValidCredentials()) {
      const c = await client.credentialsManager.getCredentials(undefined, 60, apiParameters());
      toResponse(c.idToken, c.accessToken);
    }
  } catch (e) {
    console.warn('[auth] could not restore session:', e);
  }
  markReady();
}

export async function logout() {
  try {
    const client = getClient();
    try {
      await client.webAuth.clearSession({}, NATIVE_OPTIONS);
    } catch {
      /* user cancelled the logout page */
    }
    await client.credentialsManager.clearCredentials();
  } catch (e) {
    console.warn('[auth] could not clear Auth0 session:', e);
  } finally {
    setSession(null);
  }
}

export const getCurrentUser = getSession;

/** Use this for every backend call: `Authorization: Bearer <token>`. */
export async function getAccessToken(): Promise<string | null> {
  try {
    const client = getClient();
    return (await client.credentialsManager.getCredentials(undefined, 60, apiParameters())).accessToken;
  } catch {
    return null;
  }
}