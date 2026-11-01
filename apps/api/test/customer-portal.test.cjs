const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
require('reflect-metadata');
const { CustomerGuard } = require('../dist/customer/customer.guard');
const { CustomerAuthService } = require('../dist/customer/customer-auth.service');
const { CustomerPortalService } = require('../dist/customer/customer-portal.service');
const { hashPassword } = require('../dist/auth/passwords');
const context = request => ({ switchToHttp: () => ({ getRequest: () => request }) });

test('customer guard rejects staff sessions and rechecks verified/active account state', async () => {
  let state = { customerId: 'customer-a', verifiedAt: new Date(), active: true };
  const guard = new CustomerGuard({ customerAccount: { findUnique: async () => state } });
  await assert.rejects(guard.canActivate(context({ session: { staffUserId: 'staff' } })), error => error.getStatus() === 401);
  const request = { session: { customerAccountId: 'account-a' } };
  assert.equal(await guard.canActivate(context(request)), true);
  assert.equal(request.customerId, 'customer-a');
  state = { ...state, active: false };
  await assert.rejects(guard.canActivate(context(request)), error => error.getStatus() === 401);
});

test('registration requires one recorded customer email and does not claim ambiguous profiles', async () => {
  const service = new CustomerAuthService({ customer: { findMany: async () => [{ id: 'a' }, { id: 'b' }] } }, { assertConfigured() {} });
  const result = await service.register({ email: 'shared@example.test', password: 'test-password-2026' });
  assert.deepEqual(Object.keys(result.data), ['message']);
});

test('registration stores only the verification token hash and sends the token to the recorded email', async () => {
  let saved, sent;
  const service = new CustomerAuthService({
    customer: { findMany: async () => [{ id: 'customer-a' }] },
    customerAccount: { findUnique: async () => null, upsert: async input => { saved = input.create; } },
  }, { assertConfigured() {}, sendVerification: async (...args) => { sent = args; } });
  const result = await service.register({ email: 'a@example.test', password: 'test-password-2026' });
  assert.equal(sent[0], 'a@example.test');
  assert.equal(saved.registrationTokenHash, createHash('sha256').update(sent[1]).digest('hex'));
  assert.notEqual(saved.registrationTokenHash, sent[1]);
  assert.ok(saved.passwordHash.startsWith('scrypt$'));
  assert.equal(JSON.stringify(result).includes(sent[1]), false);
});

test('matching password cannot log in before email verification', async () => {
  const passwordHash = await hashPassword('test-password-2026');
  const service = new CustomerAuthService({ customerAccount: { findUnique: async () => ({ active: true, verifiedAt: null, passwordHash }) } }, {});
  await assert.rejects(service.login({ email: 'a@example.test', password: 'test-password-2026' }), error => error.getStatus() === 401);
});

test('consumed verification token cannot update a customer profile again', async () => {
  const service = new CustomerAuthService({
    customerAccount: { findUnique: async () => ({ id: 'account-a', customerId: 'customer-a', active: true, registrationExpiresAt: new Date(Date.now() + 60000) }) },
    $transaction: async action => action({ customerAccount: { updateMany: async () => ({ count: 0 }) } }),
  }, {});
  await assert.rejects(service.verify('a'.repeat(64)), error => error.code === 'VERIFICATION_EXPIRED');
});

test('portal queries scope every business collection to the authenticated customer and exclude draft quotes', async () => {
  const calls = {};
  const prisma = Object.fromEntries(['enquiry', 'order', 'quote', 'invoice', 'allocation', 'serviceTicket', 'job'].map(name => [name, { findMany: async args => { calls[name] = args; return []; } }]));
  const portal = new CustomerPortalService(prisma, { profile: async () => ({ id: 'customer-a' }) }, {});
  const result = await portal.snapshot('customer-a', 'account-a');
  for (const name of ['enquiry', 'order', 'quote', 'invoice', 'serviceTicket']) assert.equal(calls[name].where.customerId, 'customer-a');
  assert.equal(calls.allocation.where.job.order.customerId, 'customer-a');
  assert.equal(calls.job.where.order.customerId, 'customer-a');
  assert.deepEqual(calls.quote.where.status.in, ['SENT', 'ACCEPTED', 'REJECTED']);
  assert.equal(result.data.documents.length, 0);
});

test('document download denies a file without an owned photo or signature association', async () => {
  const portal = new CustomerPortalService({
    file: { findUnique: async () => ({ id: 'file-other' }) },
    jobPhoto: { findFirst: async () => null }, job: { findFirst: async () => null },
  }, {}, { read: async () => { assert.fail('must not read unauthorized bytes'); } });
  await assert.rejects(portal.download('customer-a', 'file-other'), error => error.getStatus() === 404);
});
