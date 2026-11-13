/** API mode — real HTTP calls to FastAPI. One method per endpoint in docs/API_CONTRACT.md. */
import type { WWHealthApi } from '@/types';

import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';

export const realApi: WWHealthApi = {
  health: () => apiClient.get(ENDPOINTS.health, { timeoutMs: 5_000 }),

  getMyPatient: () => apiClient.get(ENDPOINTS.patientsMe),

  analyzeDocument: (file, documentType, title) =>
    apiClient.upload(ENDPOINTS.documentsAnalyze, { file }, { documentType, title }),

  analyzeXray: (file) => apiClient.upload(ENDPOINTS.xrayAnalyze, { file }),

  // Model + Grad-CAM run on CPU; the first call also loads the model.
  analyzeLung: (file) => apiClient.upload(ENDPOINTS.lungAnalyze, { file }, {}, { timeoutMs: 60_000 }),

  grantAccess: (request) =>
    apiClient.post(ENDPOINTS.accessGrant, { scopes: request.scopes, ttlMinutes: request.ttlMinutes }),

  redeemAccess: (request) => apiClient.post(ENDPOINTS.accessRedeem, { token: request.token }),

  voiceSummary: (request) =>
    apiClient.post(ENDPOINTS.voiceSummary, { patientId: request.patientId, language: request.language }),
};
