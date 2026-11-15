/**
 * Local biometric check (Face ID / Touch ID / fingerprint / face unlock) with the device passcode as fallback.
 * The OS does the matching: the app never sees or stores biometric data or face images, only "success / not".
 * A local unlock is NOT a server sign-in: the server keeps checking the Supabase session and, for high-risk
 * actions, a recent real sign-in.
 *
 * Expo Go: works on Android; on iOS Expo Go cannot declare NSFaceIDUsageDescription, so Face ID falls back to
 * the passcode — test Face ID in a Development Build.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { i18n } from '@/i18n';

import type { LocalAuthResult } from './lockPolicy';

const PREF_KEY = 'wwhealth.security.biometric-lock';
const listeners = new Set<(on: boolean) => void>();
let cached: boolean | null = null;

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'passcode' | 'none';
export interface BiometricSupport {
  /** Something can unlock the app: biometrics, or at least a device passcode. */
  available: boolean;
  biometricsEnrolled: boolean;
  kind: BiometricKind;
}

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export async function getBiometricSupport(): Promise<BiometricSupport> {
  if (Platform.OS === 'web') return { available: false, biometricsEnrolled: false, kind: 'none' };
  try {
    const [hasHardware, enrolled, types, level] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);
    const T = LocalAuthentication.AuthenticationType;
    const biometricsEnrolled = hasHardware && enrolled;
    const kind: BiometricKind = !biometricsEnrolled
      ? level !== LocalAuthentication.SecurityLevel.NONE ? 'passcode' : 'none'
      : types.includes(T.FACIAL_RECOGNITION) ? 'face' : types.includes(T.FINGERPRINT) ? 'fingerprint' : types.includes(T.IRIS) ? 'iris' : 'passcode';
    return { available: kind !== 'none', biometricsEnrolled, kind };
  } catch {
    return { available: false, biometricsEnrolled: false, kind: 'none' };
  }
}

export async function authenticateLocally(reason: string): Promise<LocalAuthResult> {
  const support = await getBiometricSupport();
  if (!support.available) return 'unavailable';
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: i18n.t('common.cancel'),
      fallbackLabel: i18n.t('security.biometric.usePasscode'),
      disableDeviceFallback: false, // device passcode always works as the secure fallback
    });
    if (res.success) return 'success';
    if (res.error === 'not_enrolled' || res.error === 'not_available' || res.error === 'passcode_not_set') return 'unavailable';
    if (res.error === 'user_cancel' || res.error === 'system_cancel' || res.error === 'app_cancel') return 'cancel';
    return 'failed';
  } catch {
    return 'failed';
  }
}

export async function isBiometricLockEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (cached !== null) return cached;
  cached = (await SecureStore.getItemAsync(PREF_KEY).catch(() => null)) === '1';
  return cached;
}

export async function setBiometricLockEnabled(on: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  if (on) await SecureStore.setItemAsync(PREF_KEY, '1');
  else await SecureStore.deleteItemAsync(PREF_KEY).catch(() => undefined);
  cached = on;
  listeners.forEach((l) => l(on));
}

export function subscribeBiometricLock(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
