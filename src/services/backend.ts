/**
 * ENTRY POINT for all backend data. Screens/hooks import `api` from here:
 *
 *   import { api } from '@/services/backend';
 *   const patient = await api.getMyPatient();
 *
 * EXPO_PUBLIC_USE_MOCKS=true  → mockApi (in-memory demo data, no backend needed)
 * EXPO_PUBLIC_USE_MOCKS=false → realApi (FastAPI at EXPO_PUBLIC_API_BASE_URL)
 */
import { USE_MOCKS } from '@/constants/config';
import { getAccessToken } from '@/features/auth/authService';
import type { WWHealthApi } from '@/types';

import { setAuthTokenProvider } from './api/client';
import { realApi } from './api/realApi';
import { mockApi } from './mock/mockApi';

// Every request carries the logged-in user's token; the backend scopes medical data to that user.
setAuthTokenProvider(getAccessToken);

export const api: WWHealthApi = USE_MOCKS ? mockApi : realApi;
