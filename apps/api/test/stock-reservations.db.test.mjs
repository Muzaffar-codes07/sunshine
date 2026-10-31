// Explicit disposable test database only; never load the application .env.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('TEST_DATABASE_URL must name a disposable test database');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'allocation-tests-only-session-secret';
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
const { StockLedgerService } = require('../dist/inventory/stock-ledger.service');
const { AllocationsService } = require('../dist/inventory/allocations.service');
const { DispatchScansService } = require('../dist/inventory/dispatch-scans.service');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { catalogueDemoId: id } = require('../dist/catalog/demo-catalogue');
const { hashPassword } = require('../dist/auth/passwords');
const { Client } = require('pg');

const origin = 'http://127.0.0.1:3001';
const password = 'allocation-test-password-2026';
const facts = { roofDirection: 'S', roofTiltDeg: '18.5', cableDistanceM: '22.00', usableRoofAreaSqm: '30.00' };
const cookies = {}; const staff = {};
let app, base, prisma, idempotency, quotes, surveys, orders, invoices, ledger, sql, main, quarantine;

const identity = (row) => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });
before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1'); base = (await app.getUrl()) + '/api/v1';
  prisma = app.get(PrismaService); idempotency = app.get(IdempotencyService); quotes = app.get(QuotesService); surveys = app.get(SurveysService);
  orders = app.get(OrdersService); invoices = app.get(InvoicesService); ledger = app.get(StockLedgerService);
  await seedCatalogue(prisma);
  sql = new Client({ connectionString: testUrl }); await sql.connect();
  for (const role of ['WAREHOUSE', 'SALES', 'ADMIN', 'TECHNICIAN']) {
    const row = await prisma.user.create({ data: { email: randomUUID() + '@test.local', displayName: role + ' allocation tester', role, passwordHash: await hashPassword(password) } });
    staff[role] = row;
    const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email: row.email, password }) });
    assert.equal(response.status, 200); cookies[role] = response.headers.get('set-cookie').split(';')[0];
  }
  main = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'MAIN' } });
  quarantine = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'QUARANTINE' } });
});
after(async () => { await sql?.end(); await app?.close(); });

const send = (route, body, role = 'WAREHOUSE', key = randomUUID()) => fetch(base + route, {
  method: 'POST', headers: { 'content-type': 'application/json', origin, ...(key ? { 'idempotency-key': key } : {}), cookie: cookies[role] }, body: JSON.stringify(body),
});
const get = (route, role = 'WAREHOUSE') => fetch(base + route, { headers: { cookie: cookies[role] } });
const ok = async (pending, status = 201) => {
  const response = await pending; const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); return body.data;
};
const refused = async (pending, status, code) => {
  const response = await pending; const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); assert.equal(body.error.code, code); return body.error;
};
const onHand = async (productId, locationId = main.id) => (await prisma.$transaction((tx) => ledger.onHand(tx, productId, locationId)));
const reserved = async (productId) => (await prisma.$transaction((tx) => ledger.reserved(tx, productId, main.id)));

/** A confirmed 1 kW order for the demo package, paid unless told otherwise. */
async function confirmedOrder({ paid = true } = {}) {
  const customer = await prisma.customer.create({ data: {
    name: 'Allocation Customer', phone: `7${String(randomInt(1e9)).padStart(9, '0')}`, addressLine: '5 Stock Road', city: 'Nagpur', pincode: '440001',
  } });
  const enquiry = await prisma.enquiry.create({ data: {
    customerId: customer.id, source: 'PHONE', requestedCapacityKw: 1, status: 'QUALIFIED',
    contactName: 'Allocation Customer', siteAddressLine: '5 Stock Road', siteCity: 'Nagpur', sitePincode: '440001',
  } });
  const sales = identity(staff.SALES);
  const survey = (await surveys.schedule(enquiry.id, { technicianId: staff.TECHNICIAN.id, scheduledFor: '2026-11-02T05:00:00.000Z' })).data;
  await surveys.submit(survey.id, { version: 1, ...facts }, identity(staff.TECHNICIAN));
  await surveys.approve(survey.id, { version: 2 }, sales);
  const draft = (await quotes.create(enquiry.id, { surveyId: survey.id, packageId: id(1001) }, sales)).data;
  await quotes.send(draft.id, { version: 1, channel: 'PRINT' }, sales);
  await quotes.accept(draft.id, { version: 2, acceptedByName: 'Allocation Customer', channel: 'IN_PERSON' }, sales);
  const order = (await orders.confirm({ quoteId: draft.id }, randomUUID(), sales)).data;
  if (paid) {
    const receipt = { amountInr: '1000.00', method: 'UPI', reference: `UTR${randomUUID().slice(0, 12)}`, receivedAt: new Date().toISOString() };
    await idempotency.run({ actorId: staff.ADMIN.id, key: randomUUID(), action: 'PAYMENT_RECEIPT', payload: { order: order.id, ...receipt } },
      (tx) => invoices.recordPayment(tx, order.invoice.id, receipt, identity(staff.ADMIN)));
  }
  return order;
}
const productsOf = (order) => prisma.product.findMany({ where: { id: { in: order.packing.map((line) => line.productId) } } });
const receive = (productId, quantity, serials = []) => ok(send('/stock/receipts', {
  reference: 'REC-' + randomUUID(), locationId: main.id, receivedAt: '2026-10-30T10:00:00.000Z', lines: [{ productId, quantity: String(quantity), unitCost: '100.00', serials }],
}));
/** Enough free stock for `times` orders of this package. */
async function stock(order, times = 1) {
  const created = {};
  for (const product of await productsOf(order)) {
    const needed = order.packing.filter((line) => line.productId === product.id).reduce((sum, line) => sum + Number(line.quantity), 0) * times;
    if (product.trackingMode === 'SERIALIZED') {
      const serials = Array.from({ length: needed }, () => 'SN-' + randomUUID().slice(0, 13).toUpperCase());
      const receipt = await receive(product.id, needed, serials);
      created[product.id] = receipt.lines[0].unitIds;
    } else await receive(product.id, needed);
  }
  return created;
}
const version = async (order) => (await prisma.job.findUniqueOrThrow({ where: { id: order.jobId } })).version;
const allocate = async (order, body = {}, role = 'WAREHOUSE', key = randomUUID()) => send(`/orders/${order.id}/allocations`, { expectedVersion: await version(order), ...body }, role, key);
const release = async (order, body = {}, role = 'WAREHOUSE', key = randomUUID()) => send(`/orders/${order.id}/allocations/release`, {
  expectedVersion: await version(order), reason: 'Reschedule equipment allocation', ...body,
}, role, key);
const dispatchDraft = async (order, key = randomUUID()) => send(`/orders/${order.id}/dispatches`, { expectedVersion: await version(order) }, 'WAREHOUSE', key);
const scan = (draft, unit, method = 'SCANNER', key = randomUUID()) => send(`/dispatches/${draft.id}/scans`, { rawValue: unit.rawSerial, method, unitId: unit.id }, 'WAREHOUSE', key);
async function preparedDispatch() {
  const order = await confirmedOrder(); await stock(order);
  const allocations = await ok(allocate(order)); const draft = await ok(dispatchDraft(order));
  const units = await prisma.unit.findMany({ where: { id: { in: allocations.flatMap((row) => row.unitId ? [row.unitId] : []) } }, orderBy: { id: 'asc' } });
  return { order, allocations, draft, units };
}
const held = (order) => prisma.allocation.findMany({ where: { jobId: order.jobId } });
const stripStock = async (productId) => {
  const available = await prisma.$queryRaw`SELECT u."id" FROM "units" u JOIN "unit_locations" l ON l."unitId" = u."id" WHERE u."productId" = ${productId}::uuid AND u."status" = 'AVAILABLE' AND l."locationId" = ${main.id}::uuid`;
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  const free = (await onHand(productId)).minus(await reserved(productId));
  if (product.trackingMode === 'SERIALIZED' && available.length === 0) return;
  if (product.trackingMode !== 'SERIALIZED' && !free.greaterThan(0)) return;
  const units = await prisma.unit.findMany({ where: { id: { in: available.map((row) => row.id) } } });
  const line = product.trackingMode === 'SERIALIZED' ? { productId, quantity: String(units.length), serials: units.map((unit) => unit.rawSerial) } : { productId, quantity: free.toFixed(3) };
  const draft = await ok(send('/stock/transfers', { reference: 'DRAIN-' + randomUUID(), fromLocationId: main.id, toLocationId: quarantine.id, lines: [line] }));
  await ok(send(`/stock/documents/${draft.id}/validate`, { expectedVersion: draft.version }), 200);
};

test('a paid order reserves every requirement; free stock falls and units are held', async () => {
  const order = await confirmedOrder();
  const created = await stock(order);
  const products = await productsOf(order);
  const bulk = products.find((product) => product.trackingMode === 'BULK');
  const before = await reserved(bulk.id); const hand = await onHand(bulk.id);
  const data = await ok(allocate(order));
  const required = order.packing.reduce((sum, line) => sum + (products.find((p) => p.id === line.productId).trackingMode === 'SERIALIZED' ? Number(line.quantity) : 1), 0);
  assert.equal(data.length, required);
  assert.ok(data.every((row) => row.status === 'RESERVED' && row.jobId === order.jobId && row.source.kind === 'QUOTE_LINE'));
  const units = await prisma.unit.findMany({ where: { id: { in: data.map((row) => row.unitId).filter(Boolean) } } });
  assert.equal(units.length, Object.values(created).flat().length);
  assert.ok(units.every((unit) => unit.status === 'RESERVED' && unit.version === 2));
  const need = order.packing.filter((line) => line.productId === bulk.id).reduce((sum, line) => sum + Number(line.quantity), 0);
  assert.equal((await reserved(bulk.id)).toNumber(), before.toNumber() + need);
  assert.equal((await onHand(bulk.id)).toNumber(), hand.toNumber(), 'reserving moves no stock');
  const level = (await ok(get(`/stock?productId=${bulk.id}&locationId=${main.id}`), 200)).items[0];
  assert.equal(level.reserved, (before.toNumber() + need).toFixed(3));
  assert.equal(level.free, (hand.toNumber() - before.toNumber() - need).toFixed(3));
  assert.deepEqual(await ok(get(`/orders/${order.id}/allocations`), 200), data);
});

test('an unpaid order reserves nothing', async () => {
  const order = await confirmedOrder({ paid: false });
  await stock(order);
  const v = await version(order);
  await refused(allocate(order), 409, 'ORDER_NOT_RELEASED');
  assert.equal((await held(order)).length, 0); assert.equal(await version(order), v, 'the claim rolled back');
});

test('one short line rolls back every reservation and names what is short', async () => {
  const order = await confirmedOrder();
  await stock(order);
  const products = await productsOf(order);
  const bulk = products.find((product) => product.trackingMode === 'BULK');
  const serial = products.find((product) => product.trackingMode === 'SERIALIZED');
  await stripStock(bulk.id); await stripStock(serial.id);
  const before = await prisma.allocation.count();
  const reservedUnits = await prisma.unit.count({ where: { status: 'RESERVED' } });
  const error = await refused(allocate(order), 409, 'NOT_READY');
  assert.deepEqual(error.reasons.map((reason) => reason.code), ['INSUFFICIENT_STOCK', 'INSUFFICIENT_STOCK']);
  assert.ok(error.reasons.some((reason) => reason.reason.includes(bulk.id)) && error.reasons.some((reason) => reason.reason.includes(serial.id)));
  assert.equal(await prisma.allocation.count(), before);
  assert.equal(await prisma.unit.count({ where: { status: 'RESERVED' } }), reservedUnits);
  await stock(order);
  assert.ok((await ok(allocate(order))).length > 0, 'it works once stock arrives');
});

test('two orders for the last stock have one winner and leave nothing partial', async () => {
  const [one, two] = [await confirmedOrder(), await confirmedOrder()];
  for (const product of await productsOf(one)) await stripStock(product.id);
  await stock(one);
  // Holding one Product row from outside proves both requests wait for the lock instead of reading free stock at once.
  const contested = (await productsOf(one))[0].id;
  await sql.query('BEGIN');
  await sql.query('SELECT id FROM products WHERE id = $1 FOR NO KEY UPDATE', [contested]);
  const pending = Promise.all([allocate(one), allocate(two)]);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal((await held(one)).length + (await held(two)).length, 0, 'nothing commits while the lock is held');
  await sql.query('COMMIT');
  const results = await pending;
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  const counts = [(await held(one)).length, (await held(two)).length].sort((a, b) => a - b);
  assert.equal(counts[0], 0); assert.ok(counts[1] > 0);
});

test('two orders naming the same unit have one winner; a held unit cannot be substituted', async () => {
  const [one, two] = [await confirmedOrder(), await confirmedOrder()];
  const created = await stock(one, 2);
  const products = await productsOf(one);
  const units = (taken) => products.filter((p) => p.trackingMode === 'SERIALIZED').flatMap((p) => {
    const needed = one.packing.filter((line) => line.productId === p.id).reduce((sum, line) => sum + Number(line.quantity), 0);
    return created[p.id].slice(taken * needed, (taken + 1) * needed);
  });
  const shared = units(0);
  const results = await Promise.all([allocate(one, { unitIds: shared }), allocate(two, { unitIds: shared })]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  const loser = results[0].status === 201 ? two : one;
  await refused(allocate(loser, { unitIds: shared }), 409, 'NOT_ALLOCATABLE');
  assert.equal((await held(loser)).length, 0);
  assert.ok((await ok(allocate(loser, { unitIds: units(1) }))).length > 0, 'its own units still work');
  const rows = await prisma.allocation.findMany({ where: { unitId: { in: shared } } });
  assert.equal(rows.length, shared.length);
  assert.equal(new Set(rows.map((row) => row.jobId)).size, 1);
});

test('chosen units must be free, in usable stock, the right product and the right number', async () => {
  const order = await confirmedOrder();
  const created = await stock(order, 2);
  const products = await productsOf(order);
  const serial = products.filter((p) => p.trackingMode === 'SERIALIZED');
  const needed = (p) => order.packing.filter((line) => line.productId === p.id).reduce((sum, line) => sum + Number(line.quantity), 0);
  const right = serial.flatMap((p) => created[p.id].slice(0, needed(p)));
  await refused(allocate(order, { unitIds: [randomUUID()] }), 409, 'NOT_ALLOCATABLE');
  await refused(allocate(order, { unitIds: right.slice(1) }), 409, 'NOT_ALLOCATABLE');
  const foreign = await prisma.unit.findFirst({ where: { productId: { notIn: serial.map((p) => p.id) } } });
  if (foreign) await refused(allocate(order, { unitIds: [...right.slice(1), foreign.id] }), 409, 'NOT_ALLOCATABLE');
  const moved = await prisma.unit.findUniqueOrThrow({ where: { id: right[0] } });
  const draft = await ok(send('/stock/transfers', { reference: 'Q-' + randomUUID(), fromLocationId: main.id, toLocationId: quarantine.id, lines: [{ productId: moved.productId, quantity: '1', serials: [moved.rawSerial] }] }));
  await ok(send(`/stock/documents/${draft.id}/validate`, { expectedVersion: draft.version }), 200);
  await refused(allocate(order, { unitIds: right }), 409, 'NOT_ALLOCATABLE');
  assert.equal((await held(order)).length, 0);
});

test('a retry replays, another key is refused, and a stale version is refused', async () => {
  const order = await confirmedOrder();
  await stock(order);
  const v = await version(order);
  await refused(send(`/orders/${order.id}/allocations`, { expectedVersion: v + 5 }), 409, 'STALE_VERSION');
  const key = randomUUID();
  const first = await ok(send(`/orders/${order.id}/allocations`, { expectedVersion: v }, 'WAREHOUSE', key));
  assert.deepEqual(await ok(send(`/orders/${order.id}/allocations`, { expectedVersion: v }, 'WAREHOUSE', key)), first);
  await refused(allocate(order), 409, 'ALREADY_ALLOCATED');
  assert.equal((await held(order)).length, first.length);
});

test('concurrent allocations across orders finish without a deadlock', async () => {
  const batch = await Promise.all(Array.from({ length: 4 }, () => confirmedOrder()));
  await stock(batch[0], batch.length);
  const results = await Promise.all(batch.map((order) => allocate(order)));
  assert.deepEqual(results.map((result) => result.status), [201, 201, 201, 201]);
});

test('reserved stock limits transfers: bulk to the reserved floor, and a reserved unit not at all', async () => {
  const order = await confirmedOrder();
  await stock(order);
  const products = await productsOf(order);
  const bulk = products.find((product) => product.trackingMode === 'BULK');
  const rows = await ok(allocate(order));
  const free = (await onHand(bulk.id)).minus(await reserved(bulk.id));
  const transfer = async (line) => ok(send('/stock/transfers', { reference: 'T-' + randomUUID(), fromLocationId: main.id, toLocationId: quarantine.id, lines: [line] }));
  const over = await transfer({ productId: bulk.id, quantity: free.plus('0.001').toFixed(3) });
  await refused(send(`/stock/documents/${over.id}/validate`, { expectedVersion: over.version }), 409, 'STOCK_RESERVED');
  if (free.greaterThan(0)) {
    const exact = await transfer({ productId: bulk.id, quantity: free.toFixed(3) });
    await ok(send(`/stock/documents/${exact.id}/validate`, { expectedVersion: exact.version }), 200);
  }
  const unit = await prisma.unit.findUniqueOrThrow({ where: { id: rows.find((row) => row.unitId).unitId } });
  const held = await transfer({ productId: unit.productId, quantity: '1', serials: [unit.rawSerial] });
  await refused(send(`/stock/documents/${held.id}/validate`, { expectedVersion: held.version }), 409, 'NOT_MOVABLE');
});

test('a count below reserved is recorded truthfully and free goes negative', async () => {
  const order = await confirmedOrder();
  await stock(order);
  const bulk = (await productsOf(order)).find((product) => product.trackingMode === 'BULK');
  await ok(allocate(order));
  const draft = await ok(send('/stock/counts', { reference: 'C-' + randomUUID(), locationId: main.id, lines: [{ productId: bulk.id, countedQuantity: '0' }] }));
  await ok(send(`/stock/documents/${draft.id}/validate`, { expectedVersion: draft.version }), 200);
  const level = (await ok(get(`/stock?productId=${bulk.id}&locationId=${main.id}`), 200)).items[0];
  assert.equal(level.onHand, '0.000'); assert.ok(Number(level.free) < 0); assert.equal(level.free, '-' + level.reserved);
  await receive(bulk.id, level.reserved);
});

test('routes need warehouse or admin staff and an Idempotency-Key', async () => {
  const order = await confirmedOrder({ paid: false });
  await refused(allocate(order, {}, 'SALES'), 403, 'FORBIDDEN');
  await refused(allocate(order, {}, 'TECHNICIAN'), 403, 'FORBIDDEN');
  await refused(allocate(order, {}, 'WAREHOUSE', null), 400, 'INVALID_INPUT');
  await refused(send(`/orders/${randomUUID()}/allocations`, { expectedVersion: 1 }), 404, 'NOT_FOUND');
  await refused(get(`/orders/${randomUUID()}/allocations`), 404, 'NOT_FOUND');
});

test('the database holds one active allocation per unit and matches each one to what was sold', async () => {
  const [order, other] = [await confirmedOrder(), await confirmedOrder()];
  await stock(order); await stock(other);
  const rows = await ok(allocate(order));
  const serial = rows.find((row) => row.unitId); const bulk = rows.find((row) => !row.unitId);
  const insert = (fields) => sql.query(`INSERT INTO allocations (id, "jobId", "quoteLineId", "productId", "unitId", "locationId", quantity, status, "actorId", "updatedAt")
    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, now())`, [fields.jobId, fields.quoteLineId, fields.productId, fields.unitId ?? null, main.id, fields.quantity ?? 1, fields.status ?? 'RESERVED', staff.WAREHOUSE.id]);
  const base = { jobId: order.jobId, productId: serial.productId, quoteLineId: serial.source.quoteLineId };
  await assert.rejects(insert({ ...base, unitId: serial.unitId }), /allocations_one_active_unit/);
  await assert.rejects(insert({ ...bulk, jobId: order.jobId, productId: bulk.productId, quoteLineId: bulk.source.quoteLineId, unitId: null }), /allocations_one_active_bulk_line/);
  await assert.rejects(insert({ ...base, jobId: other.jobId, unitId: serial.unitId }), /must match a component sold/);
  await assert.rejects(insert({ ...base, productId: bulk.productId, unitId: serial.unitId }), /must match a component sold/);
  await assert.rejects(insert({ ...base, unitId: null }), /allocated by unit/);
  await assert.rejects(insert({ jobId: order.jobId, productId: bulk.productId, quoteLineId: bulk.source.quoteLineId, unitId: serial.unitId }), /allocated by unit|one_active/);
  await assert.rejects(insert({ ...base, unitId: serial.unitId, status: 'DISPATCHED' }), /starts as reserved/);
  await assert.rejects(insert({ ...base, unitId: serial.unitId, quantity: 2 }), /allocations_unit_is_one/);
  await assert.rejects(sql.query('UPDATE allocations SET quantity = 99 WHERE id = $1', [bulk.id]), /identity cannot change/);
  await assert.rejects(sql.query(`UPDATE allocations SET "jobId" = $1 WHERE id = $2`, [other.jobId, serial.id]), /identity cannot change/);
  await assert.rejects(sql.query('DELETE FROM allocations WHERE id = $1', [serial.id]), /identity cannot change/);
  await sql.query(`UPDATE allocations SET status = 'RELEASED', "releasedAt"=now(), "releasedById"=$2, "releaseReason"='Direct constraint fixture' WHERE id = $1`, [serial.id, staff.WAREHOUSE.id]);
  await assert.rejects(sql.query(`UPDATE allocations SET status = 'RESERVED' WHERE id = $1`, [serial.id]), /identity cannot change/);
});

test('unit traceability retains its customer and exclusive assignment through installed state', async () => {
  const [owner, other] = [await confirmedOrder(), await confirmedOrder()];
  const received = await stock(owner, 2);
  const products = await productsOf(owner);
  const chosen = products.filter((p) => p.trackingMode === 'SERIALIZED').flatMap((p) => {
    const needed = owner.packing.filter((line) => line.productId === p.id).reduce((sum, line) => sum + Number(line.quantity), 0);
    return received[p.id].slice(0, needed);
  });
  const allocations = await ok(allocate(owner, { unitIds: chosen }));
  const heldUnit = allocations.find((row) => row.unitId);
  const receiptLine = await prisma.unit.findUniqueOrThrow({ where: { id: heldUnit.unitId }, include: { receiptLine: true } });
  const otherLine = other.packing.find((line) => line.productId === heldUnit.productId);
  // These direct state fixtures test identity/index coverage, not execution of the future dispatch/delivery commands.
  for (const status of ['RESERVED', 'DISPATCHED', 'DELIVERED', 'INSTALLED']) {
    await prisma.$transaction(async (tx) => {
      await tx.allocation.update({ where: { id: heldUnit.id }, data: { status } });
      await tx.unit.update({ where: { id: heldUnit.unitId }, data: { status } });
    });
    const trace = await ok(get(`/units/${heldUnit.unitId}`), 200);
    assert.equal(trace.receiptId, receiptLine.receiptLine.documentId);
    assert.equal(trace.id, heldUnit.unitId); assert.equal(trace.status, status);
    assert.deepEqual(trace.activeAssignment, {
      allocationId: heldUnit.id, status, jobId: owner.jobId, orderId: owner.id, customerId: owner.customerId,
    });
    await refused(allocate(other, { unitIds: chosen }), 409, 'NOT_ALLOCATABLE');
    assert.equal((await held(other)).length, 0);
    await assert.rejects(sql.query(`INSERT INTO allocations
      (id,"jobId","quoteLineId","productId","unitId","locationId",quantity,"actorId","updatedAt")
      VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,1,$6,now())`,
    [other.jobId, otherLine.quoteLineId, heldUnit.productId, heldUnit.unitId, main.id, staff.WAREHOUSE.id]), /allocations_one_active_unit/);
    await assert.rejects(sql.query('UPDATE allocations SET "jobId"=$1,"quoteLineId"=$2 WHERE id=$3',
      [other.jobId, otherLine.quoteLineId, heldUnit.id]), /identity cannot change/);
  }
  await sql.query(`UPDATE allocations SET status='RELEASED', "releasedAt"=now(), "releasedById"=$2, "releaseReason"='Direct constraint fixture' WHERE id=$1`, [heldUnit.id, staff.WAREHOUSE.id]);
  assert.equal((await ok(get(`/units/${heldUnit.unitId}`), 200)).activeAssignment, null);
  assert.equal(await prisma.allocation.count({ where: { id: heldUnit.id } }), 1, 'released assignment history remains');
});

test('release frees all held equipment without stock movement, retains audit and allows reallocation', async () => {
  const order = await confirmedOrder(); await stock(order);
  const first = await ok(allocate(order)); const unitIds = first.flatMap((row) => row.unitId ? [row.unitId] : []);
  const productId = first.find((row) => !row.unitId).productId;
  const beforeStock = await onHand(productId); const beforeReserved = await reserved(productId);
  const movementCount = await prisma.stockMovement.count();
  const key = randomUUID(); const input = { expectedVersion: await version(order), reason: 'Customer changed the installation date' };
  const result = await ok(send(`/orders/${order.id}/allocations/release`, input, 'ADMIN', key), 200);
  assert.equal(result.jobVersion, input.expectedVersion + 1); assert.equal(result.releasedById, staff.ADMIN.id);
  const rows = await held(order);
  assert.ok(rows.every((row) => row.status === 'RELEASED' && row.releasedById === staff.ADMIN.id && row.releaseReason === input.reason
    && row.releasedAt.toISOString() === result.releasedAt));
  const reloaded = await ok(get(`/orders/${order.id}/allocations`), 200);
  assert.ok(reloaded.every((row) => row.releaseEvidence?.reason === input.reason
    && row.releaseEvidence.releasedById === staff.ADMIN.id && row.releaseEvidence.releasedAt === result.releasedAt));
  assert.equal(await prisma.unit.count({ where: { id: { in: unitIds }, status: 'AVAILABLE' } }), unitIds.length);
  const releasedBulk = first.filter((row) => row.productId === productId).reduce((sum, row) => sum + Number(row.quantity), 0);
  assert.equal((await reserved(productId)).toFixed(3), beforeReserved.minus(releasedBulk).toFixed(3));
  assert.equal((await onHand(productId)).toFixed(3), beforeStock.toFixed(3));
  assert.equal(await prisma.stockMovement.count(), movementCount);
  assert.equal((await ok(get(`/units/${unitIds[0]}`), 200)).activeAssignment, null);
  await refused(release(order), 409, 'ALLOCATION_NOT_RELEASABLE');
  const again = await ok(allocate(order, { unitIds }));
  assert.ok(again.some((row) => row.status === 'RESERVED'));
  assert.equal((await held(order)).filter((row) => row.status === 'RELEASED').length, first.length);
  // A late duplicate replays the old release; it must not free the new reservation.
  assert.deepEqual(await ok(send(`/orders/${order.id}/allocations/release`, input, 'ADMIN', key), 200), result);
  assert.equal((await held(order)).filter((row) => row.status === 'RESERVED').length, first.length);
  await refused(send(`/orders/${order.id}/allocations/release`, { ...input, reason: 'Different action with reused key' }, 'ADMIN', key), 409, 'IDEMPOTENCY_CONFLICT');
});

test('release rejects stale versions, started jobs and a partly dispatched reservation without freeing anything', async () => {
  const order = await confirmedOrder(); await stock(order); const allocated = await ok(allocate(order));
  const v = await version(order); const before = await held(order);
  await refused(release(order, { expectedVersion: v + 1 }), 409, 'STALE_VERSION');
  const started = await confirmedOrder(); await stock(started); await ok(allocate(started));
  await prisma.job.update({ where: { id: started.jobId }, data: { status: 'IN_PROGRESS', startedAt: new Date(), startedById: staff.WAREHOUSE.id } });
  await refused(release(started), 409, 'ALLOCATION_NOT_RELEASABLE');
  await prisma.allocation.update({ where: { id: allocated[0].id }, data: { status: 'DISPATCHED' } });
  await refused(release(order), 409, 'ALLOCATION_NOT_RELEASABLE');
  assert.equal(await version(order), v);
  const after = await held(order);
  assert.equal(after.filter((row) => row.status === 'RELEASED').length, 0);
  assert.ok(after.every((row) => row.releasedAt === null && row.releasedById === null && row.releaseReason === null));
  assert.equal(after.length, before.length);
});

test('an inconsistent unit refuses the complete release and the same key can retry after correction', async () => {
  const order = await confirmedOrder(); await stock(order); const allocated = await ok(allocate(order));
  const unitId = allocated.find((row) => row.unitId).unitId;
  await prisma.unit.update({ where: { id: unitId }, data: { status: 'QUARANTINED' } });
  const before = await held(order); const v = await version(order); const key = randomUUID();
  await refused(release(order, {}, 'WAREHOUSE', key), 409, 'ALLOCATION_NOT_RELEASABLE');
  assert.deepEqual(await held(order), before); assert.equal(await version(order), v);
  await prisma.unit.update({ where: { id: unitId }, data: { status: 'RESERVED' } });
  await ok(release(order, {}, 'WAREHOUSE', key), 200);
});

test('two release attempts have one winner, while identical-key attempts replay one result', async () => {
  for (const sameKey of [false, true]) {
    const order = await confirmedOrder(); await stock(order); await ok(allocate(order));
    const input = { expectedVersion: await version(order), reason: 'Release this unused reservation' }; const key = randomUUID();
    const results = await Promise.all([send(`/orders/${order.id}/allocations/release`, input, 'WAREHOUSE', key),
      send(`/orders/${order.id}/allocations/release`, input, 'WAREHOUSE', sameKey ? key : randomUUID())]);
    assert.deepEqual(results.map((r) => r.status).sort(), sameKey ? [200, 200] : [200, 409]);
    if (sameKey) assert.deepEqual(await results[0].json(), await results[1].json());
    assert.equal(await version(order), input.expectedVersion + 1);
    assert.ok((await held(order)).every((row) => row.status === 'RELEASED'));
  }
});

test('a late failure rolls back the release audit, free units, job version and command claim', async () => {
  const order = await confirmedOrder(); await stock(order); await ok(allocate(order));
  const before = await held(order); const unitIds = before.flatMap((row) => row.unitId ? [row.unitId] : []);
  const unitsBefore = await prisma.unit.findMany({ where: { id: { in: unitIds } }, orderBy: { id: 'asc' } });
  const input = { expectedVersion: await version(order), reason: 'Release rollback fault injection' }; const key = randomUUID();
  const broken = new AllocationsService(prisma, { run: (command, work) => idempotency.run(command, async (tx) => {
    await work(tx); throw new Error('injected after release effects');
  }) }, ledger, invoices);
  await assert.rejects(broken.releaseOrder(staff.WAREHOUSE.id, key, order.id, input), /injected after release effects/);
  assert.deepEqual(await held(order), before);
  assert.deepEqual(await prisma.unit.findMany({ where: { id: { in: unitIds } }, orderBy: { id: 'asc' } }), unitsBefore);
  assert.equal(await version(order), input.expectedVersion);
  assert.equal(await prisma.command.count({ where: { actorId: staff.WAREHOUSE.id, idempotencyKey: key } }), 0);
  await ok(release(order, input, 'WAREHOUSE', key), 200);
});

test('release racing another order allocation never gives one unit two active owners', async () => {
  const [owner, other] = [await confirmedOrder(), await confirmedOrder()];
  await stock(owner);
  const rows = await ok(allocate(owner)); const unitIds = rows.flatMap((row) => row.unitId ? [row.unitId] : []);
  const productId = rows.map((row) => row.productId).sort()[0];
  await sql.query('BEGIN');
  await sql.query('SELECT id FROM products WHERE id=$1 FOR NO KEY UPDATE', [productId]);
  const pending = Promise.all([release(owner), allocate(other, { unitIds })]);
  try {
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal((await held(owner)).filter((row) => row.status === 'RELEASED').length, 0);
    assert.equal((await held(other)).length, 0);
  } finally { await sql.query('COMMIT'); }
  const [released, allocated] = await pending;
  assert.equal(released.status, 200);
  assert.ok([201, 409].includes(allocated.status));
  assert.ok((await held(owner)).every((row) => row.status === 'RELEASED'));
  for (const unitId of unitIds) {
    const active = await prisma.allocation.findMany({ where: { unitId, status: { not: 'RELEASED' } } });
    assert.equal(active.length, allocated.status === 201 ? 1 : 0);
    if (active.length) assert.equal(active[0].jobId, other.jobId);
  }
});

test('release requires warehouse/admin, a key, a real order and a reason; raw releases need durable evidence', async () => {
  const order = await confirmedOrder(); await stock(order); const rows = await ok(allocate(order));
  for (const role of ['SALES', 'TECHNICIAN']) await refused(release(order, {}, role), 403, 'FORBIDDEN');
  await refused(release(order, {}, 'WAREHOUSE', null), 400, 'INVALID_INPUT');
  await refused(release(order, { reason: ' ' }), 400, 'INVALID_INPUT');
  await refused(release(order, { releasedById: staff.ADMIN.id }), 400, 'INVALID_INPUT');
  await refused(send(`/orders/${randomUUID()}/allocations/release`, { expectedVersion: 1, reason: 'Unknown source order' }), 404, 'NOT_FOUND');
  await assert.rejects(sql.query(`UPDATE allocations SET status='RELEASED' WHERE id=$1`, [rows[0].id]), /needs actor, time and reason/);
  await assert.rejects(sql.query(`UPDATE allocations SET status='RELEASED',"releasedAt"=now(),"releasedById"=$2,"releaseReason"='bad' WHERE id=$1`,
    [rows[0].id, staff.WAREHOUSE.id]), /allocations_release_evidence_valid/);
  await assert.rejects(sql.query(`UPDATE allocations SET status='RELEASED',"releasedAt"="createdAt"-interval '1 second',"releasedById"=$2,"releaseReason"='Backdated invalid audit' WHERE id=$1`,
    [rows[0].id, staff.WAREHOUSE.id]), /allocations_release_evidence_valid/);
  await assert.rejects(sql.query(`UPDATE allocations SET status='RELEASED',"releasedAt"=now(),"releasedById"=$2,"releaseReason"='Unknown release actor' WHERE id=$1`,
    [rows[0].id, randomUUID()]), /allocations_releasedById_fkey/);
  await assert.rejects(sql.query(`UPDATE allocations SET "releasedAt"=now(),"releasedById"=$2,"releaseReason"='Premature evidence' WHERE id=$1`, [rows[0].id, staff.WAREHOUSE.id]), /recorded only when releasing/);
  await ok(release(order), 200);
  await assert.rejects(sql.query(`UPDATE allocations SET "releaseReason"='Rewritten history' WHERE id=$1`, [rows[0].id]), /identity cannot change/);
});

test('dispatch draft requires a paid complete reservation and creates one header on retry', async () => {
  const unpaid = await confirmedOrder({ paid: false });
  await refused(dispatchDraft(unpaid), 409, 'DISPATCH_NOT_READY');
  const order = await confirmedOrder(); await stock(order); await ok(allocate(order));
  await refused(send(`/orders/${order.id}/dispatches`, { expectedVersion: (await version(order)) + 1 }), 409, 'STALE_VERSION');
  const input = { expectedVersion: await version(order) }; const key = randomUUID();
  const draft = await ok(send(`/orders/${order.id}/dispatches`, input, 'WAREHOUSE', key));
  assert.equal(draft.status, 'DRAFT'); assert.equal(draft.dispatchedAt, null); assert.equal(draft.scanReadiness.complete, false);
  assert.deepEqual(await ok(send(`/orders/${order.id}/dispatches`, input, 'WAREHOUSE', key)), draft);
  assert.equal((await ok(dispatchDraft(order))).id, draft.id);
  assert.equal(await prisma.dispatch.count({ where: { orderId: order.id } }), 1);
});

test('typed values remain evidence but only camera/scanner methods satisfy current reserved serials', async () => {
  const { order, draft, units } = await preparedDispatch();
  const beforeRows = await held(order); const beforeMoves = await prisma.stockMovement.count();
  const unitsBefore = await prisma.unit.findMany({ where: { id: { in: units.map((u) => u.id) } }, orderBy: { id: 'asc' } });
  for (const unit of units) await ok(scan(draft, unit, 'TYPED'));
  const typed = await ok(get(`/dispatches/${draft.id}`), 200);
  assert.ok(typed.scans.every((row) => !row.countsForDispatch)); assert.equal(typed.scanReadiness.complete, false);
  assert.equal(typed.scanReadiness.missingUnitIds.length, units.length);
  let completed;
  for (const [index, unit] of units.entries()) {
    completed = await ok(send(`/dispatches/${draft.id}/scans`, { rawValue: ` ${unit.normalizedSerial.toLowerCase()} `, method: index % 2 ? 'CAMERA' : 'SCANNER', unitId: unit.id.toUpperCase() }));
  }
  assert.equal(completed.scanReadiness.complete, true); assert.deepEqual(completed.scanReadiness.missingUnitIds, []);
  assert.equal(completed.status, 'DRAFT'); assert.equal(completed.dispatchedAt, null);
  assert.ok(completed.scans.some((row) => row.rawValue.startsWith(' ') && row.actorId === staff.WAREHOUSE.id));
  assert.deepEqual(await held(order), beforeRows);
  assert.deepEqual(await prisma.unit.findMany({ where: { id: { in: units.map((u) => u.id) } }, orderBy: { id: 'asc' } }), unitsBefore);
  assert.equal(await prisma.stockMovement.count(), beforeMoves);
  await refused(send(`/dispatches/${draft.id}/dispatch`, { expectedVersion: completed.version }), 404, 'NOT_FOUND');
  assert.deepEqual(await ok(get(`/dispatches/${draft.id}`), 200), completed);
});

test('unknown, wrong-order and already-installed units cannot satisfy a scan', async () => {
  const [one, two] = [await preparedDispatch(), await preparedDispatch()];
  const before = await prisma.dispatchScan.count(); const v = one.draft.version;
  await refused(send(`/dispatches/${one.draft.id}/scans`, { rawValue: 'UNKNOWN', method: 'SCANNER' }), 409, 'SCAN_NOT_ALLOCATED');
  await refused(scan(one.draft, two.units[0]), 409, 'SCAN_NOT_ALLOCATED');
  await prisma.unit.update({ where: { id: one.units[0].id }, data: { status: 'INSTALLED' } });
  try { await refused(scan(one.draft, one.units[0]), 409, 'DISPATCH_NOT_READY'); }
  finally { await prisma.unit.update({ where: { id: one.units[0].id }, data: { status: 'RESERVED' } }); }
  assert.equal(await prisma.dispatchScan.count(), before);
  assert.equal((await ok(get(`/dispatches/${one.draft.id}`), 200)).version, v);
});

test('same serial across reserved products requires a unit UUID to disambiguate', async () => {
  const order = await confirmedOrder(); const sharedSerial = 'SHARED-' + randomUUID(); const selected = [];
  for (const product of await productsOf(order)) {
    const needed = order.packing.filter((line) => line.productId === product.id).reduce((sum, line) => sum + Number(line.quantity), 0);
    if (product.trackingMode === 'SERIALIZED') {
      const serials = Array.from({ length: needed }, (_, index) => index ? 'UNIQUE-' + randomUUID() : sharedSerial);
      selected.push(...(await receive(product.id, needed, serials)).lines[0].unitIds);
    } else await receive(product.id, needed);
  }
  await ok(allocate(order, { unitIds: selected })); const draft = await ok(dispatchDraft(order));
  await refused(send(`/dispatches/${draft.id}/scans`, { rawValue: sharedSerial, method: 'SCANNER' }), 409, 'SCAN_AMBIGUOUS');
  const matching = await prisma.unit.findFirstOrThrow({ where: { id: { in: selected }, normalizedSerial: sharedSerial.toUpperCase() } });
  const result = await ok(scan(draft, matching));
  assert.equal(result.scans.length, 1); assert.equal(result.scans[0].unitId, matching.id);
});

test('released scan evidence cannot be reused when the same physical unit is reallocated', async () => {
  const { order, draft, units } = await preparedDispatch();
  for (const unit of units) await ok(scan(draft, unit));
  assert.equal((await ok(get(`/dispatches/${draft.id}`), 200)).scanReadiness.complete, true);
  await ok(release(order), 200);
  const freed = await ok(get(`/dispatches/${draft.id}`), 200);
  assert.equal(freed.scanReadiness.reservationValid, false); assert.equal(freed.scanReadiness.complete, false);
  assert.ok(freed.scans.every((row) => !row.countsForDispatch));
  await ok(allocate(order, { unitIds: units.map((u) => u.id) }));
  const again = await ok(dispatchDraft(order)); assert.equal(again.id, draft.id);
  assert.equal(again.scanReadiness.complete, false); assert.equal(again.scanReadiness.missingUnitIds.length, units.length);
  for (const unit of units) await ok(scan(draft, unit));
  const rescanned = await ok(get(`/dispatches/${draft.id}`), 200);
  assert.equal(rescanned.scans.length, units.length * 2); assert.equal(rescanned.scanReadiness.complete, true);
});

test('complete serial scans stay blocked while a physical count is below reserved bulk stock', async () => {
  const { order, draft, units, allocations } = await preparedDispatch();
  for (const unit of units) await ok(scan(draft, unit));
  const bulk = allocations.find((row) => !row.unitId);
  const counted = await ok(send('/stock/counts', { reference: 'SCAN-COUNT-' + randomUUID(), locationId: main.id,
    lines: [{ productId: bulk.productId, countedQuantity: '0' }] }));
  await ok(send(`/stock/documents/${counted.id}/validate`, { expectedVersion: counted.version }), 200);
  const missingStock = await ok(get(`/dispatches/${draft.id}`), 200);
  try {
    assert.deepEqual(missingStock.scanReadiness.missingUnitIds, []);
    assert.equal(missingStock.scanReadiness.reservationValid, false);
    assert.equal(missingStock.scanReadiness.complete, false);
  } finally { await receive(bulk.productId, (await reserved(bulk.productId)).toFixed(3)); }
  assert.equal((await ok(get(`/dispatches/${draft.id}`), 200)).scanReadiness.complete, true);
});

test('concurrent scan retries record once and different keys reject duplicate method input', async () => {
  for (const sameKey of [true, false]) {
    const { draft, units } = await preparedDispatch(); const key = randomUUID();
    const results = await Promise.all([scan(draft, units[0], 'SCANNER', key), scan(draft, units[0], 'SCANNER', sameKey ? key : randomUUID())]);
    assert.deepEqual(results.map((r) => r.status).sort(), sameKey ? [201, 201] : [201, 409]);
    if (sameKey) assert.deepEqual(await results[0].json(), await results[1].json());
    const saved = await ok(get(`/dispatches/${draft.id}`), 200);
    assert.equal(saved.scans.length, 1); assert.equal(saved.version, draft.version + 1);
  }
});

test('late scan failure rolls back evidence, version and key claim and permits same-key retry', async () => {
  const { draft, units } = await preparedDispatch(); const key = randomUUID();
  const input = { rawValue: units[0].rawSerial, method: 'CAMERA', unitId: units[0].id };
  const broken = new DispatchScansService(prisma, { run: (command, work) => idempotency.run(command, async (tx) => {
    await work(tx); throw new Error('scan failure after effects');
  }) }, ledger, invoices);
  await assert.rejects(broken.record(staff.WAREHOUSE.id, key, draft.id, input), /scan failure after effects/);
  const after = await ok(get(`/dispatches/${draft.id}`), 200);
  assert.deepEqual(after, draft); assert.equal(await prisma.command.count({ where: { actorId: staff.WAREHOUSE.id, idempotencyKey: key } }), 0);
  assert.equal((await ok(send(`/dispatches/${draft.id}/scans`, input, 'WAREHOUSE', key))).scans.length, 1);
});

test('a scan transaction started before reallocation records its acceptance time after the new source exists', async () => {
  const { order, draft, units } = await preparedDispatch();
  await ok(release(order), 200);
  let entered, resume;
  const waiting = new Promise((resolve) => { entered = resolve; });
  const gate = new Promise((resolve) => { resume = resolve; });
  const paused = new DispatchScansService(prisma, { run: (command, work) => idempotency.run(command, async (tx) => {
    entered(); await gate; return work(tx);
  }) }, ledger, invoices);
  const pending = paused.record(staff.WAREHOUSE.id, randomUUID(), draft.id,
    { rawValue: units[0].rawSerial, method: 'SCANNER', unitId: units[0].id }).then((value) => ({ value }), (error) => ({ error }));
  await waiting;
  try {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await ok(allocate(order, { unitIds: units.map((u) => u.id) }));
  } finally { resume(); }
  const result = await pending;
  assert.ifError(result.error);
  const scan = await prisma.dispatchScan.findUniqueOrThrow({ where: { id: result.value.data.scans[0].id }, include: { allocation: true } });
  assert.ok(scan.recordedAt >= scan.allocation.createdAt);
});

test('scans racing a reservation release leave no usable evidence for the released allocation', async () => {
  const { order, draft, units } = await preparedDispatch();
  await sql.query('BEGIN'); await sql.query('SELECT id FROM jobs WHERE id=$1 FOR NO KEY UPDATE', [order.jobId]);
  const pending = Promise.all([scan(draft, units[0]), release(order)]);
  try { await new Promise((resolve) => setTimeout(resolve, 250)); }
  finally { await sql.query('COMMIT'); }
  const [scanned, released] = await pending;
  assert.ok([201, 409].includes(scanned.status)); assert.equal(released.status, 200);
  const after = await ok(get(`/dispatches/${draft.id}`), 200);
  assert.equal(after.scanReadiness.complete, false); assert.ok(after.scans.every((row) => !row.countsForDispatch));
});

test('scan routes enforce authorization and immutable source-bound evidence in PostgreSQL', async () => {
  const one = await preparedDispatch(); const two = await preparedDispatch();
  const route = `/dispatches/${one.draft.id}/scans`;
  for (const role of ['SALES', 'TECHNICIAN']) {
    await refused(send(route, { rawValue: one.units[0].rawSerial, method: 'SCANNER' }, role), 403, 'FORBIDDEN');
    await refused(get(`/dispatches/${one.draft.id}`, role), 403, 'FORBIDDEN');
  }
  await refused(send(route, { rawValue: one.units[0].rawSerial, method: 'SCANNER' }, 'WAREHOUSE', null), 400, 'INVALID_INPUT');
  await refused(send(route, { rawValue: one.units[0].rawSerial, method: 'SCANNER', actorId: staff.ADMIN.id }), 400, 'INVALID_INPUT');
  await refused(get(`/dispatches/${randomUUID()}`), 404, 'NOT_FOUND');
  const insert = (dispatchId, row, normalized) => sql.query(`INSERT INTO dispatch_scans
    (id,"dispatchId","allocationId","rawValue","normalizedSerial",method,"actorId") VALUES(gen_random_uuid(),$1,$2,'raw',$3,'CAMERA',$4)`,
  [dispatchId, row.id, normalized, staff.WAREHOUSE.id]);
  const other = two.allocations.find((row) => row.unitId === two.units[0].id);
  await assert.rejects(insert(one.draft.id, other, two.units[0].normalizedSerial), /must match its reserved equipment and order/);
  const own = one.allocations.find((row) => row.unitId === one.units[0].id);
  await assert.rejects(insert(one.draft.id, own, 'WRONG'), /must match its reserved equipment and order/);
  const scanned = await ok(scan(one.draft, one.units[0])); const scanId = scanned.scans[0].id;
  await assert.rejects(sql.query('UPDATE dispatch_scans SET "rawValue"=\'changed\' WHERE id=$1', [scanId]), /append-only/);
  await assert.rejects(sql.query('DELETE FROM dispatch_scans WHERE id=$1', [scanId]), /append-only/);
  await assert.rejects(sql.query('TRUNCATE dispatch_scans'), /append-only/);
  await assert.rejects(sql.query('UPDATE dispatches SET "orderId"=$1,version=version+1 WHERE id=$2', [two.order.id, one.draft.id]), /identity is fixed/);
});
