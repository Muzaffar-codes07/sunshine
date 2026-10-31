const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loginRequestSchema, staffSessionResponseSchema } = require('../dist');

test('login normalizes email and preserves password whitespace', () => {
  const parsed = loginRequestSchema.parse({ email: '  SALES@SUNSHINE.TEST  ', password: ' password ' });
  assert.equal(parsed.email, 'sales@sunshine.test');
  assert.equal(parsed.password, ' password ');
});
test('login refuses malformed input and client-supplied authority', () => {
  for (const input of [{ email: 'bad', password: 'x' }, { email: 'sales@sunshine.test', password: '' }, { email: 'sales@sunshine.test', password: 'x', role: 'ADMIN' }]) {
    assert.equal(loginRequestSchema.safeParse(input).success, false);
  }
});
test('staff session response permits only real staff roles', () => {
  const user = { id: 'b3f02476-10ba-43dd-aa92-b3129796c148', email: 'sales@sunshine.test', displayName: 'Demo Sales', role: 'SALES' };
  assert.equal(staffSessionResponseSchema.safeParse({ data: user }).success, true);
  assert.equal(staffSessionResponseSchema.safeParse({ data: { ...user, role: 'ROOT' } }).success, false);
});
