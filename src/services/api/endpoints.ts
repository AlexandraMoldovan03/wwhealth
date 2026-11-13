/** All backend paths in one place. Must match docs/API_CONTRACT.md. */
export const ENDPOINTS = {
  health: '/health',
  patientsMe: '/api/v1/patients/me',
  documentsAnalyze: '/api/v1/documents/analyze',
  xrayAnalyze: '/api/v1/xray/analyze',
  lungAnalyze: '/api/ai/lung/analyze',
  accessGrant: '/api/v1/access/grant',
  accessRedeem: '/api/v1/access/redeem',
  voiceSummary: '/api/v1/voice/summary',
} as const;
