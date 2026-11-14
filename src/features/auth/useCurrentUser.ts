import { useEffect, useState } from 'react';

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
