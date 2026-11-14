import { useEffect, useState } from 'react';

import { subscribeToSession } from './authService';

/** null while the saved session is being restored, then true / false. Always true in demo mode. */
export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => subscribeToSession(setSignedIn), []);
  return signedIn;
}
