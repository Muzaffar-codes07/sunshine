// Explicit disposable test database only; never load the application .env.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('TEST_DATABASE_URL must name a disposable test database');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'dispatch-posting-tests-only-session-secret';
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
const { CostWriterService } = require('../dist/finance/cost-writer.service');
const { StockLedgerService } = require('../dist/inventory/stock-ledger.service');
const { StockIntegrityService } = require('../dist/inventory/stock-integrity.service');
const { istDate, addCalendarMonths } = require('../dist/inventory/warranty-activation');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { catalogueDemoId: id } = require('../dist/catalog/demo-catalogue');
const { hashPassword } = require('../dist/auth/passwords');
const { Client } = require('pg');

const origin = 'http://127.0.0.1:3001';
const password = 'dispatch-posting-test-password-2026';
const facts = { roofDirection: 'S', roofTiltDeg: '18.5', cableDistanceM: '22.00', usableRoofAreaSqm: '30.00' };
const cookies = {}; const staff = {};
let app, base, prisma, idempotency, quotes, surveys, orders, invoices, costs, ledger, integrity, sql, main;
const identity = (row) => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1'); base = (await app.getUrl()) + '/api/v1';
  prisma = app.get(PrismaService); idempotency = app.get(IdempotencyService); quotes = app.get(QuotesService); surveys = app.get(SurveysService);
  orders = app.get(OrdersService); invoices = app.get(InvoicesService); costs = app.get(CostWriterService); ledger = app.get(StockLedgerService); integrity = app.get(StockIntegrityService);
  await seedCatalogue(prisma);
  sql = new Client({ connectionString: testUrl }); await sql.connect();
  for (const role of ['WAREHOUSE', 'SALES', 'ADMIN', 'TECHNICIAN']) {
    const row = await prisma.user.create({ data: { email: randomUUID() + '@test.local', displayName: role + ' posting tester', role, passwordHash: await hashPassword(password) } });
    staff[role] = row;
    const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email: row.email, password }) });
    assert.equal(response.status, 200); cookies[role] = response.headers.get('set-cookie').split(';')[0];
  }
  main = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'MAIN' } });
});
after(async () => { quotes.policies = undefined; await sql?.end(); await app?.close(); });

const send = (route, body, role = 'WAREHOUSE', key = randomUUID()) => fetch(base + route, {
  method: 'POST', headers: { 'content-type': 'application/json', origin, ...(key ? { 'idempotency-key': key } : {}), cookie: cookies[role] }, body: JSON.stringify(body),
});
const ok = async (pending, status = 200) => {
  const response = await pending; const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); return body.data;
};
const refused = async (pending, status, code) => {
  const response = await pending; const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); assert.equal(body.error.code, code); return body.error;
};
const onHand = (productId) => prisma.$transaction((tx) => ledger.onHand(tx, productId, main.id));
const reserved = (productId) => prisma.$transaction((tx) => ledger.reserved(tx, productId, main.id));
const POLICY = { policyName: 'Demo component cover', revision: 'v1', scope: 'Component replacement', durationMonths: 24 };

/** A paid order with its stock reserved, ready for a dispatch draft. `policies` freezes warranty terms on the quote. */
async function reservedOrder({ policies, unitCost = '100.00' } = {}) {
  const customer = await prisma.customer.create({ data: { name: 'Posting Customer', phone: `7${String(randomInt(1e9)).padStart(9, '0')}`, addressLine: '9 Yard Road', city: 'Nagpur', pincode: '440001' } });
  const enquiry = await prisma.enquiry.create({ data: { customerId: customer.id, source: 'PHONE', requestedCapacityKw: 1, status: 'QUALIFIED', contactName: 'Posting Customer', siteAddressLine: '9 Yard Road', siteCity: 'Nagpur', sitePincode: '440001' } });
  const sales = identity(staff.SALES);
  const survey = (await surveys.schedule(enquiry.id, { technicianId: staff.TECHNICIAN.id, scheduledFor: '2026-11-02T05:00:00.000Z' })).data;
  await surveys.submit(survey.id, { version: 1, ...facts }, identity(staff.TECHNICIAN));
  await surveys.approve(survey.id, { version: 2 }, sales);
  quotes.policies = policies;
  const draft = (await quotes.create(enquiry.id, { surveyId: survey.id, packageId: id(1001) }, sales)).data;
  quotes.policies = undefined;
  await quotes.send(draft.id, { version: 1, channel: 'PRINT' }, sales);
  await quotes.accept(draft.id, { version: 2, acceptedByName: 'Posting Customer', channel: 'IN_PERSON' }, sales);
  const order = (await orders.confirm({ quoteId: draft.id }, randomUUID(), sales)).data;
  const receipt = { amountInr: '1000.00', method: 'UPI', reference: `UTR${randomUUID().slice(0, 12)}`, receivedAt: new Date().toISOString() };
  await idempotency.run({ actorId: staff.ADMIN.id, key: randomUUID(), action: 'PAYMENT_RECEIPT', payload: receipt }, (tx) => invoices.recordPayment(tx, order.invoice.id, receipt, identity(staff.ADMIN)));
  const products = await prisma.product.findMany({ where: { id: { in: order.packing.map((line) => line.productId) } } });
  for (const product of products) {
    const needed = order.packing.filter((line) => line.productId === product.id).reduce((sum, line) => sum + Number(line.quantity), 0);
    const serials = product.trackingMode === 'SERIALIZED' ? Array.from({ length: needed }, () => 'SN-' + randomUUID().slice(0, 13).toUpperCase()) : [];
    await ok(send('/stock/receipts', { reference: 'REC-' + randomUUID(), locationId: main.id, receivedAt: '2026-10-30T10:00:00.000Z', lines: [{ productId: product.id, quantity: String(needed), unitCost, serials }] }), 201);
  }
  const job = await prisma.job.findUniqueOrThrow({ where: { id: order.jobId } });
  await ok(send(`/orders/${order.id}/allocations`, { expectedVersion: job.version }), 201);
  return { order, products };
}
const prepare = async (order) => {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: order.jobId } });
  return ok(send(`/orders/${order.id}/dispatches`, { expectedVersion: job.version }), 201);
};
const serialRows = (order) => prisma.allocation.findMany({ where: { jobId: order.jobId, unitId: { not: null } }, include: { unit: true } });
const scanAll = async (order, draft) => {
  let latest = draft;
  for (const row of await serialRows(order)) latest = await ok(send(`/dispatches/${draft.id}/scans`, { rawValue: row.unit.rawSerial, method: 'SCANNER', unitId: row.unitId }), 201);
  return latest;
};
const post = (draft, role = 'WAREHOUSE', key) => send(`/dispatches/${draft.id}/dispatch`, { expectedVersion: draft.version }, role, key);
const deliver = (dispatch, deliveredAt = new Date().toISOString(), role = 'WAREHOUSE', key) => send(`/dispatches/${dispatch.id}/deliver`, { expectedVersion: dispatch.version, deliveredAt }, role, key);
const effects = async (order) => ({
  documents: await prisma.stockDocument.count({ where: { reference: { startsWith: 'DISPATCH:' }, dispatch: { orderId: order.id } } }),
  costs: await prisma.costEntry.count({ where: { jobId: order.jobId } }),
  status: (await prisma.allocation.findMany({ where: { jobId: order.jobId }, select: { status: true } })).every((row) => row.status === 'RESERVED'),
});
const untouched = async (order) => assert.deepEqual(await effects(order), { documents: 0, costs: 0, status: true });

test('posting takes the goods out of stock and freezes their cost, all together', async () => {
  const { order, products } = await reservedOrder();
  const bulk = products.find((product) => product.trackingMode === 'BULK');
  const before = { hand: await onHand(bulk.id), held: await reserved(bulk.id) };
  const need = order.packing.filter((line) => line.productId === bulk.id).reduce((sum, line) => sum + Number(line.quantity), 0);
  const before2 = byCode(await integrity.report());
  const ready = await scanAll(order, await prepare(order));
  assert.equal(ready.scanReadiness.complete, true); assert.equal(ready.status, 'DRAFT');
  const done = await ok(post(ready));
  assert.equal(done.status, 'DISPATCHED'); assert.ok(done.dispatchedAt); assert.equal(done.deliveredAt, null);
  assert.ok(done.scans.every((scan) => scan.countsForDispatch), 'scans still count after posting');
  assert.equal((await onHand(bulk.id)).toNumber(), before.hand.toNumber() - need);
  assert.equal((await reserved(bulk.id)).toNumber(), before.held.toNumber() - need, 'a dispatched allocation no longer holds free stock');
  const dispatch = await prisma.dispatch.findUniqueOrThrow({ where: { id: done.id }, include: { issueDocument: { include: { lines: { include: { movement: true } } } } } });
  assert.equal(dispatch.dispatchedById, staff.WAREHOUSE.id);
  const document = dispatch.issueDocument;
  assert.equal(document.kind, 'ISSUE'); assert.equal(document.status, 'DONE'); assert.equal(document.fromLocationId, main.id);
  const allocations = await prisma.allocation.findMany({ where: { jobId: order.jobId }, include: { unit: { include: { movements: true } } } });
  assert.equal(document.lines.length, allocations.length);
  assert.ok(document.lines.every((line) => line.movement && line.movement.toLocationId === null && line.movement.actorId === staff.WAREHOUSE.id));
  assert.ok(allocations.every((row) => row.status === 'DISPATCHED'));
  for (const row of allocations.filter((item) => item.unit)) {
    assert.equal(row.unit.status, 'DISPATCHED'); assert.equal(row.unit.movements.length, 2, 'received, then dispatched');
    const { rows: [where] } = await sql.query('SELECT "locationId" FROM unit_locations WHERE "unitId" = $1', [row.unitId]);
    assert.equal(where.locationId, null, 'a dispatched unit has left company stock');
  }
  const posted = await prisma.costEntry.findMany({ where: { jobId: order.jobId } });
  assert.equal(posted.length, allocations.length);
  assert.ok(posted.every((entry) => entry.costType === 'MATERIAL_DISPATCH' && entry.uniqueSourceId.startsWith('STOCK_MOVEMENT:')));
  const ids = new Set(document.lines.map((line) => `STOCK_MOVEMENT:${line.movement.id}`));
  assert.ok(posted.every((entry) => ids.has(entry.uniqueSourceId)));
  const cost = async (line) => prisma.costEntry.findFirstOrThrow({ where: { uniqueSourceId: `STOCK_MOVEMENT:${line.movement.id}` } });
  const serialLines = document.lines.filter((line) => products.find((product) => product.id === line.productId).trackingMode === 'SERIALIZED');
  assert.equal(serialLines.length, allocations.filter((item) => item.unit).length);
  for (const line of serialLines) {
    const { unit } = await prisma.unitMovement.findFirstOrThrow({ where: { movementId: line.movement.id }, include: { unit: true } });
    assert.equal((await cost(line)).amount.toFixed(2), unit.acquisitionCost.toFixed(2), 'a serial unit costs what it was received at');
  }
  const basis = await prisma.productCostBasis.findUniqueOrThrow({ where: { productId: bulk.id } });
  const bulkLine = document.lines.find((line) => line.productId === bulk.id);
  assert.equal((await cost(bulkLine)).amount.toFixed(2), bulkLine.quantity.times(basis.averageCost).toDecimalPlaces(2).toFixed(2), 'bulk costs its moving average');
  assert.deepEqual(byCode(await integrity.report()), before2, 'a real dispatch adds no integrity findings');
});
const byCode = (report) => Object.fromEntries(report.data.checks.map((check) => [check.code, check.count]));

test('bulk cost is today\'s moving average, frozen when posted; later changes never touch it', async () => {
  const { order, products } = await reservedOrder({ unitCost: '100.00' });
  const bulk = products.filter((product) => product.trackingMode === 'BULK').sort((a, b) => a.sku.localeCompare(b.sku))[0];
  await prisma.productCostBasis.update({ where: { productId: bulk.id }, data: { averageCost: '33.335000' } });
  const quantity = order.packing.filter((line) => line.productId === bulk.id).reduce((sum, line) => sum + Number(line.quantity), 0);
  const done = await ok(post(await scanAll(order, await prepare(order))));
  const line = await prisma.stockDocumentLine.findFirstOrThrow({ where: { document: { dispatch: { id: done.id } }, productId: bulk.id }, include: { movement: true } });
  const entry = await prisma.costEntry.findFirstOrThrow({ where: { uniqueSourceId: `STOCK_MOVEMENT:${line.movement.id}` } });
  const exact = (await prisma.$queryRaw`SELECT ROUND(${quantity}::numeric * 33.335000, 2)::text AS amount`)[0].amount;
  assert.equal(entry.amount.toFixed(2), Number(exact).toFixed(2));
  await prisma.productCostBasis.update({ where: { productId: bulk.id }, data: { averageCost: '999.000000' } });
  assert.equal((await prisma.costEntry.findUniqueOrThrow({ where: { id: entry.id } })).amount.toFixed(2), Number(exact).toFixed(2));
});

test('every required unit must have a real scan: missing and typed ones refuse and change nothing', async () => {
  const { order } = await reservedOrder();
  const draft = await prepare(order);
  await refused(post(draft), 409, 'SCANS_MISSING');
  let typed = draft;
  for (const row of await serialRows(order)) typed = await ok(send(`/dispatches/${draft.id}/scans`, { rawValue: row.unit.rawSerial, method: 'TYPED', unitId: row.unitId }), 201);
  assert.equal(typed.scanReadiness.complete, false, 'typing every serial is not scanning them');
  await refused(post(typed), 409, 'SCANS_MISSING');
  await untouched(order);
  assert.equal((await prisma.dispatch.findUniqueOrThrow({ where: { id: draft.id } })).status, 'DRAFT');
  await refused(send(`/dispatches/${draft.id}/dispatch`, { expectedVersion: 99 }), 409, 'STALE_VERSION');
  await refused(send(`/dispatches/${randomUUID()}/dispatch`, { expectedVersion: 1 }), 404, 'NOT_FOUND');
});

test('a retry replays, a new key is refused, two at once have one winner, and scanning stops', async () => {
  const { order } = await reservedOrder();
  const ready = await scanAll(order, await prepare(order));
  const key = randomUUID();
  const first = await ok(post(ready, 'WAREHOUSE', key));
  assert.deepEqual(await ok(post(ready, 'WAREHOUSE', key)), first);
  await refused(post(first), 409, 'DISPATCH_ALREADY_POSTED');
  const count = (await effects(order)).costs;
  assert.equal((await effects(order)).documents, 1); assert.ok(count > 0);
  const [row] = await serialRows(order);
  await refused(send(`/dispatches/${ready.id}/scans`, { rawValue: row.unit.rawSerial, method: 'CAMERA', unitId: row.unitId }), 409, 'DISPATCH_ALREADY_POSTED');
  const job = await prisma.job.findUniqueOrThrow({ where: { id: order.jobId } });
  await refused(send(`/orders/${order.id}/allocations/release`, { expectedVersion: job.version, reason: 'Changed plan for this order' }), 409, 'ALLOCATION_NOT_RELEASABLE');
  const race = await reservedOrder();
  const raceReady = await scanAll(race.order, await prepare(race.order));
  const results = await Promise.all([post(raceReady), post(raceReady)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal((await effects(race.order)).documents, 1);
  assert.equal(await prisma.costEntry.count({ where: { jobId: race.order.jobId } }), count);
});

test('a failure anywhere rolls back the stock, cost and status together, and the key can retry', async () => {
  const { order, products } = await reservedOrder();
  const ready = await scanAll(order, await prepare(order));
  const bulk = products.find((product) => product.trackingMode === 'BULK');
  const hand = await onHand(bulk.id);
  const original = costs.postCost.bind(costs); let calls = 0;
  costs.postCost = async (tx, input) => { calls += 1; if (calls === 3) throw new Error('cost writer failed'); return original(tx, input); };
  const key = randomUUID();
  try { assert.equal((await post(ready, 'WAREHOUSE', key)).status, 500); } finally { costs.postCost = original; }
  await untouched(order);
  assert.equal((await onHand(bulk.id)).toNumber(), hand.toNumber());
  assert.equal(await prisma.stockDocument.count({ where: { reference: `DISPATCH:${ready.id}` } }), 0);
  const current = await prisma.dispatch.findUniqueOrThrow({ where: { id: ready.id } });
  assert.equal(current.status, 'DRAFT'); assert.equal(current.version, ready.version);
  assert.equal((await ok(post(ready, 'WAREHOUSE', key))).status, 'DISPATCHED');
});

test('a shortage or a missing cost refuses the whole dispatch', async () => {
  const short = await reservedOrder();
  const ready = await scanAll(short.order, await prepare(short.order));
  const bulk = short.products.find((product) => product.trackingMode === 'BULK');
  const counted = await ok(send('/stock/counts', { reference: 'CT-' + randomUUID(), locationId: main.id, lines: [{ productId: bulk.id, countedQuantity: '0' }] }), 201);
  await ok(send(`/stock/documents/${counted.id}/validate`, { expectedVersion: counted.version }));
  await refused(post(ready), 409, 'DISPATCH_NOT_READY');
  await untouched(short.order);
  const held = await reserved(bulk.id);
  await ok(send('/stock/receipts', { reference: 'REC-' + randomUUID(), locationId: main.id, receivedAt: '2026-10-30T10:00:00.000Z', lines: [{ productId: bulk.id, quantity: held.toFixed(3), unitCost: '100.00' }] }), 201);
  const uncosted = await reservedOrder();
  const uncostedReady = await scanAll(uncosted.order, await prepare(uncosted.order));
  const product = uncosted.products.find((item) => item.trackingMode === 'BULK');
  const basis = await prisma.productCostBasis.findUniqueOrThrow({ where: { productId: product.id } });
  await prisma.productCostBasis.delete({ where: { productId: product.id } });
  await refused(post(uncostedReady), 409, 'DISPATCH_COST_UNKNOWN');
  await prisma.productCostBasis.create({ data: { productId: product.id, averageCost: basis.averageCost } });
  await untouched(uncosted.order);
});

test('delivery checks its time, posts no stock and starts each warranty from the quote\'s frozen terms', async () => {
  const policies = { getWarrantyPolicySnapshot: async () => POLICY };
  const { order } = await reservedOrder({ policies });
  const ready = await scanAll(order, await prepare(order));
  await refused(deliver(ready), 409, 'DISPATCH_NOT_POSTED');
  const done = await ok(post(ready));
  const movements = await prisma.stockMovement.count();
  const costCount = await prisma.costEntry.count({ where: { jobId: order.jobId } });
  await refused(deliver(done, new Date(Date.parse(done.dispatchedAt) - 60_000).toISOString()), 400, 'INVALID_INPUT');
  await refused(deliver(done, new Date(Date.now() + 60_000).toISOString()), 400, 'INVALID_INPUT');
  await refused(send(`/dispatches/${done.id}/deliver`, { expectedVersion: 99, deliveredAt: new Date().toISOString() }), 409, 'STALE_VERSION');
  const when = new Date().toISOString(); const key = randomUUID();
  const delivered = await ok(deliver(done, when, 'WAREHOUSE', key));
  assert.equal(delivered.status, 'DELIVERED'); assert.equal(delivered.deliveredAt, when);
  assert.equal(await prisma.stockMovement.count(), movements, 'delivery posts no stock');
  assert.equal(await prisma.costEntry.count({ where: { jobId: order.jobId } }), costCount, 'delivery posts no cost');
  const allocations = await prisma.allocation.findMany({ where: { jobId: order.jobId }, include: { unit: true } });
  assert.ok(allocations.every((row) => row.status === 'DELIVERED' && (!row.unit || row.unit.status === 'DELIVERED')));
  const start = istDate(new Date(when)); const expiry = addCalendarMonths(start, 24);
  const units = allocations.filter((row) => row.unitId);
  assert.equal(delivered.coverage.length, units.length);
  assert.ok(delivered.coverage.every((row) => row.status === 'ACTIVE' && row.startDate === start && row.expiryDate === expiry && row.policyName === POLICY.policyName));
  const saved = await prisma.warranty.findMany({ where: { unitId: { in: units.map((row) => row.unitId) } } });
  assert.equal(saved.length, units.length); assert.ok(saved.every((row) => row.durationMonths === 24 && row.scope === POLICY.scope && row.active));
  assert.deepEqual(await ok(deliver(done, when, 'WAREHOUSE', key)), delivered, 'a retry returns the same result');
  await refused(deliver(delivered), 409, 'DISPATCH_ALREADY_DELIVERED');
  assert.equal(await prisma.warranty.count({ where: { unitId: { in: units.map((row) => row.unitId) } } }), units.length, 'no second warranty');
  const unchanged = await prisma.warranty.findMany({ where: { unitId: { in: units.map((row) => row.unitId) } } });
  assert.deepEqual(unchanged.map((row) => row.expiryDate.toISOString()).sort(), saved.map((row) => row.expiryDate.toISOString()).sort(), 'dates never move');
});

test('with no frozen terms, delivery still completes and marks the units honestly', async () => {
  const { order } = await reservedOrder();
  const done = await ok(post(await scanAll(order, await prepare(order))));
  const delivered = await ok(deliver(done));
  assert.ok(delivered.coverage.length > 0);
  assert.ok(delivered.coverage.every((row) => row.status === 'NO_POLICY' && row.expiryDate === null));
  assert.equal(await prisma.warranty.count({ where: { unitId: { in: delivered.coverage.map((row) => row.unitId) } } }), 0, 'no terms are invented');
});

test('an existing warranty is never restarted by a delivery', async () => {
  const { order } = await reservedOrder({ policies: { getWarrantyPolicySnapshot: async () => POLICY } });
  const done = await ok(post(await scanAll(order, await prepare(order))));
  const [row] = await serialRows(order);
  await prisma.warranty.create({ data: { unitId: row.unitId, startDate: new Date('2025-01-01'), expiryDate: new Date('2027-01-01'), policyName: 'Continued', policyRevision: 'v1', scope: 'Component replacement', durationMonths: 24 } });
  await ok(deliver(done));
  const kept = await prisma.warranty.findUniqueOrThrow({ where: { unitId: row.unitId } });
  assert.equal(kept.policyName, 'Continued'); assert.equal(kept.startDate.toISOString().slice(0, 10), '2025-01-01');
});

test('warranty dates use IST and clamp to the end of the month', () => {
  assert.equal(istDate(new Date('2026-01-31T18:29:59.000Z')), '2026-01-31');
  assert.equal(istDate(new Date('2026-01-31T18:30:00.000Z')), '2026-02-01', 'midnight in India, while it is still 31 Jan in UTC');
  assert.equal(addCalendarMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addCalendarMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addCalendarMonths('2028-02-29', 12), '2029-02-28');
  assert.equal(addCalendarMonths('2026-11-15', 24), '2028-11-15');
  assert.equal(addCalendarMonths('2026-12-31', 2), '2027-02-28');
});

test('only warehouse and admin staff can post or deliver, with a key', async () => {
  const { order } = await reservedOrder();
  const ready = await scanAll(order, await prepare(order));
  for (const role of ['SALES', 'TECHNICIAN']) await refused(post(ready, role), 403, 'FORBIDDEN');
  await refused(send(`/dispatches/${ready.id}/dispatch`, { expectedVersion: ready.version }, 'WAREHOUSE', null), 400, 'INVALID_INPUT');
  const done = await ok(post(ready, 'ADMIN'));
  for (const role of ['SALES', 'TECHNICIAN']) await refused(deliver(done, new Date().toISOString(), role), 403, 'FORBIDDEN');
  assert.equal((await ok(deliver(done, new Date().toISOString(), 'ADMIN'))).status, 'DELIVERED');
  assert.equal((await prisma.dispatch.findUniqueOrThrow({ where: { id: done.id } })).deliveredById, staff.ADMIN.id);
});

test('the database keeps a dispatch moving forward and its facts final', async () => {
  const draftOrder = await reservedOrder();
  const draft = await prepare(draftOrder.order);
  const posted = await reservedOrder();
  const done = await ok(post(await scanAll(posted.order, await prepare(posted.order))));
  const update = (id, set, ...values) => sql.query(`UPDATE dispatches SET version = version + 1, ${set} WHERE id = $1`, [id, ...values]);
  await assert.rejects(update(draft.id, `status = 'DISPATCHED'`), /dispatches_dispatched_facts|needs its issue document/);
  await assert.rejects(update(draft.id, `status = 'DELIVERED'`), /cannot move from DRAFT to DELIVERED/);
  await assert.rejects(update(done.id, `status = 'DRAFT'`), /cannot move from DISPATCHED to DRAFT/);
  await assert.rejects(update(done.id, `"dispatchedAt" = now() - interval '1 day'`), /dispatch facts are final/);
  await assert.rejects(update(done.id, `status = 'DELIVERED'`), /dispatches_delivered_facts/);
  await assert.rejects(update(done.id, `status = 'DELIVERED', "deliveredAt" = "dispatchedAt" - interval '1 day', "deliveredById" = "dispatchedById"`), /dispatches_delivery_ordered/);
  const delivered = await ok(deliver(done));
  await assert.rejects(update(delivered.id, `"deliveredAt" = now()`), /dispatch facts are final/);
  await assert.rejects(update(delivered.id, `status = 'DISPATCHED'`), /cannot move from DELIVERED to DISPATCHED/);
  const issue = await prisma.dispatch.findUniqueOrThrow({ where: { id: delivered.id }, include: { issueDocument: { include: { lines: { include: { movement: true } } } } } });
  await assert.rejects(sql.query('UPDATE stock_movements SET quantity = 99 WHERE id = $1', [issue.issueDocument.lines[0].movement.id]), /append-only/);
  await assert.rejects(sql.query('UPDATE stock_documents SET reference = $1 WHERE id = $2', ['x', issue.issueDocumentId]), /closed stock document/);
  const [row] = await serialRows(posted.order);
  await assert.rejects(sql.query(`INSERT INTO dispatch_scans (id, "dispatchId", "allocationId", "rawValue", "normalizedSerial", method, "actorId") VALUES (gen_random_uuid(), $1, $2, 'x', $3, 'CAMERA', $4)`, [delivered.id, row.id, row.unit.normalizedSerial, staff.WAREHOUSE.id]), /must match its reserved equipment/);
});
