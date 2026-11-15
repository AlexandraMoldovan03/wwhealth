/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHUNK_SIZE, createChunkedStorage, safeKey, splitIntoChunks, type KeyValueBackend } from '../chunkedStorage.ts';

function memory(): KeyValueBackend & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const session = JSON.stringify({ access_token: 'a'.repeat(1200), refresh_token: 'r'.repeat(40), user: { id: 'u', pad: 'x'.repeat(3000) } });

test('round-trips a large session through several chunks, every chunk under the limit', async () => {
  const secure = memory();
  const store = createChunkedStorage(secure);
  await store.setItem('sb-proj-auth-token', session);
  assert.equal(await store.getItem('sb-proj-auth-token'), session);
  const chunks = [...secure.data.entries()].filter(([k]) => k.includes('.c'));
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every(([, v]) => v.length <= CHUNK_SIZE));
});

test('shrinking a value deletes the old extra chunks; remove clears everything', async () => {
  const secure = memory();
  const store = createChunkedStorage(secure);
  await store.setItem('k', session);
  await store.setItem('k', 'small');
  assert.equal(await store.getItem('k'), 'small');
  assert.deepEqual([...secure.data.keys()].sort(), ['k', 'k.c0']);
  await store.removeItem('k');
  assert.equal(secure.data.size, 0);
  assert.equal(await store.getItem('k'), null);
});

test('migrates a legacy AsyncStorage session once and deletes the plaintext copy', async () => {
  const secure = memory();
  const legacy = memory();
  legacy.data.set('sb-proj-auth-token', session);
  const store = createChunkedStorage(secure, legacy);
  assert.equal(await store.getItem('sb-proj-auth-token'), session);
  assert.equal(legacy.data.has('sb-proj-auth-token'), false);
  assert.equal(await store.getItem('sb-proj-auth-token'), session); // now from the secure store
});

test('a missing chunk reads as signed out, never as a truncated token', async () => {
  const secure = memory();
  const store = createChunkedStorage(secure);
  await store.setItem('k', session);
  secure.data.delete('k.c1');
  assert.equal(await store.getItem('k'), null);
});

test('logout also removes a leftover legacy copy', async () => {
  const legacy = memory();
  legacy.data.set('k', 'old');
  const store = createChunkedStorage(memory(), legacy);
  await store.removeItem('k');
  assert.equal(legacy.data.size, 0);
});

test('keys are made safe for the keychain and empty values survive', async () => {
  assert.equal(safeKey('sb-x:auth/token'), 'sb-x_auth_token');
  assert.deepEqual(splitIntoChunks(''), ['']);
  const store = createChunkedStorage(memory());
  await store.setItem('e', '');
  assert.equal(await store.getItem('e'), '');
});
