const { test } = require('node:test');
const assert = require('node:assert/strict');
const { healthResponseSchema, apiErrorSchema } = require('../dist');

test('health contract rejects invalid upstream payloads', () => {
  assert.equal(healthResponseSchema.safeParse({ data: { status: 'ok' } }).success, false);
  assert.equal(healthResponseSchema.safeParse({ data: {
    service: 'sunshine-api', status: 'ok', timestamp: new Date().toISOString(),
  } }).success, true);
});

test('error contract requires a traceable request id and field-error lists', () => {
  assert.equal(apiErrorSchema.safeParse({ error: {
    code: 'INVALID_INPUT', message: 'Invalid email', fieldErrors: { email: ['Invalid email'] },
    requestId: 'b3f02476-10ba-43dd-aa92-b3129796c148',
  } }).success, true);
  assert.equal(apiErrorSchema.safeParse({ error: { code: 'INVALID_INPUT' } }).success, false);
});
