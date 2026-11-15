/**
 * Extra confirmation before high-risk actions (exports, sharing with a doctor, adding an emergency contact,
 * disabling MFA, changing the password). Two layers:
 *  1. Local: Face ID / fingerprint / passcode, if the user turned the biometric lock on (UX + stolen unlocked phone).
 *  2. Server: the backend itself demands a recent real sign-in (and aal2 for MFA accounts); its
 *     `X-WWHealth-Step-Up` answer opens the re-authentication / code screen (see openStepUp).
 * Never used for the emergency passport or the emergency QR.
 */
import { router } from 'expo-router';

import { USE_MOCKS } from '@/config/config';
import { i18n } from '@/i18n';
import { ApiError } from '@/services/api/ApiError';

import { authenticateLocally, isBiometricLockEnabled } from './biometrics';
import { stepUpRoute, type StepUpKind } from './mfaLogic';
import { getSecurityStatus } from './securityApi';

export const CONFIRMATION_CANCELLED = 'Confirmation cancelled';

export async function confirmSensitiveAction(reason: string): Promise<void> {
  if (!(await isBiometricLockEnabled())) return;
  const result = await authenticateLocally(reason);
  // "unavailable" = biometrics and passcode were removed from the phone: the server checks still apply.
  if (result === 'cancel' || result === 'failed') throw new ApiError(CONFIRMATION_CANCELLED, 499);
}

let lastStepUp = 0;
/** Opens the screen the server asked for (debounced: several failing calls → one screen). */
export function openStepUp(kind: StepUpKind): void {
  if (Date.now() - lastStepUp < 1500) return;
  lastStepUp = Date.now();
  router.push(stepUpRoute(kind) as never);
}

/** For downloads that do not go through apiClient (exports): ask the server before starting. */
export async function ensureServerStepUp(): Promise<void> {
  if (USE_MOCKS) return;
  const status = await getSecurityStatus();
  if (!status.mfaSatisfied) {
    openStepUp('mfa');
    throw new ApiError('Two-factor verification required', 403);
  }
  if (!status.recentAuth) {
    openStepUp('reauth');
    throw new ApiError('Recent sign-in required', 403);
  }
}

export const reasons = {
  export: () => i18n.t('security.reasons.export'),
  share: () => i18n.t('security.reasons.share'),
  guardian: () => i18n.t('security.reasons.guardian'),
  mfaOff: () => i18n.t('security.reasons.mfaOff'),
  password: () => i18n.t('security.reasons.password'),
  lock: () => i18n.t('security.reasons.lock'),
};
