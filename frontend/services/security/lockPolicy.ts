/** When the app asks for Face ID / fingerprint again. Pure: unit-tested without React Native. */
export const LOCK_AFTER_BACKGROUND_MS = 30_000;

export interface LockInput {
  enabled: boolean;
  signedIn: boolean;
}

/** Cold start with a saved session (not right after typing the password). */
export const shouldLockOnLaunch = ({ enabled, signedIn }: LockInput, restoredSession: boolean) =>
  enabled && signedIn && restoredSession;

/** Back from the background. The system Face ID sheet only makes the app "inactive", never "background". */
export function shouldLockOnResume(input: LockInput & { backgroundedAt: number | null; now: number }): boolean {
  if (!input.enabled || !input.signedIn || input.backgroundedAt === null) return false;
  return input.now - input.backgroundedAt >= LOCK_AFTER_BACKGROUND_MS;
}

/**
 * Local unlock result → what the lock screen does. A local unlock never counts as a new sign-in on the
 * server; "unavailable" (biometrics and device passcode removed) means: sign in again with the password.
 */
export type LocalAuthResult = 'success' | 'cancel' | 'failed' | 'unavailable';
export const lockScreenAction = (result: LocalAuthResult): 'unlock' | 'stay' | 'signInAgain' =>
  result === 'success' ? 'unlock' : result === 'unavailable' ? 'signInAgain' : 'stay';
