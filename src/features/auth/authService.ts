/**
 * AUTH SERVICE — the only place the Login / Register screens call.
 *
 * TODO(auth): replace the bodies of `login`, `register` and `logout` with your real logic
 * (FastAPI `/api/v1/auth/*`, Auth0, Supabase, …). Keep the signatures and the screens keep working:
 *   - return an `AuthResponse` on success
 *   - `throw new Error('Message for the user')` on failure — the screen shows the message.
 *
 * Right now every call succeeds after a short delay with a fake DEMO user.
 */
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
