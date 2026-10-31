// Real PostgreSQL tests for the staff enquiry queue service. Same isolation rule as enquiries.db.test.mjs:
// only runs against TEST_DATABASE_URL naming a disposable "test" database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) {
  throw new Error('Set TEST_DATABASE_URL to a disposable database whose name contains "test"; refusing to write to another database.');
}
process.env.DATABASE_URL = testUrl;

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/platform/prisma.service');
const { EnquiryQueueService } = require('../dist/sales/enquiry-queue.service');

let app;
let prisma;
let queue;
let salesUser;
let warehouseUser;

const phone = () => `8${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 10)}`;
const user = (role) => prisma.user.create({ data: {
  email: `${randomUUID()}@test.local`, displayName: `${role} tester`, passwordHash: 'not-a-real-hash', role,
} });

async function enquiry(overrides = {}) {
  const customer = await prisma.customer.create({ data: {
    name: 'Queue Test', phone: phone(), addressLine: '5 Queue Street', city: 'Hyderabad', pincode: '500001',
  } });
  return prisma.enquiry.create({ data: {
    customerId: customer.id, source: 'PHONE', requestedCapacityKw: 3,
    contactName: 'Queue Test', siteAddressLine: '5 Queue Street', siteCity: 'Hyderabad', sitePincode: '500001', ...overrides,
  } });
}

const rejectsWith = (promise, status, code) => assert.rejects(promise, (error) => {
  assert.equal(error.getStatus(), status);
  assert.equal(error.code, code);
  return true;
});

before(async () => {
  app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  prisma = app.get(PrismaService);
  queue = app.get(EnquiryQueueService);
  salesUser = await user('SALES');
  warehouseUser = await user('WAREHOUSE');
});

after(async () => {
  await app?.close();
});

test('list puts due follow-ups first and pages with a total', async () => {
  const owner = await user('SALES');
  const later = await enquiry({ ownerId: owner.id, nextFollowUpAt: new Date('2026-11-02T04:30:00Z') });
  const sooner = await enquiry({ ownerId: owner.id, nextFollowUpAt: new Date('2026-11-01T04:30:00Z') });
  const none = await enquiry({ ownerId: owner.id });
  const first = await queue.list({ ownerId: owner.id, page: 1, pageSize: 2 });
  assert.equal(first.data.total, 3);
  assert.deepEqual(first.data.items.map((item) => item.id), [sooner.id, later.id]);
  const second = await queue.list({ ownerId: owner.id, page: 2, pageSize: 2 });
  assert.deepEqual(second.data.items.map((item) => item.id), [none.id]);
});

test('contacted then qualified records the call facts and bumps the version each time', async () => {
  const row = await enquiry();
  const contacted = await queue.markContacted(row.id, { version: 1 });
  assert.equal(contacted.data.status, 'CONTACTED');
  assert.equal(contacted.data.version, 2);
  const qualified = await queue.qualify(row.id, {
    version: 2, shadowFreeRoofAreaSqm: '24.50', monthlyBillInr: '3200.00', gridConnectionSuitable: true, outcome: 'QUALIFIED',
  });
  assert.equal(qualified.data.status, 'QUALIFIED');
  assert.equal(qualified.data.shadowFreeRoofAreaSqm, '24.50');
  assert.equal(qualified.data.monthlyBillInr, '3200.00');
  assert.equal(qualified.data.version, 3);
});

test('a stale version is refused, and of two simultaneous edits only one wins', async () => {
  const row = await enquiry();
  await rejectsWith(queue.markContacted(row.id, { version: 5 }), 409, 'STALE_VERSION');
  const results = await Promise.allSettled([
    queue.assign(row.id, { version: 1, ownerId: salesUser.id, nextFollowUpAt: null }),
    queue.archive(row.id, { version: 1, reason: 'Duplicate of an earlier enquiry' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const loser = results.find((r) => r.status === 'rejected');
  assert.equal(loser.reason.code, 'STALE_VERSION');
});

test('disqualifying keeps the reason; a closed enquiry cannot be requalified or reassigned', async () => {
  const row = await enquiry();
  const out = await queue.qualify(row.id, {
    version: 1, shadowFreeRoofAreaSqm: '3.00', monthlyBillInr: '600.00', gridConnectionSuitable: false,
    outcome: 'DISQUALIFIED', reason: 'Roof fully shaded by neighbouring building',
  });
  assert.equal(out.data.closedReason, 'Roof fully shaded by neighbouring building');
  const archived = await queue.archive(row.id, { version: 2, reason: 'Closed after disqualification' });
  assert.equal(archived.data.status, 'ARCHIVED');
  await rejectsWith(queue.qualify(row.id, {
    version: 3, shadowFreeRoofAreaSqm: '30.00', monthlyBillInr: '900.00', gridConnectionSuitable: true, outcome: 'QUALIFIED',
  }), 409, 'INVALID_TRANSITION');
  await rejectsWith(queue.assign(row.id, { version: 3, ownerId: null, nextFollowUpAt: null }), 409, 'INVALID_TRANSITION');
});

test('only an active sales or admin user can own an enquiry', async () => {
  const row = await enquiry();
  await assert.rejects(queue.assign(row.id, { version: 1, ownerId: warehouseUser.id, nextFollowUpAt: null }), (error) => {
    assert.equal(error.getStatus(), 400);
    assert.ok(error.fieldErrors.ownerId?.length);
    return true;
  });
  const assigned = await queue.assign(row.id, { version: 1, ownerId: salesUser.id, nextFollowUpAt: '2026-11-01T05:00:00.000Z' });
  assert.equal(assigned.data.ownerId, salesUser.id);
  assert.equal(assigned.data.nextFollowUpAt, '2026-11-01T05:00:00.000Z');
});

test('an unknown enquiry is a 404', async () => {
  await rejectsWith(queue.get(randomUUID()), 404, 'NOT_FOUND');
  await rejectsWith(queue.markContacted(randomUUID(), { version: 1 }), 404, 'NOT_FOUND');
});
