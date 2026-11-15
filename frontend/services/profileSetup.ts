import { useEffect, useSyncExternalStore } from 'react';

import { api } from '@/services/backend';

/**
 * Whether the signed-in patient still has to fill in the basic data (name, birth date, sex).
 * One read of /patients/me per account per app session; the setup screen marks it complete.
 */
type State = { userId: string; needsSetup: boolean } | null;
let state: State = null;
let loading: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function markProfileComplete(userId: string) {
  state = { userId, needsSetup: false };
  emit();
}

async function check(userId: string) {
  if (loading === userId) return;
  loading = userId;
  try {
    const p = await api.getMyPatient();
    state = { userId, needsSetup: !p.fullName?.trim() || !p.dateOfBirth || !p.sex };
  } catch {
    state = { userId, needsSetup: false }; // never lock the app out because of a network error
  } finally {
    loading = null;
    emit();
  }
}

/** null while unknown; only for patient accounts (pass undefined otherwise). */
export function useNeedsProfileSetup(patientId: string | undefined): boolean | null {
  const snapshot = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
  );
  useEffect(() => {
    if (patientId && snapshot?.userId !== patientId) void check(patientId);
  }, [patientId, snapshot]);
  if (!patientId) return false;
  return snapshot?.userId === patientId ? snapshot.needsSetup : null;
}
