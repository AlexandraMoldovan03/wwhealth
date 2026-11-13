import { useSyncExternalStore } from 'react';
import type { AuthUser } from '@/types';

let state = { user: null as AuthUser | null, ready: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

export const setSession = (user: AuthUser | null) => { state = { ...state, user }; emit(); };
export const markReady = () => { state = { ...state, ready: true }; emit(); };
export const getSession = () => state.user;

export function useSession() {
  const s = useSyncExternalStore(subscribe, () => state);
  return { user: s.user, isAuthenticated: s.user !== null, ready: s.ready };
}