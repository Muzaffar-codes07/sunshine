// Explicit disposable test database only; never load the application .env. Sorts after the stock tests, which assume no stock is left behind.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('TEST_DATABASE_URL must name a disposable test database');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'warranty-policy-tests-only-session-secret';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
process.env.SESSION_COOKIE_SECURE = 'false';
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
const { PrismaService } = require('../dist/platform/prisma.service');
const { IdempotencyService } = require('../dist/platform/idempotency');
const { QuotesService } = require('../dist/quotes/quotes.service');
const { SurveysService } = require('../dist/sales/surveys.service');
const { OrdersService } = require('../dist/orders/orders.service');
const { InvoicesService } = require('../dist/finance/invoices.service');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { catalogueDemoId: id, demoProducts } = require('../dist/catalog/demo-catalogue');
const { seedWarrantyPolicies, demoWarrantyPolicies } = require('../dist/warranty/seed-warranty-policies');
const { istDate, addCalendarMonths } = require('../dist/warranty/warranty-activation');
const { hashPassword } = require('../dist/auth/passwords');
const { Client } = require('pg');

const origin = 'http://127.0.0.1:3001';
const password = 'warranty-policy-test-password-2026';
const facts = { roofDirection: 'S', roofTiltDeg: '18.5', cableDistanceM: '22.00', usableRoofAreaSqm: '30.00' };
const cookies = {}; const staff = {};
let app, base, prisma, idempotency, quotes, surveys, orders, invoices, sql, main;
const identity = (row) => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1'); base = (await app.getUrl()) + '/api/v1';
  prisma = app.get(PrismaService); idempotency = app.get(IdempotencyService); quotes = app.get(QuotesService); surveys = app.get(SurveysService);
  orders = app.get(OrdersService); invoices = app.get(InvoicesService);
  await seedCatalogue(prisma);
  await seedWarrantyPolicies(prisma);
  sql = new Client({ connectionString: testUrl }); await sql.connect();
  for (const [name, role] of [['SALES', 'SALES'], ['ADMIN', 'ADMIN'], ['WAREHOUSE', 'WAREHOUSE'], ['TECH', 'TECHNICIAN']]) {
    staff[name] = await prisma.user.create({ data: { email: randomUUID() + '@test.local', displayName: name + ' warranty tester', role, passwordHash: await hashPassword(password) } });
    const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email: staff[name].email, password }) });
    assert.equal(response.status, 200); cookies[name] = response.headers.get('set-cookie').split(';')[0];
  }
  main = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'MAIN' } });
});
after(async () => { await prisma?.productWarrantyPolicy.deleteMany(); await sql?.end(); await app?.close(); });

const send = (route, body, key = randomUUID()) => fetch(base + route, {
  method: 'POST', headers: { 'content-type': 'application/json', origin, 'idempotency-key': key, cookie: cookies.WAREHOUSE }, body: JSON.stringify(body),
});
const ok = async (pending, status = 200) => {
  const response = await pending; const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); return body.data;
};
const refused = async (pending, status, code) => {
  const response = await pending; const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); assert.equal(body.error.code, code);
};
const version = async (jobId) => (await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).version;

/** A real quote through to a paid order, using whatever policies are configured right now. */
async function newOrder() {
  const customer = await prisma.customer.create({ data: { name: 'Warranty Customer', phone: `7${String(randomInt(1e9)).padStart(9, '0')}`, addressLine: '8 Roof Road', city: 'Nagpur', pincode: '440001' } });
  const enquiry = await prisma.enquiry.create({ data: { customerId: customer.id, source: 'PHONE', requestedCapacityKw: 1, status: 'QUALIFIED', contactName: 'Warranty Customer', siteAddressLine: '8 Roof Road', siteCity: 'Nagpur', sitePincode: '440001' } });
  const sales = identity(staff.SALES);
  const survey = (await surveys.schedule(enquiry.id, { technicianId: staff.TECH.id, scheduledFor: '2026-11-02T05:00:00.000Z' })).data;
  await surveys.submit(survey.id, { version: 1, ...facts }, identity(staff.TECH));
  await surveys.approve(survey.id, { version: 2 }, sales);
  const draft = (await quotes.create(enquiry.id, { surveyId: survey.id, packageId: id(1001) }, sales)).data;
  await quotes.send(draft.id, { version: 1, channel: 'PRINT' }, sales);
  await quotes.accept(draft.id, { version: 2, acceptedByName: 'Warranty Customer', channel: 'IN_PERSON' }, sales);
  const order = (await orders.confirm({ quoteId: draft.id }, randomUUID(), sales)).data;
  const receipt = { amountInr: '1000.00', method: 'UPI', reference: `UTR${randomUUID().slice(0, 12)}`, receivedAt: new Date().toISOString() };
  await idempotency.run({ actorId: staff.ADMIN.id, key: randomUUID(), action: 'PAYMENT_RECEIPT', payload: receipt }, (tx) => invoices.recordPayment(tx, order.invoice.id, receipt, identity(staff.ADMIN)));
  return { order, quote: draft };
}
/** Received, reserved, scanned and posted: everything short of delivery. */
async function posted(order) {
  const products = await prisma.product.findMany({ where: { id: { in: order.packing.map((line) => line.productId) } } });
  for (const product of products) {
    const needed = order.packing.filter((line) => line.productId === product.id).reduce((sum, line) => sum + Number(line.quantity), 0);
    const serials = product.trackingMode === 'SERIALIZED' ? Array.from({ length: needed }, () => 'WP-' + randomUUID().slice(0, 13).toUpperCase()) : [];
    await ok(send('/stock/receipts', { reference: 'REC-' + randomUUID(), locationId: main.id, receivedAt: '2026-10-30T10:00:00.000Z', lines: [{ productId: product.id, quantity: String(needed), unitCost: '10.00', serials }] }), 201);
  }
  await ok(send(`/orders/${order.id}/allocations`, { expectedVersion: await version(order.jobId) }), 201);
  const draft = await ok(send(`/orders/${order.id}/dispatches`, { expectedVersion: await version(order.jobId) }), 201);
  const units = await prisma.allocation.findMany({ where: { jobId: order.jobId, unitId: { not: null } }, include: { unit: true } });
  for (const row of units) await ok(send(`/dispatches/${draft.id}/scans`, { rawValue: row.unit.rawSerial, method: 'SCANNER', unitId: row.unitId }), 201);
  const current = await prisma.dispatch.findUniqueOrThrow({ where: { id: draft.id } });
  return ok(send(`/dispatches/${draft.id}/dispatch`, { expectedVersion: current.version }));
}
const deliver = (dispatch, when = new Date().toISOString(), key) => send(`/dispatches/${dispatch.id}/deliver`, { expectedVersion: dispatch.version, deliveredAt: when }, key);
const categoryOf = async (jobId) => new Map((await prisma.allocation.findMany({ where: { jobId, unitId: { not: null } }, include: { product: true } })).map((row) => [row.unitId, row.product.category]));
const months = { PANEL: 240, INVERTER: 24, CHARGE_CONTROLLER: 24 };

test('the demo terms cover every serial product, and a rerun never overwrites a changed term', async () => {
  const serial = demoProducts.filter((product) => product.trackingMode === 'SERIALIZED');
  assert.deepEqual(demoWarrantyPolicies().map((row) => row.productId).sort(), serial.map((product) => product.id).sort());
  assert.equal(await prisma.productWarrantyPolicy.count(), serial.length);
  const productId = demoWarrantyPolicies()[0].productId;
  const original = await prisma.productWarrantyPolicy.findUniqueOrThrow({ where: { productId } });
  await prisma.productWarrantyPolicy.update({ where: { productId }, data: { durationMonths: 36, revision: 'edited' } });
  await seedWarrantyPolicies(prisma);
  const kept = await prisma.productWarrantyPolicy.findUniqueOrThrow({ where: { productId } });
  assert.equal(kept.durationMonths, 36); assert.equal(kept.revision, 'edited');
  await prisma.productWarrantyPolicy.update({ where: { productId }, data: { durationMonths: original.durationMonths, revision: original.revision } });
});

test('a real quote freezes the terms, and delivery starts each serial\'s warranty once with its own length', async () => {
  const { order, quote } = await newOrder();
  const lines = quote.lines.filter((line) => line.productId !== null);
  const serial = new Set(demoWarrantyPolicies().map((row) => row.productId));
  for (const line of lines) {
    if (serial.has(line.productId)) { assert.equal(line.policyStatus, 'CONFIGURED'); assert.equal(line.warrantyPolicySnapshot.revision, 'demo-v1'); }
    else { assert.equal(line.policyStatus, 'UNCONFIGURED'); assert.equal(line.warrantyPolicySnapshot, null); }
  }
  const done = await posted(order);
  const when = new Date().toISOString(), key = randomUUID();
  const delivered = await ok(deliver(done, when, key));
  const categories = await categoryOf(order.jobId);
  const start = istDate(new Date(when));
  assert.equal(delivered.coverage.length, 4, 'two panels, an inverter and a controller');
  for (const row of delivered.coverage) {
    const category = categories.get(row.unitId);
    assert.equal(row.status, 'ACTIVE'); assert.equal(row.startDate, start);
    assert.equal(row.expiryDate, addCalendarMonths(start, months[category]), category);
    assert.match(row.policyName, /component warranty$/);
  }
  const units = delivered.coverage.map((row) => row.unitId);
  assert.equal(await prisma.warranty.count({ where: { unitId: { in: units } } }), 4);
  assert.deepEqual(await ok(deliver(done, when, key)), delivered, 'a retry returns the same result');
  await refused(deliver(delivered), 409, 'DISPATCH_ALREADY_DELIVERED');
  assert.equal(await prisma.warranty.count({ where: { unitId: { in: units } } }), 4, 'no second warranty');
});

test('changing a term leaves cover already quoted alone, and only later quotes use it', async () => {
  const panel = id(100);
  const original = await prisma.productWarrantyPolicy.findUniqueOrThrow({ where: { productId: panel } });
  const { order } = await newOrder();
  await prisma.productWarrantyPolicy.update({ where: { productId: panel }, data: { durationMonths: 12, revision: 'cut-v2' } });
  try {
    const delivered = await ok(deliver(await posted(order)));
    const categories = await categoryOf(order.jobId);
    const panels = delivered.coverage.filter((row) => categories.get(row.unitId) === 'PANEL');
    assert.equal(panels.length, 2);
    for (const row of panels) assert.equal(row.expiryDate, addCalendarMonths(row.startDate, 240));
    const later = await newOrder();
    const line = later.quote.lines.find((item) => item.productId === panel);
    assert.equal(line.warrantyPolicySnapshot.revision, 'cut-v2'); assert.equal(line.warrantyPolicySnapshot.durationMonths, 12);
  } finally {
    await prisma.productWarrantyPolicy.update({ where: { productId: panel }, data: { durationMonths: original.durationMonths, revision: original.revision } });
  }
});

test('a product with no policy stays explicitly unconfigured, without affecting the others', async () => {
  const panel = id(100);
  const original = await prisma.productWarrantyPolicy.findUniqueOrThrow({ where: { productId: panel } });
  await prisma.productWarrantyPolicy.delete({ where: { productId: panel } });
  try {
    const { order, quote } = await newOrder();
    assert.equal(quote.lines.find((line) => line.productId === panel).policyStatus, 'UNCONFIGURED');
    const delivered = await ok(deliver(await posted(order)));
    const categories = await categoryOf(order.jobId);
    for (const row of delivered.coverage) assert.equal(row.status, categories.get(row.unitId) === 'PANEL' ? 'NO_POLICY' : 'ACTIVE');
    assert.equal(await prisma.warranty.count({ where: { unitId: { in: delivered.coverage.map((row) => row.unitId) } } }), 2, 'no terms are invented');
  } finally {
    await prisma.productWarrantyPolicy.create({ data: { productId: panel, policyName: original.policyName, revision: original.revision, scope: original.scope, durationMonths: original.durationMonths } });
  }
});

test('damaged frozen terms refuse the delivery and change nothing, rather than dropping the cover', async () => {
  const { order, quote } = await newOrder();
  const done = await posted(order);
  const panelLine = quote.lines.find((line) => line.productId === id(100));
  const damage = async (value) => {
    await sql.query('ALTER TABLE quote_lines DISABLE TRIGGER USER');
    await sql.query('UPDATE quote_lines SET "warrantyPolicySnapshot" = $1 WHERE id = $2', [JSON.stringify(value), panelLine.id]);
    await sql.query('ALTER TABLE quote_lines ENABLE TRIGGER USER');
  };
  await damage({ policyName: ' ' });
  await refused(deliver(done), 503, 'POLICY_DATA_INVALID');
  const row = await prisma.dispatch.findUniqueOrThrow({ where: { id: done.id } });
  assert.equal(row.status, 'DISPATCHED'); assert.equal(row.deliveredAt, null);
  const units = await prisma.allocation.findMany({ where: { jobId: order.jobId, unitId: { not: null } } });
  assert.ok(units.every((allocation) => allocation.status === 'DISPATCHED'));
  assert.equal(await prisma.warranty.count({ where: { unitId: { in: units.map((allocation) => allocation.unitId) } } }), 0);
  await damage(panelLine.warrantyPolicySnapshot);
  assert.equal((await ok(deliver(done))).status, 'DELIVERED', 'it goes through once the terms are repaired');
});

test('the database refuses terms that could not be quoted or delivered', async () => {
  const productId = id(106);
  const terms = { productId, policyName: 'Rule check', revision: 'r1', scope: 'Component replacement', durationMonths: 24 };
  for (const bad of [{ durationMonths: 0 }, { durationMonths: 1201 }, { policyName: '  ' }, { revision: '' }, { scope: ' ' }]) {
    await assert.rejects(prisma.productWarrantyPolicy.create({ data: { ...terms, ...bad } }), /product_warranty_policies_terms_valid|violates check|Check/i, JSON.stringify(bad));
  }
  await assert.rejects(prisma.productWarrantyPolicy.create({ data: { ...terms, productId: randomUUID() } }));
  await assert.rejects(prisma.product.delete({ where: { id: id(100) } }), 'a product with a policy cannot be deleted');
});
