/** Pure helpers for Supabase TOTP (unit-tested without React Native). */

/** Keeps the digits a user typed or pasted ("123 456" → "123456"); null until exactly 6 digits. */
export function normalizeTotpCode(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  return digits.length === 6 ? digits : null;
}

export interface AssuranceLevels {
  currentLevel: string | null;
  nextLevel: string | null;
}

/** Signed in with the password but the TOTP step is still missing (incomplete MFA login). */
export const isMfaPending = (aal: AssuranceLevels | null) =>
  !!aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2';

/** Supabase MFA error → translation key (never the raw server text). */
export function mfaErrorKey(code?: string, message?: string): string {
  const m = (message ?? '').toLowerCase();
  if (code === 'mfa_verification_failed' || m.includes('invalid totp') || m.includes('invalid code')) return 'security.mfa.errors.invalidCode';
  if (code === 'mfa_challenge_expired' || m.includes('expired')) return 'security.mfa.errors.expired';
  if (code === 'over_request_rate_limit' || code === 'mfa_verification_rejected' || m.includes('rate limit') || m.includes('too many'))
    return 'security.mfa.errors.tooMany';
  if (code === 'insufficient_aal') return 'security.mfa.errors.needsCode';
  if (code === 'mfa_totp_enroll_not_enabled' || code === 'mfa_totp_enroll_disabled') return 'security.mfa.errors.notEnabled';
  if (m.includes('network') || m.includes('fetch')) return 'auth.errors.network';
  return 'security.mfa.errors.generic';
}

/** Groups the TOTP secret for manual entry: "JBSWY3DP..." → "JBSW Y3DP ...". */
export const formatSecret = (secret: string) => secret.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

/** Server step-up header (`X-WWHealth-Step-Up`) → where the app sends the user. */
export type StepUpKind = 'mfa' | 'reauth' | 'mfa-enroll';
export function parseStepUp(header: string | null | undefined): StepUpKind | null {
  return header === 'mfa' || header === 'reauth' || header === 'mfa-enroll' ? header : null;
}
export const stepUpRoute = (kind: StepUpKind) =>
  kind === 'mfa' ? '/security/mfa-challenge' : kind === 'reauth' ? '/security/reauth' : '/security';
