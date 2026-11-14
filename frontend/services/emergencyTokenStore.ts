import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { EmergencyTokenResponse } from '@/types';

const KEY_PREFIX = 'wwhealth.emergency-token';
const webTokens = new Map<string, EmergencyTokenResponse>();
const tokenCache = new Map<string, EmergencyTokenResponse>();

function keyFor(userId: string) {
  return `${KEY_PREFIX}.${userId}`;
}

/** Keep the short-lived QR bearer token encrypted on native devices between app launches. */
export async function saveEmergencyToken(userId: string, token: EmergencyTokenResponse) {
  const key = keyFor(userId);
  tokenCache.set(key, token);
  if (Platform.OS === 'web') {
    webTokens.set(key, token);
    return;
  }
  await SecureStore.setItemAsync(key, JSON.stringify(token));
}

export async function getActiveEmergencyToken(userId: string): Promise<EmergencyTokenResponse | null> {
  const key = keyFor(userId);
  const cached = tokenCache.get(key);
  if (cached && Date.parse(cached.expiresAt) > Date.now()) return cached;
  let raw: string | null;
  if (Platform.OS === 'web') {
    const value = webTokens.get(key);
    raw = value ? JSON.stringify(value) : null;
  } else {
    raw = await SecureStore.getItemAsync(key);
  }
  if (!raw) return null;

  try {
    const token = JSON.parse(raw) as EmergencyTokenResponse;
    if (!token.tokenId || !token.qrPayload || !token.expiresAt || Date.parse(token.expiresAt) <= Date.now()) {
      await clearEmergencyToken(userId);
      return null;
    }
    tokenCache.set(key, token);
    return token;
  } catch {
    await clearEmergencyToken(userId);
    return null;
  }
}

export async function clearEmergencyToken(userId: string) {
  const key = keyFor(userId);
  tokenCache.delete(key);
  if (Platform.OS === 'web') {
    webTokens.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
