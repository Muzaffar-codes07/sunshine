// Explicit disposable test database only; never load the application .env.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('TEST_DATABASE_URL must name a disposable test database');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'stock-view-tests-only-session-secret';
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
const { StockIntegrityService } = require('../dist/inventory/stock-integrity.service');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { catalogueDemoId: id, demoManufacturer } = require('../dist/catalog/demo-catalogue');
const { hashPassword } = require('../dist/auth/passwords');

const origin = 'http://127.0.0.1:3001';
const password = 'stock-view-test-password-2026';
const facts = { roofDirection: 'S', roofTiltDeg: '18.5', cableDistanceM: '22.00', usableRoofAreaSqm: '30.00' };
const cookies = {}; const staff = {};
let app, base, prisma, idempotency, quotes, surveys, orders, invoices, integrity, main, quarantine;
const identity = (row) => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1'); base = (await app.getUrl()) + '/api/v1';
  prisma = app.get(PrismaService); idempotency = app.get(IdempotencyService); quotes = app.get(QuotesService); surveys = app.get(SurveysService);
  orders = app.get(OrdersService); invoices = app.get(InvoicesService); integrity = app.get(StockIntegrityService);
  await seedCatalogue(prisma);
  for (const role of ['WAREHOUSE', 'ADMIN', 'SALES', 'TECHNICIAN']) {
    const row = await prisma.user.create({ data: { email: randomUUID() + '@test.local', displayName: role + ' view tester', role, passwordHash: await hashPassword(password) } });
    staff[role] = row;
    const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email: row.email, password }) });
    assert.equal(response.status, 200); cookies[role] = response.headers.get('set-cookie').split(';')[0];
  }
  main = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'MAIN' } });
  quarantine = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'QUARANTINE' } });
});
after(async () => { await app?.close(); });

const send = (route, body, role = 'WAREHOUSE') => fetch(base + route, {
  method: 'POST', headers: { 'content-type': 'application/json', origin, 'idempotency-key': randomUUID(), cookie: cookies[role] }, body: JSON.stringify(body),
});
const get = (route, role = 'WAREHOUSE') => fetch(base + route, { headers: { cookie: cookies[role] } });
const ok = async (pending, status = 200) => {
  const response = await pending; const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); return body.data;
};
const refused = async (pending, status, code) => {
  const response = await pending; const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); assert.equal(body.error.code, code);
};
const newProduct = (trackingMode = 'BULK') => prisma.product.create({ data: {
  id: randomUUID(), sku: 'VIEW-' + randomUUID().slice(0, 13).toUpperCase(), name: 'View fixture', kind: 'HARDWARE', category: trackingMode === 'BULK' ? 'CABLE' : 'PANEL', trackingMode,
  unitOfMeasure: 'PCS', manufacturerId: demoManufacturer.id, unitSalePrice: '1.00', active: true,
} });
const receive = (productId, quantity, unitCost, receivedAt = '2026-10-30T10:00:00.000Z', serials = []) => ok(send('/stock/receipts', {
  reference: 'REC-' + randomUUID(), locationId: main.id, receivedAt, lines: [{ productId, quantity: String(quantity), unitCost, serials }],
}), 201);
const moveOut = async (line, to = quarantine.id) => {
  const draft = await ok(send('/stock/transfers', { reference: 'TR-' + randomUUID(), fromLocationId: main.id, toLocationId: to, lines: [line] }), 201);
  return ok(send(`/stock/documents/${draft.id}/validate`, { expectedVersion: draft.version }));
};
const count = async (productId, countedQuantity) => {
  const draft = await ok(send('/stock/counts', { reference: 'CT-' + randomUUID(), locationId: main.id, lines: [{ productId, countedQuantity: String(countedQuantity) }] }), 201);
  return ok(send(`/stock/documents/${draft.id}/validate`, { expectedVersion: draft.version }));
};
const value = (productId) => ok(get(`/stock/value?productId=${productId}`));
const byCode = (report) => Object.fromEntries(report.data.checks.map((check) => [check.code, check.count]));
const serial = () => 'SN-' + randomUUID().slice(0, 13).toUpperCase();

test('movement history is newest first, carries its document, and filters by product, location, kind and time', async () => {
  const product = await newProduct();
  await receive(product.id, 10, '100.00', '2026-10-01T10:00:00.000Z');
  const later = await receive(product.id, 5, '100.00', '2026-10-10T10:00:00.000Z');
  const moved = await moveOut({ productId: product.id, quantity: '3' });
  const counted = await count(product.id, 11);
  const all = await ok(get(`/stock/movements?productId=${product.id}`));
  assert.equal(all.total, 4);
  assert.deepEqual(all.items.map((row) => row.documentKind), ['ADJUSTMENT', 'TRANSFER', 'RECEIPT', 'RECEIPT']);
  assert.equal(all.items[1].documentId, moved.id); assert.equal(all.items[1].reference, moved.reference); assert.equal(all.items[1].sku, product.sku);
  assert.equal(all.items[1].fromLocationId, main.id); assert.equal(all.items[1].toLocationId, quarantine.id); assert.equal(all.items[1].quantity, '3.000');
  assert.equal(all.items[0].documentId, counted.id); assert.equal(all.items[0].toLocationId, null, 'a shortage leaves company stock');
  assert.equal(all.items[2].occurredAt, '2026-10-10T10:00:00.000Z'); assert.notEqual(all.items[2].recordedAt, all.items[2].occurredAt, 'recorded time is kept separately');
  const filtered = async (query) => (await ok(get(`/stock/movements?productId=${product.id}&${query}`))).items.map((row) => row.documentKind);
  assert.deepEqual(await filtered('kind=RECEIPT'), ['RECEIPT', 'RECEIPT']);
  assert.deepEqual(await filtered(`locationId=${quarantine.id}`), ['TRANSFER']);
  assert.equal((await filtered(`locationId=${main.id}`)).length, 4, 'a location matches either end');
  assert.deepEqual(await filtered('from=2026-10-10T10:00:00.000Z&to=2026-10-10T10:00:00.001Z'), ['RECEIPT'], 'from is inclusive');
  assert.deepEqual(await filtered('from=2026-10-01T10:00:00.000Z&to=2026-10-10T10:00:00.000Z'), ['RECEIPT'], 'to is exclusive');
  assert.equal(later.status, 'DONE');
});

test('movement pages are stable and bounded, and the total survives an empty later page', async () => {
  const product = await newProduct();
  for (const day of ['01', '02', '03']) await receive(product.id, 1, '10.00', `2026-10-${day}T10:00:00.000Z`);
  const seen = [];
  for (const page of [1, 2, 3]) seen.push((await ok(get(`/stock/movements?productId=${product.id}&pageSize=1&page=${page}`))).items[0].occurredAt);
  assert.deepEqual(seen, ['2026-10-03T10:00:00.000Z', '2026-10-02T10:00:00.000Z', '2026-10-01T10:00:00.000Z']);
  const past = await ok(get(`/stock/movements?productId=${product.id}&pageSize=1&page=9`));
  assert.deepEqual(past.items, []); assert.equal(past.total, 3);
  await refused(get('/stock/movements?pageSize=101'), 400, 'INVALID_INPUT');
  await refused(get('/stock/movements?kind=NONSENSE'), 400, 'INVALID_INPUT');
  await refused(get('/stock/movements?from=2026-10-02T00:00:00Z&to=2026-10-01T00:00:00Z'), 400, 'INVALID_INPUT');
});

test('as-of answers from business time, including stock recorded late, and refuses the future', async () => {
  const product = await newProduct();
  await receive(product.id, 10, '100.00', '2026-10-01T10:00:00.000Z');
  await receive(product.id, 5, '100.00', '2026-10-10T10:00:00.000Z');
  const moved = await moveOut({ productId: product.id, quantity: '3' });
  const at = async (time) => {
    const data = await ok(get(`/stock/as-of?productId=${product.id}&at=${encodeURIComponent(time)}`));
    assert.equal(data.at, new Date(time).toISOString());
    return Object.fromEntries(data.items.map((row) => [row.locationCode, row.onHand]));
  };
  assert.deepEqual(await at('2026-09-30T00:00:00.000Z'), {}, 'nothing had happened yet');
  assert.deepEqual(await at('2026-10-01T10:00:00.000Z'), { MAIN: '10.000' }, 'a movement counts at its exact time');
  assert.deepEqual(await at('2026-10-01T09:59:59.999Z'), {});
  assert.deepEqual(await at('2026-10-05T00:00:00+05:30'), { MAIN: '10.000' });
  assert.deepEqual(await at('2026-10-15T00:00:00.000Z'), { MAIN: '15.000' });
  assert.deepEqual(await at(moved.occurredAt), { MAIN: '12.000', QUARANTINE: '3.000' });
  await receive(product.id, 2, '100.00', '2026-10-05T00:00:00.000Z');
  assert.deepEqual(await at('2026-10-06T00:00:00.000Z'), { MAIN: '12.000' }, 'a late receipt changes the past answer');
  const now = await ok(get(`/stock/as-of?productId=${product.id}&at=${encodeURIComponent(new Date().toISOString())}`));
  const current = await ok(get(`/stock?productId=${product.id}`));
  assert.deepEqual(now.items.map((row) => [row.locationCode, row.onHand]), current.items.map((row) => [row.locationCode, row.onHand]), 'as-of now equals the view');
  await refused(get(`/stock/as-of?at=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`), 400, 'INVALID_INPUT');
  await refused(get('/stock/as-of'), 400, 'INVALID_INPUT');
  const onlyMain = await ok(get(`/stock/as-of?productId=${product.id}&locationId=${quarantine.id}&at=${encodeURIComponent(moved.occurredAt)}`));
  assert.deepEqual(onlyMain.items.map((row) => row.locationCode), ['QUARANTINE']); assert.equal(onlyMain.total, 1);
  assert.equal((await ok(get(`/stock/as-of?productId=${product.id}&page=9&at=${encodeURIComponent(moved.occurredAt)}`))).total, 2);
});

test('stock value keeps usable and quarantine apart, at average cost for bulk', async () => {
  const product = await newProduct();
  await receive(product.id, 10, '100.00');
  await receive(product.id, 10, '200.00');
  let data = await value(product.id);
  assert.equal(data.usableValue, '3000.00'); assert.equal(data.quarantineValue, '0.00');
  await moveOut({ productId: product.id, quantity: '4' });
  data = await value(product.id);
  assert.equal(data.usableValue, '2400.00'); assert.equal(data.quarantineValue, '600.00'); assert.equal(data.total, 1); assert.equal(data.uncostedProducts, 0);
  assert.deepEqual(data.items[0], { productId: product.id, sku: product.sku, productName: product.name, usableQuantity: '16.000', quarantineQuantity: '4.000', usableValue: '2400.00', quarantineValue: '600.00', costKnown: true });
});

test('stock value counts serial units at their own cost, by location', async () => {
  const product = await newProduct('SERIALIZED');
  const [a, b, c] = [serial(), serial(), serial()];
  await receive(product.id, 2, '25000.00', '2026-10-30T10:00:00.000Z', [a, b]);
  await receive(product.id, 1, '30000.50', '2026-10-30T10:00:00.000Z', [c]);
  assert.equal((await value(product.id)).usableValue, '80000.50');
  await moveOut({ productId: product.id, quantity: '1', serials: [c] });
  const data = await value(product.id);
  assert.equal(data.usableValue, '50000.00'); assert.equal(data.quarantineValue, '30000.50');
  assert.equal(data.items[0].usableQuantity, '2.000'); assert.equal(data.items[0].quarantineQuantity, '1.000');
});

test('stock value rounds each product once, totals equal the rows, and an uncosted product is flagged', async () => {
  const product = await newProduct();
  await receive(product.id, '0.333', '100.55');
  assert.equal((await value(product.id)).usableValue, '33.48');
  const uncosted = await newProduct();
  await receive(uncosted.id, 3, '10.00');
  await prisma.productCostBasis.delete({ where: { productId: uncosted.id } });
  const flagged = await value(uncosted.id);
  assert.equal(flagged.usableValue, '0.00'); assert.equal(flagged.uncostedProducts, 1); assert.equal(flagged.items[0].costKnown, false);
  await prisma.productCostBasis.create({ data: { productId: uncosted.id, averageCost: '10.000000' } });
  const first = await ok(get('/stock/value?pageSize=100'));
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page += 1) items.push(...(await ok(get(`/stock/value?pageSize=100&page=${page}`))).items);
  const sum = (field) => items.reduce((total, row) => total + BigInt(Math.round(Number(row[field]) * 100)), 0n);
  assert.equal(sum('usableValue'), BigInt(Math.round(Number(first.usableValue) * 100)));
  assert.equal(sum('quarantineValue'), BigInt(Math.round(Number(first.quarantineValue) * 100)));
  const emptied = await newProduct();
  await receive(emptied.id, 1, '10.00');
  await count(emptied.id, 0);
  const none = await value(emptied.id);
  assert.equal(none.total, 0); assert.deepEqual(none.items, []);
  await refused(get('/stock/value?page=10001'), 400, 'INVALID_INPUT');
});

test('stock reads need warehouse or admin staff', async () => {
  for (const route of ['/stock/movements', '/stock/value', '/stock/integrity', `/stock/as-of?at=${encodeURIComponent('2026-10-01T00:00:00Z')}`]) {
    await refused(get(route, 'SALES'), 403, 'FORBIDDEN');
    await refused(get(route, 'TECHNICIAN'), 403, 'FORBIDDEN');
    assert.equal((await get(route, 'ADMIN')).status, 200);
    assert.equal((await fetch(base + route)).status, 401);
  }
});

/** Runs corrupting statements and the report in one transaction, then rolls everything back. */
async function reportAfter(corrupt) {
  let report;
  const rollback = new Error('roll back the probe');
  await prisma.$transaction(async (tx) => {
    await corrupt(tx);
    report = await integrity.check(tx);
    throw rollback;
  }, { timeout: 20_000 }).catch((error) => { if (error !== rollback) throw error; });
  return report;
}
const assertFinds = async (code, corrupt) => {
  const before = byCode(await integrity.report());
  const after = await reportAfter(corrupt);
  assert.equal(after.data.ok, false);
  const counts = byCode(after);
  assert.ok(counts[code] > before[code], `${code}: ${before[code]} -> ${counts[code]}`);
  return after.data.checks.find((check) => check.code === code);
};
/** A posted document line with no movement yet. */
const postedLine = async (tx, productId, kind, quantity, locations) => {
  const occurredAt = new Date();
  const [{ id: documentId }] = await tx.$queryRawUnsafe(`INSERT INTO stock_documents (id, kind, reference, "payloadHash", "actorId", "occurredAt", "fromLocationId", "toLocationId")
    VALUES (gen_random_uuid(), '${kind}', $1, 'probe', $2::uuid, $3::timestamptz, $4::uuid, $5::uuid) RETURNING id`, 'PROBE-' + randomUUID(), staff.WAREHOUSE.id, occurredAt.toISOString(), locations.from ?? null, locations.to ?? null);
  const [{ id: lineId }] = await tx.$queryRawUnsafe(`INSERT INTO stock_document_lines (id, "documentId", "lineNumber", "productId", quantity) VALUES (gen_random_uuid(), $1::uuid, 1, $2::uuid, $3::numeric) RETURNING id`, documentId, productId, quantity);
  await tx.$executeRawUnsafe(`UPDATE stock_documents SET status = 'DONE', "validatedAt" = now() WHERE id = $1::uuid`, documentId);
  return { documentId, lineId, occurredAt };
};
const insertMovement = (tx, line, productId, quantity, locations) => tx.$queryRawUnsafe(`INSERT INTO stock_movements (id, "documentLineId", "productId", "fromLocationId", "toLocationId", quantity, "actorId", "occurredAt")
  VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric, $6::uuid, $7::timestamptz) RETURNING id`, line.lineId, productId, locations.from ?? null, locations.to ?? null, quantity, staff.WAREHOUSE.id, line.occurredAt.toISOString());

test('real stock commands add no integrity findings', async () => {
  const before = byCode(await integrity.report());
  const bulk = await newProduct(); const unit = await newProduct('SERIALIZED');
  const [a, b] = [serial(), serial()];
  await receive(bulk.id, 10, '100.00');
  await receive(unit.id, 2, '500.00', '2026-10-30T10:00:00.000Z', [a, b]);
  await moveOut({ productId: bulk.id, quantity: '2' });
  await moveOut({ productId: unit.id, quantity: '1', serials: [a] });
  await count(bulk.id, 8);
  await count(bulk.id, 7);
  await count(bulk.id, 9);
  const after = await ok(get('/stock/integrity'));
  assert.equal(after.checks.length, 7);
  assert.deepEqual(byCode({ data: after }), before);
  assert.ok(after.checks.every((check) => check.ok === (check.count === 0) && check.samples.length === Math.min(check.count, 20)));
  assert.equal(after.ok, after.checks.every((check) => check.ok));
});

test('the report finds a DONE document that never posted', async () => {
  const product = await newProduct();
  let line;
  const check = await assertFinds('DONE_DOCUMENT_POSTED', async (tx) => { line = await postedLine(tx, product.id, 'RECEIPT', '1', { to: main.id }); });
  assert.ok(check.count >= 1); assert.equal(typeof line.lineId, 'string');
});

test('the report finds a negative balance', async () => {
  const product = await newProduct();
  const check = await assertFinds('NO_NEGATIVE_BALANCE', async (tx) => {
    const line = await postedLine(tx, product.id, 'ISSUE', '5', { from: main.id });
    await insertMovement(tx, line, product.id, '5', { from: main.id });
  });
  assert.ok(check.samples.includes(`${product.id}:${main.id}`) || check.count > 20);
});

test('the report finds a movement on a document that is not DONE', async () => {
  const product = await newProduct();
  await assertFinds('MOVEMENT_ON_DONE_DOCUMENT', async (tx) => {
    const line = await postedLine(tx, product.id, 'RECEIPT', '1', { to: main.id });
    await insertMovement(tx, line, product.id, '1', { to: main.id });
    await tx.$executeRawUnsafe('ALTER TABLE stock_documents DISABLE TRIGGER stock_documents_guarded');
    await tx.$executeRawUnsafe(`UPDATE stock_documents SET status = 'CANCELED' WHERE id = $1::uuid`, line.documentId);
  });
});

test('the report finds a movement that does not match its line or runs the wrong way', async () => {
  const product = await newProduct();
  const disable = (tx) => tx.$executeRawUnsafe('ALTER TABLE stock_movements DISABLE TRIGGER stock_movements_source_valid');
  await assertFinds('MOVEMENT_WELL_FORMED', async (tx) => {
    await disable(tx);
    const line = await postedLine(tx, product.id, 'RECEIPT', '1', { to: main.id });
    await insertMovement(tx, line, product.id, '2', { to: main.id });
  });
  await assertFinds('MOVEMENT_WELL_FORMED', async (tx) => {
    await disable(tx);
    const line = await postedLine(tx, product.id, 'RECEIPT', '1', { to: main.id });
    await insertMovement(tx, line, product.id, '1', { to: quarantine.id });
  });
  await assertFinds('MOVEMENT_WELL_FORMED', async (tx) => {
    await disable(tx);
    const shortage = await postedLine(tx, product.id, 'ISSUE', '1', { from: main.id });
    await insertMovement(tx, shortage, product.id, '1', { from: main.id, to: quarantine.id });
  });
});

test('the report finds serial units that disagree with the view', async () => {
  const product = await newProduct('SERIALIZED');
  await receive(product.id, 1, '500.00', '2026-10-30T10:00:00.000Z', [serial()]);
  const check = await assertFinds('SERIAL_COUNT_MATCHES_VIEW', async (tx) => {
    const line = await postedLine(tx, product.id, 'ISSUE', '1', { from: main.id });
    await insertMovement(tx, line, product.id, '1', { from: main.id });
  });
  assert.ok(check.samples.includes(`${product.id}:${main.id}`) || check.count > 20);
});

test('the report finds a view that disagrees with the movements', async () => {
  const product = await newProduct();
  await receive(product.id, 1, '10.00');
  await assertFinds('VIEW_MATCHES_MOVEMENTS', (tx) => tx.$executeRawUnsafe(`CREATE OR REPLACE VIEW stock_on_hand AS
    SELECT "productId", "toLocationId" AS "locationId", SUM(quantity) + 1 AS quantity FROM stock_movements WHERE "toLocationId" IS NOT NULL GROUP BY 1, 2`));
});

test('a count below what is reserved is recorded, then flagged by the report', async () => {
  const customer = await prisma.customer.create({ data: { name: 'View Customer', phone: `7${String(randomInt(1e9)).padStart(9, '0')}`, addressLine: '7 View Road', city: 'Nagpur', pincode: '440001' } });
  const enquiry = await prisma.enquiry.create({ data: { customerId: customer.id, source: 'PHONE', requestedCapacityKw: 1, status: 'QUALIFIED', contactName: 'View Customer', siteAddressLine: '7 View Road', siteCity: 'Nagpur', sitePincode: '440001' } });
  const sales = identity(staff.SALES);
  const survey = (await surveys.schedule(enquiry.id, { technicianId: staff.TECHNICIAN.id, scheduledFor: '2026-11-02T05:00:00.000Z' })).data;
  await surveys.submit(survey.id, { version: 1, ...facts }, identity(staff.TECHNICIAN));
  await surveys.approve(survey.id, { version: 2 }, sales);
  const draft = (await quotes.create(enquiry.id, { surveyId: survey.id, packageId: id(1001) }, sales)).data;
  await quotes.send(draft.id, { version: 1, channel: 'PRINT' }, sales);
  await quotes.accept(draft.id, { version: 2, acceptedByName: 'View Customer', channel: 'IN_PERSON' }, sales);
  const order = (await orders.confirm({ quoteId: draft.id }, randomUUID(), sales)).data;
  const receipt = { amountInr: '1000.00', method: 'UPI', reference: `UTR${randomUUID().slice(0, 12)}`, receivedAt: new Date().toISOString() };
  await idempotency.run({ actorId: staff.ADMIN.id, key: randomUUID(), action: 'PAYMENT_RECEIPT', payload: receipt }, (tx) => invoices.recordPayment(tx, order.invoice.id, receipt, identity(staff.ADMIN)));
  const products = await prisma.product.findMany({ where: { id: { in: order.packing.map((line) => line.productId) } } });
  for (const product of products) {
    const needed = order.packing.filter((line) => line.productId === product.id).reduce((sum, line) => sum + Number(line.quantity), 0);
    const serials = product.trackingMode === 'SERIALIZED' ? Array.from({ length: needed }, serial) : [];
    await receive(product.id, needed, '10.00', '2026-10-30T10:00:00.000Z', serials);
  }
  const job = await prisma.job.findUniqueOrThrow({ where: { id: order.jobId } });
  await ok(send(`/orders/${order.id}/allocations`, { expectedVersion: job.version }), 201);
  const bulk = products.find((product) => product.trackingMode === 'BULK');
  const before = byCode(await integrity.report()).RESERVED_WITHIN_ON_HAND;
  await count(bulk.id, 0);
  const report = await ok(get('/stock/integrity'));
  const check = report.checks.find((item) => item.code === 'RESERVED_WITHIN_ON_HAND');
  assert.equal(check.count, before + 1); assert.equal(check.ok, false); assert.equal(report.ok, false);
  assert.ok(check.samples.includes(`${bulk.id}:${main.id}`) || check.count > 20);
  const level = (await ok(get(`/stock?productId=${bulk.id}&locationId=${main.id}`))).items[0];
  await receive(bulk.id, level.reserved, '10.00');
  assert.equal(byCode(await integrity.report()).RESERVED_WITHIN_ON_HAND, before, 'it clears once stock arrives');
});
