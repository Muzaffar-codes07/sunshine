const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../dist/auth/passwords');
const { assertTrustedMutationOrigin } = require('../dist/auth/auth.middleware');
const { AuthGuard } = require('../dist/auth/auth.guard');
const { RolesGuard } = require('../dist/auth/roles.guard');

const origin = 'http://127.0.0.1:3001';
function request(overrides = {}) { return { method: 'POST', originalUrl: '/api/v1/auth/login', headers: {}, ...overrides }; }
function context(userRequest) { return { switchToHttp: () => ({ getRequest: () => userRequest }), getHandler: () => ({}), getClass: () => ({}) }; }

test('passwords are salted, verified, and malformed hashes fail safely', async () => {
  const a = await hashPassword('local-test-password');
  const b = await hashPassword('local-test-password');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('local-test-password', a), true);
  assert.equal(await verifyPassword('wrong-password', a), false);
  for (const hash of ['', 'plaintext', 'scrypt$99999999$8$1$salt$key']) assert.equal(await verifyPassword('anything', hash), false);
});

test('mutation origin policy rejects missing/null/foreign/same-site-different origins and ignores spoofed Host', () => {
  for (const headers of [{}, { origin: 'null' }, { origin: 'https://evil.example' }, { origin: 'http://127.0.0.1:3002' }, { host: '127.0.0.1:3001', 'sec-fetch-site': 'same-origin' }]) {
    assert.throws(() => assertTrustedMutationOrigin(request({ headers }), [origin]), (error) => error.code === 'CSRF_REJECTED');
  }
  assert.doesNotThrow(() => assertTrustedMutationOrigin(request({ headers: { origin } }), [origin]));
  assert.doesNotThrow(() => assertTrustedMutationOrigin(request({ headers: { referer: `${origin}/orders` } }), [origin]));
  assert.throws(() => assertTrustedMutationOrigin(request({ headers: { origin: 'null', referer: `${origin}/` } }), [origin]));
  assert.throws(() => assertTrustedMutationOrigin(request({ headers: { origin: `${origin}/path` } }), [origin]));
});

test('every unsafe method, login/logout and multipart use the origin policy; only anonymous public enquiries are exempt', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.throws(() => assertTrustedMutationOrigin(request({ method, originalUrl: '/api/v1/files', session: { staffUserId: 'staff' }, headers: { 'content-type': 'multipart/form-data' } }), [origin]));
  }
  assert.throws(() => assertTrustedMutationOrigin(request({ originalUrl: '/api/v1/auth/logout' }), [origin]));
  assert.doesNotThrow(() => assertTrustedMutationOrigin(request({ originalUrl: '/api/v1/enquiries' }), [origin]));
  assert.throws(() => assertTrustedMutationOrigin(request({ originalUrl: '/api/v1/enquiries', session: { staffUserId: 'staff' } }), [origin]));
  assert.doesNotThrow(() => assertTrustedMutationOrigin(request({ method: 'GET' }), [origin]));
});

test('AuthGuard rejects absent or inactive users, then attaches fresh server identity', async () => {
  const staff = { id: 'staff', role: 'SALES' };
  const guard = new AuthGuard({ findActiveStaff: async (id) => id === 'staff' ? staff : null });
  await assert.rejects(guard.canActivate(context({})), (error) => error.getStatus() === 401);
  await assert.rejects(guard.canActivate(context({ session: { staffUserId: 'disabled' } })), (error) => error.getStatus() === 401);
  const req = { session: { staffUserId: 'staff' } };
  assert.equal(await guard.canActivate(context(req)), true);
  assert.equal(req.user, staff);
});

test('RolesGuard enforces server identity and the declared role allowlist', () => {
  const guard = new RolesGuard({ getAllAndOverride: () => ['ADMIN', 'SALES'] });
  assert.throws(() => guard.canActivate(context({})), (error) => error.getStatus() === 401);
  assert.throws(() => guard.canActivate(context({ user: { role: 'TECHNICIAN' } })), (error) => error.getStatus() === 403);
  assert.equal(guard.canActivate(context({ user: { role: 'SALES' } })), true);
});

test('proxy configuration parses booleans and hop counts while preserving explicit address ranges', () => {
  const { parseTrustProxy } = require('../dist/auth/trust-proxy');
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy(''), false);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy(' 1 '), 1);
  assert.equal(parseTrustProxy('0'), 0);
  assert.equal(parseTrustProxy('loopback'), 'loopback');
  assert.equal(parseTrustProxy('127.0.0.1, ::1'), '127.0.0.1, ::1');
  assert.throws(() => parseTrustProxy('9999999999999999999999999'));
});
