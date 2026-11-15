import { useEffect, useState } from 'react';

import { supabase } from '@/services/supabase';

import { mfaPendingNow } from './mfa';

/**
 * true while a signed-in account with TOTP has not entered the code yet (aal1 of an MFA account).
 * null while checking. Always false when signed out or in demo mode.
 */
export function useMfaPending(signedIn: boolean | null): boolean | null {
  // Result of the last check, remembered with the sign-in state it belongs to.
  const [result, setResult] = useState<{ signedIn: boolean | null; pending: boolean } | null>(null);

  useEffect(() => {
    if (!signedIn || !supabase) return;
    let alive = true;
    const check = () =>
      mfaPendingNow()
        .then((pending) => alive && setResult({ signedIn, pending }))
        .catch(() => alive && setResult({ signedIn, pending: false }));
    void check();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'MFA_CHALLENGE_VERIFIED' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')
        setTimeout(check, 0); // never call Supabase inside the callback itself
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [signedIn]);

  if (signedIn === null) return null;
  if (!signedIn || !supabase) return false;
  return result && result.signedIn === signedIn ? result.pending : null;
}
