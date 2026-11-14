/** Emergency Medical Passport — mirror of backend/app/schemas/emergency.py. */

export interface EmergencyTokenResponse {
  tokenId: string;
  /** Random token, no medical data. Valid 5 minutes, single use. */
  token: string;
  /** String encoded in the QR: "wwhealth://emergency/<token>". */
  qrPayload: string;
  expiresAt: string;
  ttlSeconds: number;
}

export interface EmergencyRedeemRequest {
  /** Raw token or the full QR payload. Validated by the backend only. */
  token: string;
}

/** The ONLY data a doctor sees: blood type, allergies, active conditions, active medication. */
export interface EmergencyData {
  bloodType: string | null;
  allergies: { substance: string; reaction: string; severity: 'mild' | 'moderate' | 'severe' | null }[];
  conditions: { name: string; icd10: string | null }[];
  medications: { name: string; dosage: string; frequency: string }[];
  accessedAt: string;
}

export type EmergencyEventType = 'created' | 'revoked' | 'viewed' | 'denied';
export type EmergencyDenyReason = 'not_found' | 'expired' | 'used' | 'revoked' | 'not_doctor';

export interface EmergencyAccessEvent {
  id: string;
  event: EmergencyEventType;
  reason: EmergencyDenyReason | null;
  actorName: string | null;
  createdAt: string;
}
