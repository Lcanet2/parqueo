import test from 'node:test';
import assert from 'node:assert/strict';

const { uid } = await import('../src/lib/uid.js');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('uid : UUID v4 quand randomUUID est disponible', () => {
  assert.match(uid(), UUID_V4);
});

// Reproduit une page servie en HTTP hors localhost (contexte non sécurisé).
test('uid : repli sur getRandomValues sans randomUUID', (t) => {
  const original = crypto.randomUUID;
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  t.after(() => Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true }));

  const ids = new Set(Array.from({ length: 100 }, uid));
  assert.equal(ids.size, 100);
  for (const id of ids) assert.match(id, UUID_V4);
});
