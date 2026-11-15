/**
 * AUTH SERVICE — the only place the Login / Register screens call.
 *
 * Supabase configured (EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY):
 *   real Supabase Auth (email + password, and Google via the system browser — works in Expo Go).
 *   The role comes from `public.profiles` (created once per auth user by the sign-up trigger).
 * Not configured: DEMO login — any email/password succeeds (MOCK mode).
 *
 * Contract for the screens: return an `AuthResponse`, or `throw new Error('Message for the user')`.
 */
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { MOCK_DELAY_MS } from '@/config/config';
import { supabase } from '@/services/supabase';
import type { AuthResponse, AuthUser, LoginRequest, RegisterRequest, UserRole } from '@/types';
import { i18n } from '@/i18n';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let currentUser: AuthUser | null = null;
let demoToken: string | null = null;

// Screens follow the signed-in user (and its role from public.profiles) through useCurrentUser().
const userListeners = new Set<(user: AuthUser | null) => void>();
const sameUser = (a: AuthUser | null, b: AuthUser | null) =>
  a === b || (!!a && !!b && a.id === b.id && a.role === b.role && a.fullName === b.fullName && a.email === b.email);

function setCurrentUser<T extends AuthUser | null>(user: T): T {
  // Only real changes re-render the screens (a token refresh / role re-check returns an equal user).
  if (sameUser(currentUser, user)) return (currentUser ?? user) as T;
  currentUser = user;
  userListeners.forEach((listener) => listener(user));
  return user;
}

/** Supabase error → message the user can act on (never raw server details). */
function friendlyError(message: string, code?: string): Error {
  // Raw reason in the Metro terminal (dev only) so unexpected cases can be diagnosed.
  if (__DEV__) console.warn('[auth] Supabase error:', code ?? '', message);
  const m = message.toLowerCase();
  if (code === 'over_email_send_rate_limit' || m.includes('rate limit'))
    return new Error(i18n.t('auth.errors.rateLimit'));
  if (code === 'weak_password') return new Error(i18n.t('auth.errors.weakPassword'));
  if (m.includes('invalid login credentials')) return new Error(i18n.t('auth.errors.wrongCredentials'));
  if (m.includes('email not confirmed')) return new Error(i18n.t('auth.errors.emailNotConfirmed'));
  if (m.includes('already registered') || m.includes('already been registered'))
    return new Error(i18n.t('auth.errors.alreadyRegistered'));
  if (m.includes('password')) return new Error(i18n.t('auth.errors.weakPassword'));
  if (m.includes('network') || m.includes('fetch')) return new Error(i18n.t('auth.errors.network'));
  return new Error(i18n.t('auth.errors.generic'));
}

async function userFromSession(session: Session): Promise<AuthUser> {
  const meta = session.user.user_metadata ?? {};
  let fullName = typeof meta.full_name === 'string' ? meta.full_name : '';
  let role: UserRole = 'patient';
  // public.profiles is the source of truth for the role (RLS: a user can only read their own row).
  const { data } = await supabase!.from('profiles').select('full_name, role').eq('id', session.user.id).maybeSingle();
  if (data) {
    fullName = data.full_name || fullName;
    role = data.role === 'doctor' ? 'doctor' : 'patient';
  }
  return { id: session.user.id, email: session.user.email ?? '', fullName, role };
}

export async function login(request: LoginRequest): Promise<AuthResponse> {
  if (!supabase) {
    await delay(MOCK_DELAY_MS);
    const user = setCurrentUser({ id: 'demo-user', fullName: 'Demo User', email: request.email, role: 'patient' });
    demoToken = 'demo-token';
    return { user, accessToken: demoToken };
  }
  const { data, error } = await supabase.auth.signInWithPassword(request);
  if (error || !data.session) throw friendlyError(error?.message ?? '', error?.code);
  const user = setCurrentUser(await userFromSession(data.session));
  return { user, accessToken: data.session.access_token };
}

export async function register(request: RegisterRequest): Promise<AuthResponse> {
  if (!supabase) {
    await delay(MOCK_DELAY_MS);
    const user = setCurrentUser({ id: 'demo-user', fullName: request.fullName, email: request.email, role: request.role });
    demoToken = 'demo-token';
    return { user, accessToken: demoToken };
  }
  const { data, error } = await supabase.auth.signUp({
    email: request.email,
    password: request.password,
    // Read by the `handle_new_user` trigger to create public.profiles + medical_profiles.
    options: { data: { full_name: request.fullName.trim(), role: request.role } },
  });
  if (error) throw friendlyError(error.message, error.code);
  if (!data.session) {
    // "Confirm email" is enabled in Supabase → no session until the link is clicked.
    throw new Error(i18n.t('auth.errors.confirmEmail'));
  }
  const user = setCurrentUser(await userFromSession(data.session));
  return { user, accessToken: data.session.access_token };
}

// Web: closes the auth popup/redirect tab when it lands back on the app.
WebBrowser.maybeCompleteAuthSession();

/**
 * Where Supabase sends the user back after Google. Must be allowed in
 * Supabase → Authentication → URL Configuration → Redirect URLs:
 *   Expo Go  exp://<LAN-IP>:8081/--/auth/callback  (allow `exp://**`)
 *   build    wwhealth://auth/callback                (allow `wwhealth://**`)
 *   web      http://localhost:8081/auth/callback     (allow `http://localhost:8081/**`)
 */
export function getOAuthRedirectUrl(): string {
  return Linking.createURL('auth/callback');
}

/**
 * "Continue with Google". Native: in-app browser session (ASWebAuthenticationSession on iOS),
 * then the PKCE code is exchanged for a session. Returns null if the user closed the browser.
 * Web: full-page redirect; the `auth/callback` route finishes the sign-in.
 */
export async function signInWithGoogle(): Promise<AuthResponse | null> {
  if (!supabase) throw new Error(i18n.t('auth.errors.googleNotConfigured'));
  const redirectTo = getOAuthRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web', queryParams: { prompt: 'select_account' } },
  });
  if (error || !data.url) throw friendlyError(error?.message ?? 'oauth url missing', error?.code);
  if (Platform.OS === 'web') return null; // the browser is navigating to Google

  // Dev diagnostics (no tokens/codes): this exact URL must match Supabase → URL Configuration → Redirect URLs.
  if (__DEV__) console.warn('[auth] Google redirectTo:', redirectTo);
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (__DEV__) {
    const back = result.type === 'success' ? result.url.split(/[?#]/)[0] : '';
    console.warn('[auth] Google browser result:', result.type, back);
  }
  if (result.type !== 'success') return null; // cancelled / dismissed
  return completeOAuthSignIn(result.url);
}

/** Finishes an OAuth sign-in from the callback URL (`?code=…` or `?error_description=…`). */
export async function completeOAuthSignIn(url: string): Promise<AuthResponse> {
  if (!supabase) throw new Error(i18n.t('auth.errors.googleNotConfigured'));
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  new URLSearchParams(parsed.hash.replace(/^#/, '')).forEach((value, key) => params.set(key, value));

  const oauthError = params.get('error_description') ?? params.get('error');
  if (oauthError) throw friendlyError(oauthError, params.get('error_code') ?? undefined);

  const code = params.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      const user = setCurrentUser(await userFromSession(data.session));
      return { user, accessToken: data.session.access_token };
    }
  }
  // The code may already have been exchanged (deep link + browser session both fire): reuse the session.
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error(i18n.t('auth.errors.googleIncomplete'));
  const user = setCurrentUser(await userFromSession(data.session));
  return { user, accessToken: data.session.access_token };
}

/**
 * Sign out and remove sensitive local data: the session (Keychain), the cached emergency QR, voice-intake
 * drafts, the care-summary draft, scheduled medication reminders and the biometric-lock preference.
 * `everywhere` also ends the sessions on the user's other devices.
 */
export async function logout(options: { everywhere?: boolean } = {}): Promise<void> {
  const userId = currentUser?.id;
  setCurrentUser(null);
  demoToken = null;
  const { clearLocalSensitiveData } = await import('@/services/security/localData');
  await clearLocalSensitiveData(userId).catch(() => undefined);
  if (supabase) await supabase.auth.signOut({ scope: options.everywhere ? 'global' : 'local' }).catch(() => supabase!.auth.signOut({ scope: 'local' }));
}

/**
 * The backend answered 401 (token rejected). Try one refresh; if the refresh token is no longer valid the
 * user must sign in again (no silent retry loop).
 */
let handlingUnauthorized: Promise<void> | null = null;
export function handleUnauthorized(): Promise<void> {
  if (!supabase) return Promise.resolve();
  handlingUnauthorized ??= (async () => {
    const { data, error } = await supabase!.auth.refreshSession();
    if (error || !data.session) await logout();
  })().finally(() => {
    handlingUnauthorized = null;
  });
  return handlingUnauthorized;
}

/**
 * Re-authentication for high-risk actions: a real password sign-in (fresh `amr` time on the server).
 * A Face ID unlock does not count.
 */
export async function reauthenticateWithPassword(password: string): Promise<void> {
  if (!supabase) return;
  const email = currentUser?.email;
  if (!email) throw new Error(i18n.t('auth.errors.generic'));
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw friendlyError(error?.message ?? '', error?.code);
  setCurrentUser(await userFromSession(data.session));
}

/** Whether this account signs in with email + password (Google-only accounts have no password to change). */
export async function hasPasswordIdentity(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getUser();
  return (data.user?.identities ?? []).some((i) => i.provider === 'email');
}

/**
 * Changes the password. The current password is checked first with a separate, immediately revoked
 * sign-in (the current session stays as it is). Supabase may additionally demand a
 * recent sign-in ("Secure password change") → the user is sent to re-authenticate.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  if (!supabase) throw new Error(i18n.t('security.notInDemo'));
  const email = currentUser?.email;
  if (!email) throw new Error(i18n.t('auth.errors.generic'));
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('@/config/config');
  const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: currentPassword }),
  }).catch(() => null);
  if (!res) throw new Error(i18n.t('auth.errors.network'));
  if (!res.ok) throw new Error(i18n.t('security.password.wrongCurrent'));
  const probe = (await res.json().catch(() => null)) as { access_token?: string } | null;
  if (probe?.access_token) {
    // End the probe session at once (scope local = only that session). Its token is never stored or logged.
    await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${probe.access_token}` },
    }).catch(() => undefined);
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword, current_password: currentPassword });
  if (!error) return;
  if (error.code === 'reauthentication_needed' || error.code === 'insufficient_aal') throw new Error(i18n.t('security.password.reauthNeeded'));
  if (error.code === 'same_password') throw new Error(i18n.t('security.password.same'));
  throw friendlyError(error.message, error.code);
}

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

/** Follows the signed-in user (null when signed out). Returns an unsubscribe fn. */
export function subscribeToUser(onChange: (user: AuthUser | null) => void): () => void {
  userListeners.add(onChange);
  return () => userListeners.delete(onChange);
}

/** Re-reads the role from public.profiles (e.g. after an admin promoted the account to doctor). */
let lastRoleCheck = 0;
export async function refreshCurrentUser(): Promise<AuthUser | null> {
  if (!supabase) return currentUser;
  // Home re-checks on focus; at most once every 30 s (one small profiles query).
  if (currentUser && Date.now() - lastRoleCheck < 30_000) return currentUser;
  lastRoleCheck = Date.now();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return setCurrentUser(null);
  return setCurrentUser(await userFromSession(data.session).catch(() => currentUser));
}

/** Sent as `Authorization: Bearer <token>` on every API call (wired in frontend/services/backend.ts). */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return demoToken;
  // Returns the stored session, refreshed first if it expired.
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Restores the saved session at app start and follows sign-in / sign-out. Returns an unsubscribe fn. */
export function subscribeToSession(onChange: (signedIn: boolean) => void): () => void {
  if (!supabase) {
    onChange(true); // demo mode: nothing to guard
    return () => {};
  }
  const client = supabase;
  client.auth.getSession().then(async ({ data }) => {
    if (data.session) setCurrentUser(await userFromSession(data.session).catch(() => currentUser));
    onChange(!!data.session);
  });
  const { data } = client.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return; // handled by getSession above
    if (!session) setCurrentUser(null);
    onChange(!!session);
  });
  return () => data.subscription.unsubscribe();
}
