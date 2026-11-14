/**
 * WebCrypto subset for React Native (Hermes has no `crypto.subtle`), backed by expo-crypto (works in Expo Go).
 * Supabase PKCE needs it: `getRandomValues` for the code verifier and `subtle.digest('SHA-256')` for the
 * S256 challenge. Without it supabase-js falls back to Math.random + the "plain" method.
 * Import this BEFORE @supabase/supabase-js. No-op on web, where browsers provide WebCrypto.
 */
import * as ExpoCrypto from 'expo-crypto';
import { Platform } from 'react-native';

type CryptoLike = {
  getRandomValues?: typeof ExpoCrypto.getRandomValues;
  subtle?: { digest: (algorithm: string, data: BufferSource) => Promise<ArrayBuffer> };
};

if (Platform.OS !== 'web') {
  const g = globalThis as unknown as { crypto?: CryptoLike };
  const c: CryptoLike = g.crypto ?? {};
  if (typeof c.getRandomValues !== 'function') c.getRandomValues = ExpoCrypto.getRandomValues;
  if (!c.subtle) {
    c.subtle = {
      digest: (algorithm, data) => ExpoCrypto.digest(algorithm as ExpoCrypto.CryptoDigestAlgorithm, data),
    };
  }
  g.crypto = c;
}
