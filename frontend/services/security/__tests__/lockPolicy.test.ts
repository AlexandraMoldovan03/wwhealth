/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LOCK_AFTER_BACKGROUND_MS, lockScreenAction, shouldLockOnLaunch, shouldLockOnResume } from '../lockPolicy.ts';

test('locks a restored session at launch only when the user enabled it', () => {
  assert.equal(shouldLockOnLaunch({ enabled: true, signedIn: true }, true), true);
  assert.equal(shouldLockOnLaunch({ enabled: true, signedIn: true }, false), false); // just typed the password
  assert.equal(shouldLockOnLaunch({ enabled: false, signedIn: true }, true), false);
  assert.equal(shouldLockOnLaunch({ enabled: true, signedIn: false }, true), false);
});

test('locks after a real stay in the background, not for a quick switch', () => {
  const base = { enabled: true, signedIn: true, now: 100_000 };
  assert.equal(shouldLockOnResume({ ...base, backgroundedAt: 100_000 - LOCK_AFTER_BACKGROUND_MS }), true);
  assert.equal(shouldLockOnResume({ ...base, backgroundedAt: 100_000 - 5_000 }), false);
  assert.equal(shouldLockOnResume({ ...base, backgroundedAt: null }), false);
  assert.equal(shouldLockOnResume({ ...base, enabled: false, backgroundedAt: 0 }), false);
});

test('without biometrics or passcode the only way back is signing in again', () => {
  assert.equal(lockScreenAction('success'), 'unlock');
  assert.equal(lockScreenAction('cancel'), 'stay');
  assert.equal(lockScreenAction('failed'), 'stay');
  assert.equal(lockScreenAction('unavailable'), 'signInAgain');
});
