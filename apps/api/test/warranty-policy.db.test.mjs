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
const { WarrantyService } = require('../dist/warranty/warranty.service');
const { WarrantyEquipmentReader } = require('../dist/warranty/warranty-readers');
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
  for (const [name, role] of [['SALES', 'SALES'], ['ADMIN', 'ADMIN'], ['WAREHOUSE', 'WAREHOUSE'], ['TECH', 'TECHNICIAN'], ['SUPPORT', 'SUPPORT']]) {
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

const get = (route, role = 'ADMIN', extra = {}) => fetch(base + route, { headers: { ...(role ? { cookie: cookies[role] } : {}), ...extra } });
const policyPath = productId => `/warranty-policies/${productId}`;
const savePolicy = (productId, body, key = randomUUID(), role = 'ADMIN') => fetch(base + policyPath(productId), {
  method: 'POST', headers: { origin, 'content-type': 'application/json', 'idempotency-key': key, ...(role ? { cookie: cookies[role] } : {}) }, body: JSON.stringify(body),
});

test('only active ADMIN can configure terms; stale edits, revision reuse, invalid products and key reuse refuse safely', async () => {
  const productId = id(100), path = policyPath(productId);
  const original = await ok(get(path));
  assert.ok(original.fingerprint); assert.equal(original.policy.durationMonths, 240);
  const input = { expectedFingerprint: original.fingerprint, ...original.policy, revision: 'runtime-v2', durationMonths: 36 };
  assert.equal((await get(path, null, { 'x-role': 'ADMIN' })).status, 401);
  for (const role of ['SUPPORT', 'SALES', 'WAREHOUSE', 'TECH']) {
    assert.equal((await get(path, role)).status, 403);
    assert.equal((await savePolicy(productId, input, randomUUID(), role)).status, 403);
  }
  for (const bad of [{ durationMonths: 0 }, { durationMonths: 1201 }, { scope: ' ' }, { policyName: 'x'.repeat(201) }, { unexpected: true }]) {
    assert.equal((await savePolicy(productId, { ...input, ...bad })).status, 400);
  }
  await refused(savePolicy(productId, { ...input, revision: original.policy.revision }), 409, 'POLICY_REVISION_REQUIRED');
  const key = randomUUID();
  const same = await Promise.all([savePolicy(productId.toUpperCase(), input, key), savePolicy(productId, input, key)]);
  const a = await ok(same[0], 201), b = await ok(same[1], 201); assert.deepEqual(a, b);
  await refused(savePolicy(productId, { ...input, durationMonths: 48 }, key), 409, 'IDEMPOTENCY_CONFLICT');
  await refused(savePolicy(productId, { ...input, revision: 'stale-v3' }), 409, 'STALE_POLICY');
  const restored = await ok(savePolicy(productId, { expectedFingerprint: a.fingerprint, ...original.policy }), 201);
  assert.deepEqual(restored.policy, original.policy);
  assert.deepEqual(await ok(savePolicy(productId, input, key), 201), a, 'late retry replays original result without reverting the latest policy');
  assert.deepEqual((await ok(get(path))).policy, original.policy);
  assert.equal((await get(policyPath(randomUUID()))).status, 404);
  await refused(savePolicy(id(106), { ...input, expectedFingerprint: null }), 409, 'POLICY_PRODUCT_INVALID');
});

test('concurrent first-time policy creation has one winner; failed transactions retain no command or partial policy', async () => {
  const productId = demoProducts.find(product => product.category === 'INVERTER').id, original = await prisma.productWarrantyPolicy.findUniqueOrThrow({ where: { productId } });
  await prisma.productWarrantyPolicy.delete({ where: { productId } });
  try {
    assert.equal((await ok(get(policyPath(productId)))).fingerprint, null);
    const input = { expectedFingerprint: null, policyName: original.policyName, scope: original.scope, durationMonths: 24, revision: 'first-v1' };
    const responses = await Promise.all([savePolicy(productId, input), savePolicy(productId, { ...input, revision: 'first-v2' })]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
    const current = await ok(get(policyPath(productId)));
    const key = randomUUID();
    await assert.rejects(idempotency.run({ actorId: staff.ADMIN.id, key, action: 'WARRANTY_POLICY_SAVE', payload: { rollback: true } }, async tx => {
      await tx.productWarrantyPolicy.update({ where: { productId }, data: { revision: 'rolled-back' } }); throw Error('late rollback probe');
    }), /late rollback probe/);
    assert.equal(await prisma.command.count({ where: { actorId: staff.ADMIN.id, idempotencyKey: key } }), 0);
    assert.deepEqual(await ok(get(policyPath(productId))), current);
  } finally {
    await prisma.productWarrantyPolicy.upsert({ where: { productId }, create: original, update: { policyName: original.policyName, revision: original.revision, scope: original.scope, durationMonths: original.durationMonths } });
  }
});

test('production warranty lookup traces received, reserved and delivered serials, with scoped uppercase UUIDs and real access', async () => {
  const { order } = await newOrder();
  const done = await posted(order);
  const allocation = await prisma.allocation.findFirstOrThrow({ where: { jobId: order.jobId, product: { category: 'INVERTER' }, unitId: { not: null } }, include: { unit: true } });
  const serial = allocation.unit.normalizedSerial;
  const query = '/warranties/lookup?' + new URLSearchParams({ serial: ` ${serial.toLowerCase()} `, productId: allocation.productId.toUpperCase(), manufacturerId: allocation.unit.manufacturerId.toUpperCase() });
  const beforeDelivery = await ok(get(query)); assert.equal(beforeDelivery.job, null); assert.equal(beforeDelivery.customer, null); assert.equal(beforeDelivery.assessment.coverageStatus, 'NO_WARRANTY');
  assert.equal((await get(query, null, { 'x-role': 'ADMIN' })).status, 401);
  for (const role of ['SALES', 'TECH', 'WAREHOUSE']) assert.equal((await get(query, role)).status, 403);
  const when = new Date().toISOString(); await ok(deliver(done, when));
  for (const role of ['ADMIN', 'SUPPORT']) {
    const response = await get(query, role); assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await ok(response); assert.deepEqual(result.customer, { id: order.customerId, name: 'Warranty Customer' }); assert.deepEqual(result.job, { id: order.jobId });
    assert.deepEqual(Object.keys(result.customer).sort(), ['id', 'name']); assert.equal(result.assessment.coverageStatus, 'COVERED'); assert.equal(result.assessment.customerCharge, '0.00');
  }
  const service = app.get(WarrantyService);
  const start = istDate(new Date(when));
  assert.equal((await service.evaluateWarranty(allocation.unitId.toUpperCase(), new Date(`${addCalendarMonths(start, 18)}T12:00:00Z`))).isCovered, true);
  assert.equal((await service.evaluateWarranty(allocation.unitId, new Date(`${addCalendarMonths(start, 24)}T00:00:00+05:30`))).coverageStatus, 'EXPIRED');
  assert.equal((await service.evaluateWarranty(allocation.unitId, new Date(when), 'Labour')).coverageStatus, 'OUT_OF_SCOPE');
  assert.equal((await get('/warranties/lookup?serial=ABSENT-' + randomUUID())).status, 404);
  assert.equal((await get(query + '&asOfDate=2024-01-01')).status, 400, 'ordinary public lookup cannot be backdated');
  const other = await prisma.product.create({ data: { sku: 'WP-' + randomUUID().slice(0, 8).toUpperCase(), name: 'Ambiguous serial fixture', kind: 'HARDWARE', category: 'INVERTER', trackingMode: 'SERIALIZED', unitOfMeasure: 'PCS', manufacturerId: allocation.unit.manufacturerId, unitSalePrice: '1.00' } });
  await ok(send('/stock/receipts', { reference: 'AMB-' + randomUUID(), locationId: main.id, receivedAt: when, lines: [{ productId: other.id, quantity: '1', unitCost: '10.00', serials: [serial] }] }), 201);
  await refused(get('/warranties/lookup?serial=' + serial), 409, 'AMBIGUOUS_SERIAL');
  assert.equal((await ok(get(query))).unit.id, allocation.unitId);
  const reader = app.get(WarrantyEquipmentReader);
  assert.deepEqual((await reader.findById(allocation.unitId.toUpperCase())).job, { id: order.jobId });
  assert.equal(await reader.findById(randomUUID()), null);
});

test('warranty dates/terms and deletion are frozen; void is one-way, versioned and visible on lookup and dispatch', async () => {
  const { order } = await newOrder(), dispatched = await posted(order);
  const delivered = await ok(deliver(dispatched));
  const row = await prisma.warranty.findFirstOrThrow({ where: { unitId: { in: delivered.coverage.map(item => item.unitId) } } });
  for (const [statement, args] of [
    ['UPDATE warranties SET scope=$1 WHERE id=$2', ['Changed coverage', row.id]],
    ['UPDATE warranties SET "startDate"="startDate"+1 WHERE id=$1', [row.id]],
    ['UPDATE warranties SET active=false WHERE id=$1', [row.id]],
    ['UPDATE warranties SET version=version+1 WHERE id=$1', [row.id]],
    ['DELETE FROM warranties WHERE id=$1', [row.id]],
    ['TRUNCATE warranties CASCADE', []],
  ]) await assert.rejects(sql.query(statement, args), error => error.code === '23514');
  await sql.query('UPDATE warranties SET active=false, version=version+1 WHERE id=$1', [row.id]);
  await assert.rejects(sql.query('UPDATE warranties SET active=true, version=version+1 WHERE id=$1', [row.id]), error => error.code === '23514');
  assert.equal((await app.get(WarrantyService).evaluateWarranty(row.unitId, new Date())).coverageStatus, 'VOID');
  assert.equal((await ok(get('/dispatches/' + delivered.id, 'WAREHOUSE'))).coverage.find(item => item.unitId === row.unitId).status, 'VOID');
  // Simulate pre-migration or privileged corruption without weakening the production trigger.
  await sql.query('ALTER TABLE warranties DISABLE TRIGGER USER');
  try { await sql.query('UPDATE warranties SET "policyRevision"=$1 WHERE id=$2', ['tampered', row.id]); }
  finally { await sql.query('ALTER TABLE warranties ENABLE TRIGGER USER'); }
  await assert.rejects(app.get(WarrantyService).evaluateWarranty(row.unitId, new Date()), error => error.code === 'INVALID_WARRANTY_RECORD');
  await sql.query('ALTER TABLE warranties DISABLE TRIGGER USER');
  try { await sql.query('UPDATE warranties SET "policyRevision"=$1 WHERE id=$2', [row.policyRevision, row.id]); }
  finally { await sql.query('ALTER TABLE warranties ENABLE TRIGGER USER'); }
});

test('SQL rejects inconsistent policy dates on insert and accepts the clamped leap-year month end', async () => {
  const serial = 'CAL-' + randomUUID().slice(0, 12).toUpperCase();
  await ok(send('/stock/receipts', { reference: 'CAL-' + randomUUID(), locationId: main.id, receivedAt: new Date().toISOString(),
    lines: [{ productId: id(100), quantity: '1', unitCost: '10.00', serials: [serial] }] }), 201);
  const unit = await prisma.unit.findUniqueOrThrow({ where: { manufacturerId_productId_normalizedSerial: {
    manufacturerId: id(1), productId: id(100), normalizedSerial: serial,
  } } });
  for (const [start, expiry, duration] of [['2024-01-31', '2024-03-01', 1], ['2024-02-29', '2026-03-01', 24], ['2024-01-01', '2124-02-01', 1201]]) {
    await assert.rejects(sql.query(`INSERT INTO warranties (id,"unitId","startDate","expiryDate","policyName","policyRevision",scope,"durationMonths","updatedAt")
      VALUES ($1,$2,$3,$4,'Calendar fixture','test-only','Component replacement',$5,now())`, [randomUUID(), unit.id, start, expiry, duration]),
      error => error.code === '23514' && error.constraint === 'warranties_calendar_interval');
  }
  // Explicit calendar-only SQL fixture, not activated customer coverage (there is no delivered sale).
  await prisma.warranty.create({ data: { unitId: unit.id, startDate: new Date('2024-01-31'), expiryDate: new Date('2024-02-29'),
    policyName: 'Calendar fixture', policyRevision: 'test-only', scope: 'Component replacement', durationMonths: 1 } });
  await refused(get('/warranties/lookup?serial=' + serial), 503, 'INVALID_WARRANTY_RECORD');
});

test('a predecessor pointer never promises replacement coverage, and the defective serial stops being a free repair candidate', async () => {
  const { order } = await newOrder(), delivered = await ok(deliver(await posted(order)));
  const old = await prisma.unit.findUniqueOrThrow({ where: { id: delivered.coverage[0].unitId } });
  const serial = 'LINEAGE-' + randomUUID().slice(0, 12).toUpperCase();
  await ok(send('/stock/receipts', { reference: 'LIN-' + randomUUID(), locationId: main.id, receivedAt: new Date().toISOString(),
    lines: [{ productId: old.productId, quantity: '1', unitCost: '10.00', serials: [serial] }] }), 201);
  const replacement = await prisma.unit.findUniqueOrThrow({ where: { manufacturerId_productId_normalizedSerial: { manufacturerId: old.manufacturerId, productId: old.productId, normalizedSerial: serial } } });
  // Explicit SQL lineage fixture only: not a real replacement transaction or consumed/costed repair.
  await prisma.unit.update({ where: { id: replacement.id }, data: { replacesUnitId: old.id } });
  assert.equal((await app.get(WarrantyService).evaluateWarranty(old.id, new Date())).coverageStatus, 'VOID');
  await refused(get('/warranties/lookup?serial=' + serial), 503, 'WARRANTY_REPLACEMENT_UNAVAILABLE');
});

test('revoked ADMIN sessions lose warranty read and configuration access', async () => {
  await prisma.user.update({ where: { id: staff.ADMIN.id }, data: { active: false } });
  assert.equal((await get('/warranties/lookup?serial=ANY')).status, 401);
  assert.equal((await get(policyPath(id(100)))).status, 401);
});
