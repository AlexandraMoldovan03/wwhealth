import { apiClient } from './api/client';
import { ENDPOINTS } from './api/endpoints';

/** Pings FastAPI `GET /health`. Used by Settings → "Test backend connection". */
export async function checkBackendHealth(): Promise<{ status: string }> {
  return apiClient.get<{ status: string }>(ENDPOINTS.health, { timeoutMs: 5_000 });
}
