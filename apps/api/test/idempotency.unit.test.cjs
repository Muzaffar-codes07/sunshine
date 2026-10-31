const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPayload, readIdempotencyKey } = require('../dist/platform/idempotency');

const request = (value) => ({ header: (name) => (name.toLowerCase() === 'idempotency-key' ? value : undefined) });

test('the Idempotency-Key header is required and must be 8–128 safe characters', () => {
  assert.equal(readIdempotencyKey(request(' 3f1c2b9e-7a44-4d1e-9b0a-1c2d3e4f5a6b ')), '3f1c2b9e-7a44-4d1e-9b0a-1c2d3e4f5a6b');
  for (const bad of [undefined, '', 'short', 'has spaces in it', 'x'.repeat(129), 'semi;colon-key']) {
    assert.throws(() => readIdempotencyKey(request(bad)), (error) => {
      assert.equal(error.getStatus(), 400);
      assert.ok(error.fieldErrors['Idempotency-Key']?.length, JSON.stringify(bad));
      return true;
    });
  }
});

test('the payload hash ignores key order but not values, nesting or array order', () => {
  const hash = hashPayload({ b: 1, a: { y: [1, 2], x: 'z' } });
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hashPayload({ a: { x: 'z', y: [1, 2] }, b: 1 }), hash);
  for (const other of [{ b: 2, a: { y: [1, 2], x: 'z' } }, { b: 1, a: { y: [2, 1], x: 'z' } }, { b: 1 }, undefined]) {
    assert.notEqual(hashPayload(other), hash);
  }
});
