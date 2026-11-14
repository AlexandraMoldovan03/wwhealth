import { useEffect, useState } from 'react';

import { SUPABASE_ENABLED } from '@/config/config';
import type { AuthUser, UserRole } from '@/types';

import { getCurrentUser, subscribeToUser } from './authService';

/** Signed-in user; `role` comes only from public.profiles in Supabase (read-only in the app). */
export function useCurrentUser(): AuthUser | null {
  const [user, setUser] = useState(getCurrentUser);
  useEffect(() => subscribeToUser(setUser), []);
  return user;
}

export function useRole(): UserRole {
  return useCurrentUser()?.role ?? 'patient';
}

/** Demo sessions have a stable local identity even when opened from a direct link. */
export function useLocalPatientId(): string | undefined {
  const user = useCurrentUser();
  if (user) return user.role === 'patient' ? user.id : undefined;
  return SUPABASE_ENABLED ? undefined : 'demo-user';
}
