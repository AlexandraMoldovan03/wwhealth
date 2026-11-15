/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseStepUp, stepUpRoute } from '../stepUp.ts';

test('only the re-authentication step-up is recognised', () => {
  assert.equal(parseStepUp('reauth'), 'reauth');
  assert.equal(parseStepUp('mfa'), null); // MFA is not offered
  assert.equal(parseStepUp('evil'), null);
  assert.equal(parseStepUp(null), null);
  assert.equal(stepUpRoute('reauth'), '/security/reauth');
});
