/**
 * Where the Supabase session (access + refresh token) lives.
 * - iOS / Android: expo-secure-store (Keychain / Keystore), chunked, readable only on this device after the
 *   first unlock (so the token can be refreshed in the background). The old AsyncStorage copy is migrated
 *   once and deleted.
 * - Web: AsyncStorage (localStorage) — browsers have no secure enclave; keep web for development only.
 * Never logs values. If the Keychain fails, the session is kept in memory only (signed out at next launch)
 * instead of silently falling back to plaintext storage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { createChunkedStorage, type KeyValueBackend } from './chunkedStorage';

const KEYCHAIN = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

const secureBackend: KeyValueBackend = {
  getItem: (key) => SecureStore.getItemAsync(key, KEYCHAIN),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, KEYCHAIN),
  removeItem: (key) => SecureStore.deleteItemAsync(key, KEYCHAIN),
};

const memory = new Map<string, string>();
const chunked = createChunkedStorage(secureBackend, AsyncStorage);
let keychainBroken = false;

function warnOnce() {
  if (!keychainBroken && __DEV__) console.warn('[security] Secure storage unavailable: session kept in memory only.');
  keychainBroken = true;
}

const nativeStorage: KeyValueBackend = {
  async getItem(key) {
    if (memory.has(key)) return memory.get(key) ?? null;
    try {
      return await chunked.getItem(key);
    } catch {
      warnOnce();
      return null;
    }
  },
  async setItem(key, value) {
    try {
      await chunked.setItem(key, value);
      memory.delete(key);
    } catch {
      warnOnce();
      memory.set(key, value);
    }
  },
  async removeItem(key) {
    memory.delete(key);
    try {
      await chunked.removeItem(key);
    } catch {
      warnOnce();
    }
  },
};

export const sessionStorage: KeyValueBackend = Platform.OS === 'web' ? AsyncStorage : nativeStorage;
