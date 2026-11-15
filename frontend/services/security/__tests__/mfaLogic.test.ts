/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatSecret, isMfaPending, mfaErrorKey, normalizeTotpCode, parseStepUp, stepUpRoute } from '../mfaLogic.ts';

test('accepts only 6-digit codes, ignoring spaces from paste', () => {
  assert.equal(normalizeTotpCode('123 456'), '123456');
  assert.equal(normalizeTotpCode('12345'), null);
  assert.equal(normalizeTotpCode('1234567'), null);
  assert.equal(normalizeTotpCode('abcdef'), null);
});

test('an MFA account signed in with only the password is pending', () => {
  assert.equal(isMfaPending({ currentLevel: 'aal1', nextLevel: 'aal2' }), true);
  assert.equal(isMfaPending({ currentLevel: 'aal2', nextLevel: 'aal2' }), false);
  assert.equal(isMfaPending({ currentLevel: 'aal1', nextLevel: 'aal1' }), false); // no MFA
  assert.equal(isMfaPending(null), false);
});

test('wrong, expired and throttled codes get distinct messages, raw errors never shown', () => {
  assert.equal(mfaErrorKey('mfa_verification_failed'), 'security.mfa.errors.invalidCode');
  assert.equal(mfaErrorKey(undefined, 'Invalid TOTP code entered'), 'security.mfa.errors.invalidCode');
  assert.equal(mfaErrorKey('mfa_challenge_expired'), 'security.mfa.errors.expired');
  assert.equal(mfaErrorKey('over_request_rate_limit'), 'security.mfa.errors.tooMany');
  assert.equal(mfaErrorKey('insufficient_aal'), 'security.mfa.errors.needsCode');
  assert.equal(mfaErrorKey('something_else', 'internal details'), 'security.mfa.errors.generic');
});

test('server step-up header maps to the right screen', () => {
  assert.equal(parseStepUp('mfa'), 'mfa');
  assert.equal(parseStepUp('reauth'), 'reauth');
  assert.equal(parseStepUp('evil'), null);
  assert.equal(parseStepUp(null), null);
  assert.equal(stepUpRoute('mfa'), '/security/mfa-challenge');
  assert.equal(stepUpRoute('reauth'), '/security/reauth');
  assert.equal(stepUpRoute('mfa-enroll'), '/security');
  assert.equal(formatSecret('JBSWY3DPEHPK3PXP'), 'JBSW Y3DP EHPK 3PXP');
});
