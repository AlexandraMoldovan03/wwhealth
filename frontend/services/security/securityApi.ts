import { apiClient } from '@/services/api/client';

export interface SecurityStatus {
  aal: string | null;
  mfaEnrolled: boolean;
  mfaSatisfied: boolean;
  authAgeSeconds: number | null;
  recentAuth: boolean;
  reauthMaxAgeSeconds: number;
  doctorMfaRequired: boolean;
}

/** What the server enforces for this session (no secrets). */
export const getSecurityStatus = () => apiClient.get<SecurityStatus>('/api/v1/security/status');
