// Real PostgreSQL API test for POST /api/v1/enquiries. It writes rows, so it only runs against a
// disposable database named in TEST_DATABASE_URL (database name must contain "test"), never DATABASE_URL.
// Setup once: docker compose exec db createdb -U sunshine sunshine_test
//             DATABASE_URL=<test url> npx prisma migrate deploy
// Run:        TEST_DATABASE_URL=<test url> npm run test:db -w @sunshine/api   (after building the API)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) {
  throw new Error('Set TEST_DATABASE_URL to a disposable database whose name contains "test"; refusing to write to another database.');
}
// PrismaService reads DATABASE_URL, so point it at the disposable database before the app loads.
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET ??= 'test-only-session-secret-never-use-outside-tests';

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

test('a returning customer is matched by phone, not overwritten, and the new site is kept on the enquiry', async () => {
  const phone = runPhone();
  const first = await (await post(valid({ phone, name: 'Original Name' }))).json();
  const second = await (await post(valid({ phone, name: 'Someone Else', addressLine: '99 Factory Lane', city: 'Medchal' }))).json();
  const [a, b] = await Promise.all([first, second].map((r) => prisma.enquiry.findUniqueOrThrow({ where: { id: r.data.id }, include: { customer: true } })));
  assert.equal(a.customerId, b.customerId);
  assert.equal(b.customer.name, 'Original Name');
  assert.equal(b.customer.addressLine, '12 Sunshine Road');
  assert.equal(b.contactName, 'Someone Else');
  assert.equal(b.siteAddressLine, '99 Factory Lane');
  assert.equal(b.siteCity, 'Medchal');
});

test('database CHECK rejects an out-of-range capacity even if the API is bypassed', async () => {
  const customer = await prisma.customer.create({ data: {
    name: 'Check Test', phone: runPhone(), addressLine: '1 Test Street', city: 'Hyderabad', pincode: '500001',
  } });
  const site = { contactName: 'Check Test', siteAddressLine: '1 Test Street', siteCity: 'Hyderabad', sitePincode: '500001' };
  await assert.rejects(prisma.enquiry.create({ data: { customerId: customer.id, source: 'PHONE', requestedCapacityKw: 7, ...site } }));
  await assert.rejects(prisma.enquiry.create({ data: { customerId: customer.id, source: 'PHONE', requestedCapacityKw: 3, status: 'ARCHIVED', ...site } }));
  await assert.rejects(prisma.enquiry.create({ data: { customerId: customer.id, source: 'PHONE', requestedCapacityKw: 3, ...site, sitePincode: '012345' } }));
});

test('the sixth public submission from one address within a minute is rate limited', async () => {
  const response = await post(valid());
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, 'RATE_LIMITED');
});
