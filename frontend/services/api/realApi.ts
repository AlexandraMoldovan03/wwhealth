/** API mode — real HTTP calls to FastAPI. One method per endpoint in docs/API_CONTRACT.md. */
import type { JsonValue, WWHealthApi } from '@/types';

import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';

export const realApi: WWHealthApi = {
  health: () => apiClient.get(ENDPOINTS.health, { timeoutMs: 5_000 }),

  getMyPatient: () => apiClient.get(ENDPOINTS.patientsMe),

  // JSON.parse(JSON.stringify()) turns the typed object into JsonValue (drops undefined fields).
  updateMyProfile: (update) => apiClient.patch(ENDPOINTS.patientsMe, JSON.parse(JSON.stringify(update)) as JsonValue),

  uploadDocument: (file, documentType, title) =>
    apiClient.upload(ENDPOINTS.documents, { file }, { documentType, title }, { timeoutMs: 60_000 }),

  analyzeDocument: (file, documentType, title) =>
    apiClient.upload(ENDPOINTS.documentsAnalyze, { file }, { documentType, title }),

  analyzeXray: (file) => apiClient.upload(ENDPOINTS.xrayAnalyze, { file }),

  // Model + Grad-CAM run on CPU; the first call also loads the model.
  analyzeLung: (file) => apiClient.upload(ENDPOINTS.lungAnalyze, { file }, {}, { timeoutMs: 60_000 }),

  grantAccess: (request) =>
    apiClient.post(ENDPOINTS.accessGrant, { scopes: request.scopes, ttlMinutes: request.ttlMinutes }),

  redeemAccess: (request) => apiClient.post(ENDPOINTS.accessRedeem, { token: request.token }),

  analyzeIntake: (file) => apiClient.upload(ENDPOINTS.voiceIntake, { file }, {}, { timeoutMs: 190_000 }),

  voiceSummary: (request) =>
    apiClient.post(ENDPOINTS.voiceSummary, { patientId: request.patientId, language: request.language }),

  extractLabValues: (file) => apiClient.upload(ENDPOINTS.documentsExtractLabs, { file }, {}, { timeoutMs: 90_000 }),
  getLabValues: (documentId) => apiClient.get(ENDPOINTS.documentLabValues(documentId)),
  extractLabValuesFromDocument: (documentId) => apiClient.post(ENDPOINTS.documentExtractLabs(documentId), undefined, { timeoutMs: 90_000 }),
  listLabValues: () => apiClient.get(ENDPOINTS.labValues),
  saveLabValues: (documentId, values) =>
    apiClient.put(ENDPOINTS.documentLabValues(documentId), { values: JSON.parse(JSON.stringify(values)) as JsonValue }),

  createEmergencyToken: () => apiClient.post(ENDPOINTS.emergencyTokens),
  revokeEmergencyToken: (tokenId) => apiClient.post(ENDPOINTS.emergencyRevoke(tokenId)),
  // The scanned token goes to FastAPI as-is; validation never happens in the app.
  redeemEmergencyToken: (request) => apiClient.post(ENDPOINTS.emergencyRedeem, { token: request.token }),
  getEmergencyAudit: () => apiClient.get(ENDPOINTS.emergencyAudit),
  getMyEmergencyAccesses: () => apiClient.get(ENDPOINTS.emergencyMyAccesses),
};
