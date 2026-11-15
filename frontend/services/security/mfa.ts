/**
 * Two-step verification (TOTP) with Supabase Auth: enrol with an authenticator app, verify at sign-in,
 * disable from an aal2 session. Secrets come from Supabase once, are shown on screen and never stored here.
 */
import { supabase } from '@/services/supabase';

import { isMfaPending, mfaErrorKey, normalizeTotpCode, type AssuranceLevels } from './mfaLogic';

export class MfaError extends Error {
  constructor(readonly key: string) {
    super(key);
    this.name = 'MfaError';
  }
}

const fail = (error: { code?: string; message?: string } | null): never => {
  throw new MfaError(mfaErrorKey(error?.code, error?.message));
};

function client() {
  if (!supabase) throw new MfaError('security.notInDemo');
  return supabase;
}

export interface MfaState {
  enrolled: boolean;
  factorId: string | null;
  levels: AssuranceLevels;
}

export async function getMfaState(): Promise<MfaState> {
  const c = client();
  const [{ data: factors, error }, { data: aal }] = await Promise.all([c.auth.mfa.listFactors(), c.auth.mfa.getAuthenticatorAssuranceLevel()]);
  if (error) fail(error);
  const verified = (factors?.totp ?? []).find((f) => f.status === 'verified') ?? null;
  return {
    enrolled: !!verified,
    factorId: verified?.id ?? null,
    levels: { currentLevel: aal?.currentLevel ?? null, nextLevel: aal?.nextLevel ?? null },
  };
}

export async function mfaPendingNow(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return isMfaPending(data ? { currentLevel: data.currentLevel, nextLevel: data.nextLevel } : null);
}

export interface TotpEnrollment {
  factorId: string;
  uri: string;
  secret: string;
}

/** Starts enrolment. Unfinished earlier attempts (unverified factors) are removed first. */
export async function startTotpEnrollment(): Promise<TotpEnrollment> {
  const c = client();
  const { data: factors } = await c.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === 'totp' && f.status === 'unverified') await c.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await c.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'WWHealth',
    friendlyName: `WWHealth ${new Date().toISOString().slice(0, 16)}`,
  });
  if (error || !data) return fail(error);
  return { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret };
}

export async function verifyTotp(factorId: string, input: string): Promise<void> {
  const code = normalizeTotpCode(input);
  if (!code) throw new MfaError('security.mfa.errors.format');
  const { error } = await client().auth.mfa.challengeAndVerify({ factorId, code });
  if (error) fail(error);
}

/** Sign-in step 2: verifies the code of the account's verified TOTP factor (session becomes aal2). */
export async function completeMfaSignIn(input: string): Promise<void> {
  const state = await getMfaState();
  if (!state.factorId) throw new MfaError('security.mfa.errors.generic');
  await verifyTotp(state.factorId, input);
}

export async function cancelEnrollment(factorId: string): Promise<void> {
  if (!supabase) return;
  await supabase.auth.mfa.unenroll({ factorId }).catch(() => undefined);
}

/** Supabase itself refuses this unless the session is aal2 (code entered in this session). */
export async function disableMfa(factorId: string): Promise<void> {
  const { error } = await client().auth.mfa.unenroll({ factorId });
  if (error) fail(error);
  await client().auth.refreshSession(); // new token without the removed factor
}
