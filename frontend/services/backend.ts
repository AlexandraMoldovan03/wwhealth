/**
 * ENTRY POINT for all backend data. Screens/hooks import `api` from here:
 *
 *   import { api } from './backend';
 *   const patient = await api.getMyPatient();
 *
 * EXPO_PUBLIC_USE_MOCKS=true  → mockApi (in-memory demo data, no backend needed)
 * EXPO_PUBLIC_USE_MOCKS=false → realApi (FastAPI at EXPO_PUBLIC_API_BASE_URL)
 */
import { USE_MOCKS } from '@/config/config';
import { getAccessToken, handleUnauthorized } from './auth/authService';
import type { WWHealthApi } from '@/types';

import { setAuthTokenProvider, setSecurityHandlers } from './api/client';
import { parseStepUp } from './security/stepUp';
import { openStepUp } from './security/sensitiveAction';
import { realApi } from './api/realApi';
import { mockApi } from './mock/mockApi';

// Every request carries the logged-in user's token; the backend scopes medical data to that user.
setAuthTokenProvider(getAccessToken);
// 401 → refresh once or sign in again; 403 + step-up → re-authentication screen.
setSecurityHandlers({
  onUnauthorized: () => void handleUnauthorized(),
  onStepUp: (header) => {
    const kind = parseStepUp(header);
    if (kind) openStepUp(kind);
  },
});

export const api: WWHealthApi = USE_MOCKS ? mockApi : realApi;
