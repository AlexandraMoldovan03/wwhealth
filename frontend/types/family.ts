/**
 * Family QR codes — demo only for now.
 * Kept locally on this device; the codes are not validated by the backend yet.
 */

export interface FamilyQrCode {
  token: string;
  /** String encoded in the QR: "wwhealth://family/<memberId>/<token>". */
  qrPayload: string;
  expiresAt: string;
  ttlSeconds: number;
}

export interface FamilyMember {
  id: string;
  name: string;
  /** Free text: mother, father, child, etc. */
  relationship: string;
  /** Active 5-minute QR, or null when none was generated / it expired. */
  qr: FamilyQrCode | null;
}
