import { i18n } from '@/i18n';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useCurrentUser } from '@/services/auth/useCurrentUser';
import { clearEmergencyToken, getActiveEmergencyToken, saveEmergencyToken } from '@/services/emergencyTokenStore';
import type { EmergencyTokenResponse } from '@/types';

interface EmergencyTokenContextValue {
  token: EmergencyTokenResponse | null;
  isRestoring: boolean;
  saveToken: (token: EmergencyTokenResponse) => Promise<void>;
  clearToken: () => Promise<void>;
}

const EmergencyTokenContext = createContext<EmergencyTokenContextValue | null>(null);

export function EmergencyTokenProvider({ children }: PropsWithChildren) {
  const user = useCurrentUser();
  const [snapshot, setSnapshot] = useState<{ ownerId: string; token: EmergencyTokenResponse | null } | null>(null);
  const [restoredUserId, setRestoredUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    const ownerId = user.id;
    void getActiveEmergencyToken(ownerId)
      .then((token) => { if (mounted) setSnapshot({ ownerId, token }); })
      .catch(() => { if (mounted) setSnapshot({ ownerId, token: null }); })
      .finally(() => { if (mounted) setRestoredUserId(ownerId); });
    return () => { mounted = false; };
  }, [user?.id]);

  const saveToken = useCallback(async (token: EmergencyTokenResponse) => {
    if (!user?.id) throw new Error(i18n.t('errors.accountNotReady'));
    const ownerId = user.id;
    setSnapshot({ ownerId, token });
    await saveEmergencyToken(ownerId, token);
  }, [user]);

  const clearToken = useCallback(async () => {
    if (!user?.id) return;
    const ownerId = user.id;
    setSnapshot({ ownerId, token: null });
    await clearEmergencyToken(ownerId);
  }, [user]);

  const value = useMemo(() => ({
    token: snapshot && snapshot.ownerId === user?.id ? snapshot.token : null,
    isRestoring: !!user?.id && restoredUserId !== user.id,
    saveToken,
    clearToken,
  }), [snapshot, user?.id, restoredUserId, saveToken, clearToken]);

  return <EmergencyTokenContext.Provider value={value}>{children}</EmergencyTokenContext.Provider>;
}

export function useEmergencyToken() {
  const context = useContext(EmergencyTokenContext);
  if (!context) throw new Error('useEmergencyToken must be used inside <EmergencyTokenProvider>');
  return context;
}
