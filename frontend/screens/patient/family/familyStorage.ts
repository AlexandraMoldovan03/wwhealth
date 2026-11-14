import AsyncStorage from '@react-native-async-storage/async-storage';

import type { FamilyMember, FamilyQrCode } from '@/types';

/** A person can keep at most three family members on this device. */
export const MAX_FAMILY_MEMBERS = 3;
/** Same lifetime as the emergency passport QR. */
export const FAMILY_QR_TTL_SECONDS = 5 * 60;

const storageKey = (userId: string) => `wwhealth.family.${userId}`;

/** True when the QR exists and its 5 minutes have not passed yet. */
function isActiveQr(qr: FamilyQrCode | null | undefined, now: number): qr is FamilyQrCode {
  return !!qr && typeof qr.expiresAt === 'string' && Date.parse(qr.expiresAt) > now;
}

/** Random, data-free token — matches the emergency passport idea (no medical data in the QR). */
export function createFamilyQr(memberId: string): FamilyQrCode {
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
  return {
    token,
    qrPayload: `wwhealth://family/${memberId}/${token}`,
    expiresAt: new Date(Date.now() + FAMILY_QR_TTL_SECONDS * 1000).toISOString(),
    ttlSeconds: FAMILY_QR_TTL_SECONDS,
  };
}

export function createFamilyMemberId(): string {
  return `fam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Reads the members saved for this account and drops QRs whose 5 minutes passed. */
export async function loadFamilyMembers(userId: string): Promise<FamilyMember[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    return parsed
      .filter((item): item is FamilyMember => {
        if (!item || typeof item !== 'object') return false;
        const member = item as Partial<FamilyMember>;
        return typeof member.id === 'string' && typeof member.name === 'string';
      })
      .slice(0, MAX_FAMILY_MEMBERS)
      .map((member) => ({
        id: member.id,
        name: member.name,
        relationship: typeof member.relationship === 'string' ? member.relationship : '',
        qr: isActiveQr(member.qr, now) ? member.qr : null,
      }));
  } catch {
    return [];
  }
}

export async function saveFamilyMembers(userId: string, members: FamilyMember[]): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(members));
  } catch {
    // Storage unavailable → the list still works for this session.
  }
}
