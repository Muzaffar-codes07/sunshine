// Explicit disposable test database only; never load the application .env.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('TEST_DATABASE_URL must name a disposable test database');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'inventory-tests-only-session-secret';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
process.env.SESSION_COOKIE_SECURE = 'false';
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
const { PrismaService } = require('../dist/platform/prisma.service');
const { StockLedgerService } = require('../dist/inventory/stock-ledger.service');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { hashPassword } = require('../dist/auth/passwords');
const { Prisma } = require('../dist/generated/prisma/client');
const { Client } = require('pg');

const origin = 'http://127.0.0.1:3001';
const password = 'inventory-test-password-2026';
const cookies = {}; const staff = {};
let app, prisma, ledger, base, sql, main, quarantine, serialized, bulk, service;

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1'); base = (await app.getUrl()) + '/api/v1';
  prisma = app.get(PrismaService); ledger = app.get(StockLedgerService);
  await seedCatalogue(prisma);
  sql = new Client({ connectionString: testUrl }); await sql.connect();
  for (const role of ['WAREHOUSE', 'SALES', 'ADMIN']) {
    const account = await prisma.user.create({ data: { email: randomUUID() + '@test.local', displayName: role + ' inventory tester', role, passwordHash: await hashPassword(password) } });
    staff[role] = account.id;
    const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email: account.email, password }) });
    assert.equal(response.status, 200); cookies[role] = response.headers.get('set-cookie').split(';')[0];
  }
  main = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'MAIN' } });
  quarantine = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'QUARANTINE' } });
  serialized = await prisma.product.findFirstOrThrow({ where: { trackingMode: 'SERIALIZED', active: true } });
  bulk = await prisma.product.findFirstOrThrow({ where: { trackingMode: 'BULK', active: true } });
  service = await prisma.product.findFirstOrThrow({ where: { kind: 'SERVICE' } });
});
after(async () => { await sql?.end(); await app?.close(); });

const reference = () => 'REC-' + randomUUID();
const serial = () => 'SN-' + randomUUID().slice(0, 13).toUpperCase();
const post = (body, role = 'WAREHOUSE', key = randomUUID()) => fetch(base + '/stock/receipts', {
  method: 'POST', headers: { 'content-type': 'application/json', origin, ...(key ? { 'idempotency-key': key } : {}), ...(role ? { cookie: cookies[role] } : {}) }, body: JSON.stringify(body),
});
const get = (route, role = 'WAREHOUSE') => fetch(base + route, { headers: role ? { cookie: cookies[role] } : {} });
const receipt = (lines, extra = {}) => ({ reference: reference(), locationId: main.id, receivedAt: '2026-10-30T10:00:00.000Z', lines, ...extra });
const serializedLine = (serials, unitCost = '25000.00') => ({ productId: serialized.id, quantity: String(serials.length), unitCost, serials });
const bulkLine = (quantity, unitCost) => ({ productId: bulk.id, quantity, unitCost });
const onHand = async (productId, locationId = main.id) => (await prisma.$transaction((tx) => ledger.onHand(tx, productId, locationId))).toFixed(3);
const counts = async () => ({
  documents: await prisma.stockDocument.count(), lines: await prisma.stockDocumentLine.count(), movements: await prisma.stockMovement.count(),
  units: await prisma.unit.count(), links: await prisma.unitMovement.count(), bases: await prisma.productCostBasis.count(),
});
const expectError = async (response, status, code) => {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); assert.equal(body.error.code, code); return body.error;
};
const draftLine = async (tx, kind, productId, quantity, locations) => {
  const occurredAt = new Date();
  const document = await tx.stockDocument.create({ data: { kind, reference: 'TEST-' + randomUUID(), payloadHash: 'test', actorId: staff.WAREHOUSE, occurredAt, ...locations } });
  return { ...await tx.stockDocumentLine.create({ data: { documentId: document.id, lineNumber: 1, productId, quantity } }), occurredAt };
};
// Posts a movement the way later slices will: through a document line and the single writer.
const postMovement = (kind, productId, quantity, locations) => prisma.$transaction(async (tx) => {
  const line = await draftLine(tx, kind, productId, quantity, locations);
  await tx.stockDocument.update({ where: { id: line.documentId }, data: { status: 'DONE', validatedAt: new Date() } });
  return ledger.post(tx, { documentLineId: line.id, productId, quantity: new Prisma.Decimal(quantity), actorId: staff.WAREHOUSE, occurredAt: line.occurredAt, ...locations });
});

test('one usable and one quarantine location exist, and staff can read them', async () => {
  const response = await get('/stock/locations');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.map((row) => [row.code, row.kind]), [['MAIN', 'USABLE'], ['QUARANTINE', 'QUARANTINE']]);
});

test('a serialized receipt creates units with exact cost, and on-hand survives a fresh read', async () => {
  const before = await onHand(serialized.id);
  const [first, second] = [serial(), serial()];
  const response = await post(receipt([serializedLine([` ${first.toLowerCase()} `, second])]));
  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.equal(data.status, 'DONE'); assert.equal(data.actorId, staff.WAREHOUSE);
  assert.equal(data.lines[0].quantity, '2.000'); assert.equal(data.lines[0].unitIds.length, 2);
  assert.equal(await onHand(serialized.id), new Prisma.Decimal(before).plus(2).toFixed(3));
  const lookup = await (await get('/units?serial=' + encodeURIComponent(first.toLowerCase()))).json();
  assert.equal(lookup.data.length, 1);
  assert.equal(lookup.data[0].normalizedSerial, first); assert.equal(lookup.data[0].serial, ` ${first.toLowerCase()} `);
  assert.equal(lookup.data[0].locationId, main.id); assert.equal(lookup.data[0].status, 'AVAILABLE');
  assert.equal((await prisma.unit.findUniqueOrThrow({ where: { id: lookup.data[0].id } })).acquisitionCost.toFixed(2), '25000.00');
  const levels = await (await get(`/stock?productId=${serialized.id}&locationId=${main.id}`)).json();
  assert.equal(levels.data.total, 1); assert.equal(levels.data.items[0].sku, serialized.sku);
  assert.equal(levels.data.items[0].onHand, await onHand(serialized.id)); assert.equal(levels.data.items[0].locationKind, 'USABLE');
});

test('bulk receipts keep a moving average with exact decimals, in posting order, and backdating does not rewrite it', async () => {
  const product = await prisma.product.findFirstOrThrow({ where: { trackingMode: 'BULK', active: true, NOT: { id: bulk.id } } });
  assert.equal((await post(receipt([{ productId: product.id, quantity: '10.000', unitCost: '100.00' }]))).status, 201);
  assert.equal((await prisma.productCostBasis.findUniqueOrThrow({ where: { productId: product.id } })).averageCost.toFixed(6), '100.000000');
  assert.equal((await post(receipt([{ productId: product.id, quantity: '20.500', unitCost: '133.33' }], { receivedAt: '2020-01-01T00:00:00.000Z' }))).status, 201);
  const average = (await prisma.productCostBasis.findUniqueOrThrow({ where: { productId: product.id } })).averageCost.toFixed(6);
  assert.equal(average, '122.402131'); // (10 × 100 + 20.5 × 133.33) / 30.5 = 3733.265 / 30.5, rounded only at six places.
  assert.equal(await onHand(product.id), '30.500');
  const stored = await sql.query(`SELECT quantity::text FROM stock_on_hand WHERE "productId"=$1 AND "locationId"=$2`, [product.id, main.id]);
  assert.equal(Number(stored.rows[0].quantity), 30.5);
});

test('quarantined stock is separate from usable stock and does not affect the average', async () => {
  const product = await prisma.product.findFirstOrThrow({ where: { trackingMode: 'BULK', active: true, id: { notIn: [bulk.id] }, costBasis: null } });
  assert.equal((await post(receipt([{ productId: product.id, quantity: '10', unitCost: '100.00' }]))).status, 201);
  await postMovement('TRANSFER', product.id, '4', { fromLocationId: main.id, toLocationId: quarantine.id });
  assert.equal(await onHand(product.id), '6.000'); assert.equal(await onHand(product.id, quarantine.id), '4.000');
  assert.equal((await post(receipt([{ productId: product.id, quantity: '6', unitCost: '200.00' }]))).status, 201);
  assert.equal((await prisma.productCostBasis.findUniqueOrThrow({ where: { productId: product.id } })).averageCost.toFixed(6), '150.000000');
  const levels = await (await get(`/stock?productId=${product.id}`)).json();
  assert.deepEqual(levels.data.items.map((row) => [row.locationCode, row.locationKind, row.onHand]), [['MAIN', 'USABLE', '12.000'], ['QUARANTINE', 'QUARANTINE', '4.000']]);
});

test('an identical retry replays the saved receipt; the same reference with other goods is refused', async () => {
  const body = receipt([bulkLine('5.000', '40.00')]);
  const first = await (await post(body)).json();
  const before = await counts();
  const held = await onHand(bulk.id);
  const retry = await post(body);
  assert.equal(retry.status, 201); assert.deepEqual(await retry.json(), first);
  assert.deepEqual(await counts(), before); assert.equal(await onHand(bulk.id), held);
  const error = await expectError(await post({ ...body, lines: [bulkLine('6.000', '40.00')] }), 409, 'IDEMPOTENCY_CONFLICT');
  assert.equal(error.reasons[0].source, 'INVENTORY');
  assert.deepEqual(await counts(), before);
});

test('the Idempotency-Key is required, replays the saved response, and refuses a different request', async () => {
  const body = receipt([bulkLine('2.000', '40.00')]);
  await expectError(await post(body, 'WAREHOUSE', null), 400, 'INVALID_INPUT');
  const key = randomUUID();
  const first = await (await post(body, 'WAREHOUSE', key)).json();
  const before = await counts();
  const held = await onHand(bulk.id);
  const retry = await post(body, 'WAREHOUSE', key);
  assert.equal(retry.status, 201); assert.deepEqual(await retry.json(), first);
  const error = await expectError(await post(receipt([bulkLine('2.000', '40.00')]), 'WAREHOUSE', key), 409, 'IDEMPOTENCY_CONFLICT');
  assert.equal(error.reasons[0].source, 'PLATFORM');
  assert.deepEqual(await counts(), before); assert.equal(await onHand(bulk.id), held);
  // A failed attempt doesn't burn the key: the same key can run again once the problem is fixed.
  const retryKey = randomUUID();
  const reference = receipt([bulkLine('1.000', '40.00'), { productId: service.id, quantity: '1', unitCost: '10.00' }]);
  await expectError(await post(reference, 'WAREHOUSE', retryKey), 409, 'NOT_RECEIVABLE');
  assert.equal(await prisma.command.count({ where: { idempotencyKey: retryKey } }), 0);
  assert.equal((await post({ ...reference, lines: [reference.lines[0]] }, 'WAREHOUSE', retryKey)).status, 201);
});

test('concurrent requests with one key post once',  async () => {
  const body = receipt([bulkLine('3.000', '40.00')]);
  const key = randomUUID();
  const held = new Prisma.Decimal(await onHand(bulk.id));
  const responses = await Promise.all([post(body, 'WAREHOUSE', key), post(body, 'WAREHOUSE', key), post(body, 'WAREHOUSE', key)]);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.deepEqual(responses.map((response) => response.status), [201, 201, 201]);
  assert.equal(new Set(bodies.map((row) => row.data.id)).size, 1);
  assert.equal(await onHand(bulk.id), held.plus(3).toFixed(3));
});

test('concurrent identical requests post once', async () => {
  const body = receipt([bulkLine('3.000', '40.00')]);
  const held = new Prisma.Decimal(await onHand(bulk.id));
  const responses = await Promise.all([post(body), post(body), post(body)]);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.deepEqual(responses.map((response) => response.status), [201, 201, 201]);
  assert.equal(new Set(bodies.map((row) => row.data.id)).size, 1);
  assert.equal(await onHand(bulk.id), held.plus(3).toFixed(3));
});

test('a failure on any line leaves no header, line, unit, movement or cost change', async () => {
  const before = await counts();
  const held = await onHand(bulk.id);
  const basis = await prisma.productCostBasis.findUnique({ where: { productId: bulk.id } });
  await expectError(await post(receipt([bulkLine('5.000', '999.00'), serializedLine([serial()]), { productId: service.id, quantity: '1', unitCost: '10.00' }])), 409, 'NOT_RECEIVABLE');
  assert.deepEqual(await counts(), before); assert.equal(await onHand(bulk.id), held);
  assert.deepEqual(await prisma.productCostBasis.findUnique({ where: { productId: bulk.id } }), basis);
});

test('invalid receipts are refused with a reason', async () => {
  const before = await counts();
  await expectError(await post(receipt([bulkLine('1', '10.00')], { receivedAt: new Date(Date.now() + 3600_000).toISOString() })), 400, 'INVALID_INPUT');
  await expectError(await post(receipt([bulkLine('1', '0.00')])), 400, 'INVALID_INPUT');
  await expectError(await post(receipt([{ productId: serialized.id, quantity: '1', unitCost: '10.00' }])), 409, 'NOT_RECEIVABLE');
  await expectError(await post(receipt([{ ...bulkLine('1', '10.00'), serials: [serial()] }])), 409, 'NOT_RECEIVABLE');
  await expectError(await post(receipt([bulkLine('1', '10.00')], { locationId: quarantine.id })), 409, 'NOT_RECEIVABLE');
  await expectError(await post(receipt([bulkLine('1', '10.00')], { locationId: randomUUID() })), 409, 'NOT_RECEIVABLE');
  await expectError(await post(receipt([{ productId: randomUUID(), quantity: '1', unitCost: '10.00' }])), 409, 'NOT_RECEIVABLE');
  await expectError(await post({ ...receipt([bulkLine('1', '10.00')]), actorId: staff.ADMIN }), 400, 'INVALID_INPUT');
  await prisma.product.update({ where: { id: bulk.id }, data: { active: false } });
  try { await expectError(await post(receipt([bulkLine('1', '10.00')])), 409, 'NOT_RECEIVABLE'); }
  finally { await prisma.product.update({ where: { id: bulk.id }, data: { active: true } }); }
  assert.deepEqual(await counts(), before);
});

test('a documented zero cost is accepted', async () => {
  const response = await post(receipt([{ ...bulkLine('1.000', '0'), zeroCostReason: 'Supplier replacement at no charge' }]));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.lines[0].zeroCostReason, 'Supplier replacement at no charge');
});

test('a duplicate serial is refused, including between concurrent receipts, with one winner', async () => {
  const taken = serial();
  assert.equal((await post(receipt([serializedLine([taken])]))).status, 201);
  const before = await counts();
  await expectError(await post(receipt([serializedLine([taken.toLowerCase()])])), 409, 'SERIAL_ALREADY_RECEIVED');
  assert.deepEqual(await counts(), before);
  const contested = serial();
  const responses = await Promise.all([1, 2, 3, 4].map(() => post(receipt([serializedLine([contested])]))));
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409, 409, 409]);
  assert.equal(await prisma.unit.count({ where: { normalizedSerial: contested } }), 1);
});

test('stock can never go negative, and two movements racing for the last stock have one winner', async () => {
  const product = await prisma.product.findFirstOrThrow({ where: { trackingMode: 'BULK', active: true, costBasis: null } });
  assert.equal((await post(receipt([{ productId: product.id, quantity: '5', unitCost: '10.00' }]))).status, 201);
  await assert.rejects(postMovement('ISSUE', product.id, '5.001', { fromLocationId: main.id }), (error) => error.code === 'INSUFFICIENT_STOCK');
  const results = await Promise.allSettled([1, 2].map(() => postMovement('ISSUE', product.id, '3', { fromLocationId: main.id })));
  assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'INSUFFICIENT_STOCK');
  assert.equal(await onHand(product.id), '2.000');
});

test('serial counts per location match the derived view', async () => {
  const { rows } = await sql.query(`
    SELECT s."productId", s."locationId", s.quantity, COUNT(u."unitId") AS units
    FROM stock_on_hand s JOIN products p ON p.id = s."productId"
    LEFT JOIN unit_locations u ON u."locationId" = s."locationId"
      AND u."unitId" IN (SELECT id FROM units WHERE "productId" = s."productId")
    WHERE p."trackingMode" = 'SERIALIZED'
    GROUP BY s."productId", s."locationId", s.quantity`);
  assert.ok(rows.length > 0);
  for (const row of rows) assert.equal(Number(row.quantity), Number(row.units), row.productId);
});

test('the database refuses edits to the ledger and malformed movements', async () => {
  const movement = await prisma.stockMovement.findFirstOrThrow();
  const link = await prisma.unitMovement.findFirstOrThrow();
  const refused = async (statement, params, pattern) => assert.rejects(sql.query(statement, params), pattern);
  await refused('UPDATE stock_movements SET quantity = 1 WHERE id = $1', [movement.id], /append-only/);
  await refused('DELETE FROM stock_movements WHERE id = $1', [movement.id], /append-only/);
  await refused('TRUNCATE stock_movements CASCADE', [], /append-only/);
  await refused('DELETE FROM unit_movements WHERE id = $1', [link.id], /append-only/);
  await refused('TRUNCATE unit_movements', [], /append-only/);
});

test('CHECK constraints refuse malformed movements even if the source trigger is bypassed', async () => {
  const line = (await prisma.stockDocumentLine.findFirstOrThrow({ where: { document: { status: 'DONE' } } }));
  const insert = (quantity, from, to) => sql.query(`INSERT INTO stock_movements (id, "documentLineId", "productId", "fromLocationId", "toLocationId", quantity, "actorId", "occurredAt")
    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now())`, [line.id, bulk.id, from, to, quantity, staff.ADMIN]);
  await sql.query('BEGIN');
  try {
    await sql.query('ALTER TABLE stock_movements DISABLE TRIGGER stock_movements_source_valid');
    for (const [quantity, from, to, rule] of [
      ['0', main.id, null, /stock_movements_quantity_positive/], ['-1', main.id, null, /stock_movements_quantity_positive/],
      ['NaN', main.id, null, /stock_movements_quantity_positive/], ['1', null, null, /stock_movements_has_location/],
      ['1', main.id, main.id, /stock_movements_locations_differ/],
    ]) {
      await sql.query('SAVEPOINT attempt');
      await assert.rejects(insert(quantity, from, to), rule);
      await sql.query('ROLLBACK TO SAVEPOINT attempt');
    }
  } finally { await sql.query('ROLLBACK'); }
});

test('a validated document, its lines and a unit identity are frozen, and a replay stays the same', async () => {
  const taken = serial();
  const body = receipt([serializedLine([taken], '1000.00')]);
  const { data } = await (await post(body)).json();
  const lineId = data.lines[0].id;
  const refused = (statement, params) => assert.rejects(sql.query(statement, params), /closed stock document|identity and cost/);
  await refused(`UPDATE stock_documents SET status = 'CANCELED' WHERE id = $1`, [data.id]);
  await refused('DELETE FROM stock_documents WHERE id = $1', [data.id]);
  await refused('UPDATE stock_document_lines SET "unitCost" = 2000 WHERE id = $1', [lineId]);
  await refused('UPDATE stock_document_lines SET quantity = 2 WHERE id = $1', [lineId]);
  await refused('DELETE FROM stock_document_lines WHERE id = $1', [lineId]);
  await refused(`INSERT INTO stock_document_lines (id, "documentId", "lineNumber", "productId", quantity) VALUES (gen_random_uuid(), $1, 2, $2, 1)`, [data.id, bulk.id]);
  const [unitId] = data.lines[0].unitIds;
  await refused('UPDATE units SET "acquisitionCost" = 1 WHERE id = $1', [unitId]);
  await refused(`UPDATE units SET "normalizedSerial" = 'OTHER' WHERE id = $1`, [unitId]);
  await refused('DELETE FROM units WHERE id = $1', [unitId]);
  const moved = await prisma.unit.update({ where: { id: unitId }, data: { status: 'RESERVED', version: { increment: 1 } } });
  assert.equal(moved.status, 'RESERVED');
  await prisma.unit.update({ where: { id: unitId }, data: { status: 'AVAILABLE', version: { increment: 1 } } });
  assert.deepEqual((await (await post(body)).json()).data, data);
});

test('the ledger refuses a movement that does not match its validated document line', async () => {
  const before = await prisma.stockMovement.count();
  const posting = (mutate, finish = true) => prisma.$transaction(async (tx) => {
    const line = await draftLine(tx, 'ISSUE', bulk.id, '1', { fromLocationId: main.id });
    if (finish) await tx.stockDocument.update({ where: { id: line.documentId }, data: { status: 'DONE', validatedAt: new Date() } });
    await ledger.post(tx, { documentLineId: line.id, productId: bulk.id, quantity: new Prisma.Decimal('1'), actorId: staff.WAREHOUSE, occurredAt: line.occurredAt, fromLocationId: main.id, ...mutate });
  });
  assert.equal((await post(receipt([bulkLine('5.000', '40.00')]))).status, 201);
  const start = await prisma.stockMovement.count();
  const refused = (promise, pattern) => assert.rejects(promise, (error) => pattern.test(error.meta?.driverAdapterError?.cause?.originalMessage ?? error.message));
  await refused(posting({}, false), /validated document/);
  await refused(posting({ productId: serialized.id }), /must match/);
  await refused(posting({ quantity: new Prisma.Decimal('2') }), /must match/);
  await refused(posting({ actorId: staff.ADMIN }), /must match/);
  await refused(posting({ fromLocationId: quarantine.id }), /must match|Only/);
  await refused(posting({ occurredAt: new Date(0) }), /must match/);
  assert.equal(await prisma.stockMovement.count(), start); assert.ok(start > before);
  await posting({});
  assert.equal(await prisma.stockMovement.count(), start + 1);
});

test('a line change and validation cannot race, in either order', async () => {
  const other = new Client({ connectionString: testUrl }); await other.connect();
  const draft = () => prisma.$transaction((tx) => draftLine(tx, 'ISSUE', bulk.id, '1', { fromLocationId: main.id }));
  const validate = (client, line) => client.query(`UPDATE stock_documents SET status = 'DONE', "validatedAt" = now() WHERE id = $1`, [line.documentId]);
  const edit = (client, line) => client.query('UPDATE stock_document_lines SET quantity = 2 WHERE id = $1', [line.id]);
  const isBlocked = (promise) => Promise.race([promise.then(() => false, () => false), new Promise((done) => setTimeout(() => done(true), 300))]);
  try {
    // The edit holds the document: validation waits, then the stale quantity can't post.
    const first = await draft();
    await sql.query('BEGIN'); await edit(sql, first);
    await other.query('BEGIN');
    const validating = validate(other, first);
    assert.equal(await isBlocked(validating), true, 'validation should wait for the open line edit');
    await sql.query('COMMIT'); await validating;
    await assert.rejects(other.query(`INSERT INTO stock_movements (id, "documentLineId", "productId", "fromLocationId", quantity, "actorId", "occurredAt")
      VALUES (gen_random_uuid(), $1, $2, $3, 1, $4, $5)`, [first.id, bulk.id, main.id, staff.WAREHOUSE, first.occurredAt]), /must match/);
    await other.query('ROLLBACK');
    // Validation holds the document: the edit waits, then is refused and the line keeps its value.
    const second = await draft();
    await other.query('BEGIN'); await validate(other, second);
    await sql.query('BEGIN');
    const editing = edit(sql, second);
    const refused = assert.rejects(editing, /closed stock document/);
    assert.equal(await isBlocked(editing), true, 'the line edit should wait for validation');
    await other.query('COMMIT'); await refused; await sql.query('ROLLBACK');
    assert.equal((await prisma.stockDocumentLine.findUniqueOrThrow({ where: { id: second.id } })).quantity.toFixed(3), '1.000');
  } finally {
    await sql.query('ROLLBACK').catch(() => {}); await other.query('ROLLBACK').catch(() => {}); await other.end();
  }
});

test('documents start as drafts, need lines to validate, and stay closed once cancelled', async () => {
  const insert = (status, validated) => sql.query(`INSERT INTO stock_documents (id, kind, reference, status, "payloadHash", "actorId", "occurredAt", "validatedAt", "fromLocationId")
    VALUES (gen_random_uuid(), 'ISSUE', $1, $2, 'test', $3, now(), $4, $5) RETURNING id`, ['TEST-' + randomUUID(), status, staff.ADMIN, validated, main.id]);
  await assert.rejects(insert('DONE', new Date()), /starts as a draft/);
  const { rows: [empty] } = await insert('DRAFT', null);
  await assert.rejects(sql.query(`UPDATE stock_documents SET status = 'DONE', "validatedAt" = now() WHERE id = $1`, [empty.id]), /needs lines/);
  const line = await prisma.$transaction((tx) => draftLine(tx, 'ISSUE', bulk.id, '1', { fromLocationId: main.id }));
  await sql.query(`UPDATE stock_documents SET status = 'CANCELED' WHERE id = $1`, [line.documentId]);
  await assert.rejects(sql.query(`UPDATE stock_documents SET status = 'DONE', "validatedAt" = now() WHERE id = $1`, [line.documentId]), /closed stock document/);
  await assert.rejects(sql.query('UPDATE stock_document_lines SET quantity = 2 WHERE id = $1', [line.id]), /closed stock document/);
  await assert.rejects(sql.query(`INSERT INTO stock_movements (id, "documentLineId", "productId", "fromLocationId", quantity, "actorId", "occurredAt")
    VALUES (gen_random_uuid(), $1, $2, $3, 1, $4, $5)`, [line.id, bulk.id, main.id, staff.WAREHOUSE, line.occurredAt]), /validated document/);
});

test('stock pages are bounded, and the total survives an empty later page', async () => {
  await expectError(await get('/stock?page=10001'), 400, 'INVALID_INPUT');
  await expectError(await get('/stock?pageSize=101'), 400, 'INVALID_INPUT');
  const first = await (await get(`/stock?productId=${serialized.id}&pageSize=1`)).json();
  assert.ok(first.data.total >= 1); assert.equal(first.data.items.length, 1);
  const past = await (await get(`/stock?productId=${serialized.id}&pageSize=1&page=50`)).json();
  assert.equal(past.data.total, first.data.total); assert.deepEqual(past.data.items, []);
  const none = await (await get(`/stock?productId=${randomUUID()}`)).json();
  assert.equal(none.data.total, 0); assert.deepEqual(none.data.items, []);
});

test('only warehouse and admin staff reach inventory routes', async () => {
  assert.equal((await post(receipt([bulkLine('1', '10.00')]), null)).status, 401);
  assert.equal((await post(receipt([bulkLine('1', '10.00')]), 'SALES')).status, 403);
  assert.equal((await get('/stock', null)).status, 401);
  assert.equal((await get('/stock', 'SALES')).status, 403);
  assert.equal((await get('/stock', 'ADMIN')).status, 200);
  const crossSite = await fetch(base + '/stock/receipts', { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookies.WAREHOUSE, origin: 'https://evil.example' }, body: JSON.stringify(receipt([bulkLine('1', '10.00')])) });
  assert.equal(crossSite.status, 403);
});
