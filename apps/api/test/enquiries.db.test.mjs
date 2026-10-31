// Real PostgreSQL API test for POST /api/v1/enquiries.
// Needs a migrated database (npm run db:up && npm run db:deploy) and a built API (npm run build -w @sunshine/api).
// Run: npm run test:db -w @sunshine/api
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { config } from 'dotenv';

const require = createRequire(import.meta.url);
config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
const { PrismaService } = require('../dist/platform/prisma.service');

let app;
let baseUrl;
let prisma;
// Unique per run so reruns never collide with earlier rows.
const runPhone = () => `9${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 10)}`;

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  baseUrl = `${await app.getUrl()}/api/v1`;
  prisma = app.get(PrismaService);
});

after(async () => {
  await app?.close();
});

// All requests come from 127.0.0.1, so the five posts above the final test use up the per-IP budget.
const post = (body) => fetch(`${baseUrl}/enquiries`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const valid = (overrides = {}) => ({
  name: 'Asha Rao', phone: runPhone(), addressLine: '12 Sunshine Road', city: 'Hyderabad',
  pincode: '500001', requestedCapacityKw: 3, systemType: 'ON_GRID', subsidyInterest: true, ...overrides,
});

test('valid enquiry is persisted as a NEW web enquiry linked to a customer', async () => {
  const input = valid({ phone: '+91 ' + runPhone().replace(/(\d{5})(\d{5})/, '$1 $2') });
  const response = await post(input);
  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.equal(data.status, 'NEW');
  const row = await prisma.enquiry.findUniqueOrThrow({ where: { id: data.id }, include: { customer: true } });
  assert.equal(row.source, 'WEB');
  assert.equal(row.requestedCapacityKw, 3);
  assert.match(row.customer.phone, /^[6-9][0-9]{9}$/);
});

test('invalid input returns 400 INVALID_INPUT with per-field messages and writes nothing', async () => {
  const before = await prisma.enquiry.count();
  const response = await post(valid({ phone: '12345', pincode: '0123', requestedCapacityKw: 9 }));
  assert.equal(response.status, 400);
  const { error } = await response.json();
  assert.equal(error.code, 'INVALID_INPUT');
  assert.ok(error.fieldErrors.phone?.length);
  assert.ok(error.fieldErrors.pincode?.length);
  assert.ok(error.fieldErrors.requestedCapacityKw?.length);
  assert.equal(await prisma.enquiry.count(), before);
});

test('server-owned fields cannot be supplied by the public form', async () => {
  const response = await post({ ...valid(), status: 'QUALIFIED' });
  assert.equal(response.status, 400);
  const { error } = await response.json();
  assert.ok(error.fieldErrors._form?.length);
});

test('a returning customer is matched by phone and their record is not overwritten', async () => {
  const phone = runPhone();
  const first = await (await post(valid({ phone, name: 'Original Name' }))).json();
  const second = await (await post(valid({ phone, name: 'Someone Else' }))).json();
  const rows = await prisma.enquiry.findMany({ where: { id: { in: [first.data.id, second.data.id] } }, include: { customer: true } });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].customerId, rows[1].customerId);
  assert.equal(rows[0].customer.name, 'Original Name');
});

test('database CHECK rejects an out-of-range capacity even if the API is bypassed', async () => {
  const customer = await prisma.customer.create({ data: {
    name: 'Check Test', phone: runPhone(), addressLine: '1 Test Street', city: 'Hyderabad', pincode: '500001',
  } });
  await assert.rejects(prisma.enquiry.create({ data: { customerId: customer.id, source: 'PHONE', requestedCapacityKw: 7 } }));
  await assert.rejects(prisma.enquiry.create({ data: { customerId: customer.id, source: 'PHONE', requestedCapacityKw: 3, status: 'ARCHIVED' } }));
});

test('the sixth public submission from one address within a minute is rate limited', async () => {
  const response = await post(valid());
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, 'RATE_LIMITED');
});
