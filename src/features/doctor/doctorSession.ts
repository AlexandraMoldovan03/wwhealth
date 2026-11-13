/**
 * In-memory store of patients the doctor has unlocked via QR (access/redeem).
 * Lost on app reload — the doctor simply scans again. Replace with backend
 * calls (using accessId) when the API supports re-fetching.
 */
import type { AccessRedeemResponse } from '@/types';

const sessions = new Map<string, AccessRedeemResponse>();

export function saveDoctorSession(session: AccessRedeemResponse): void {
  sessions.set(session.patient.id, session);
}

export function getDoctorSession(patientId: string): AccessRedeemResponse | null {
  const session = sessions.get(patientId);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    sessions.delete(patientId);
    return null;
  }
  return session;
}

export function listDoctorSessions(): AccessRedeemResponse[] {
  return [...sessions.values()].filter((s) => new Date(s.expiresAt).getTime() >= Date.now());
}
