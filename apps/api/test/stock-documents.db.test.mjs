// Explicit disposable test database only; never load the application .env.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('TEST_DATABASE_URL must name a disposable test database');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'stock-document-tests-only-session-secret';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
process.env.SESSION_COOKIE_SECURE = 'false';
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
const { PrismaService } = require('../dist/platform/prisma.service');
const { StockLedgerService } = require('../dist/inventory/stock-ledger.service');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { hashPassword } = require('../dist/auth/passwords');
const { Client } = require('pg');

const origin = 'http://127.0.0.1:3001';
const password = 'stock-document-test-password-2026';
const cookies = {}; const staff = {};
let app, prisma, ledger, base, sql, main, quarantine, serialized, bulks;

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1'); base = (await app.getUrl()) + '/api/v1';
  prisma = app.get(PrismaService); ledger = app.get(StockLedgerService);
  await seedCatalogue(prisma);
  sql = new Client({ connectionString: testUrl }); await sql.connect();
  for (const [name, role] of [['WAREHOUSE', 'WAREHOUSE'], ['OTHER', 'WAREHOUSE'], ['SALES', 'SALES']]) {
    const account = await prisma.user.create({ data: { email: randomUUID() + '@test.local', displayName: name + ' document tester', role, passwordHash: await hashPassword(password) } });
    staff[name] = account.id;
    const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email: account.email, password }) });
    assert.equal(response.status, 200); cookies[name] = response.headers.get('set-cookie').split(';')[0];
  }
  main = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'MAIN' } });
  quarantine = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'QUARANTINE' } });
  serialized = await prisma.product.findFirstOrThrow({ where: { trackingMode: 'SERIALIZED', active: true } });
  bulks = await prisma.product.findMany({ where: { trackingMode: 'BULK', active: true }, orderBy: { id: 'asc' }, take: 2 });
  assert.equal(bulks.length, 2);
});
after(async () => { await sql?.end(); await app?.close(); });

const ref = () => 'DOC-' + randomUUID();
const serial = () => 'SN-' + randomUUID().slice(0, 13).toUpperCase();
const send = (route, body, role = 'WAREHOUSE', key = randomUUID()) => fetch(base + route, {
  method: 'POST', headers: { 'content-type': 'application/json', origin, ...(key ? { 'idempotency-key': key } : {}), cookie: cookies[role] }, body: JSON.stringify(body),
});
const ok = async (pending, status = 200) => {
  const response = await pending;
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); return body.data;
};
const expectError = async (response, status, code) => {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); assert.equal(body.error.code, code); return body.error;
};
const onHand = async (productId, locationId = main.id) => (await prisma.$transaction((tx) => ledger.onHand(tx, productId, locationId))).toFixed(3);
const receive = (productId, quantity, unitCost = '100.00', serials = []) => ok(send('/stock/receipts', {
  reference: ref(), locationId: main.id, receivedAt: '2026-10-30T10:00:00.000Z', lines: [{ productId, quantity, unitCost, serials }],
}), 201);
const transfer = (lines, from = main.id, to = quarantine.id) => send('/stock/transfers', { reference: ref(), fromLocationId: from, toLocationId: to, lines });
const count = (lines, locationId = main.id) => send('/stock/counts', { reference: ref(), locationId, lines });
const validate = (document, role = 'WAREHOUSE', key) => send(`/stock/documents/${document.id}/validate`, { expectedVersion: document.version }, role, key);
const cancel = (document) => send(`/stock/documents/${document.id}/cancel`, { expectedVersion: document.version });
const movements = (documentId) => prisma.stockMovement.findMany({ where: { documentLine: { documentId } } });

test('a bulk transfer changes nothing as a draft, then moves stock once on validation', async () => {
  const [product] = bulks;
  const start = await onHand(product.id); const startQuarantine = await onHand(product.id, quarantine.id);
  await receive(product.id, '10');
  const draft = await ok(transfer([{ productId: product.id, quantity: '4' }]), 201);
  assert.equal(draft.status, 'DRAFT'); assert.equal(draft.version, 1); assert.equal(draft.lines[0].movementId, null);
  assert.equal(await onHand(product.id), (Number(start) + 10).toFixed(3));
  const done = await ok(validate(draft, 'OTHER'));
  assert.equal(done.status, 'DONE'); assert.equal(done.actorId, staff.WAREHOUSE); assert.equal(done.validatedById, staff.OTHER);
  assert.equal(done.occurredAt, done.validatedAt);
  assert.equal(await onHand(product.id), (Number(start) + 6).toFixed(3));
  assert.equal(await onHand(product.id, quarantine.id), (Number(startQuarantine) + 4).toFixed(3));
  const [movement] = await movements(done.id);
  assert.equal(movement.actorId, staff.OTHER); assert.equal(movement.id, done.lines[0].movementId);
  assert.deepEqual(await ok(fetch(`${base}/stock/documents/${done.id}`, { headers: { cookie: cookies.WAREHOUSE } })), done);
});

test('a shortage at validation rolls everything back and leaves the draft open', async () => {
  const [first, second] = bulks;
  await receive(first.id, '2');
  const held = Number(await onHand(second.id));
  const draft = await ok(transfer([{ productId: first.id, quantity: '1' }, { productId: second.id, quantity: String(held + 5) }]), 201);
  const before = await onHand(first.id);
  await expectError(await validate(draft), 409, 'INSUFFICIENT_STOCK');
  assert.equal(await onHand(first.id), before);
  const after = await prisma.stockDocument.findUniqueOrThrow({ where: { id: draft.id } });
  assert.equal(after.status, 'DRAFT'); assert.equal(after.version, 1); assert.equal((await movements(draft.id)).length, 0);
  await receive(second.id, '5');
  assert.equal((await ok(validate(draft))).status, 'DONE');
});

test('two validations of one draft have one winner and one movement', async () => {
  const [product] = bulks;
  await receive(product.id, '3');
  const draft = await ok(transfer([{ productId: product.id, quantity: '1' }]), 201);
  const results = await Promise.all([validate(draft), validate(draft, 'OTHER')]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const loser = results.find((result) => result.status === 409);
  await expectError(loser, 409, 'DOCUMENT_NOT_OPEN');
  assert.equal((await movements(draft.id)).length, 1);
});

test('a retry with the same key returns the saved result; a stale version is refused', async () => {
  const [product] = bulks;
  await receive(product.id, '3');
  const draft = await ok(transfer([{ productId: product.id, quantity: '1' }]), 201);
  await expectError(await send(`/stock/documents/${draft.id}/validate`, { expectedVersion: 7 }), 409, 'STALE_VERSION');
  const key = randomUUID();
  const first = await ok(validate(draft, 'WAREHOUSE', key));
  assert.deepEqual(await ok(validate(draft, 'WAREHOUSE', key)), first);
  assert.equal((await movements(draft.id)).length, 1);
});

test('an upper-case ID is the same ID: the checks that compare IDs still apply', async () => {
  const [product] = bulks;
  const draft = await ok(transfer([{ productId: product.id.toUpperCase(), quantity: '1' }], main.id.toUpperCase()), 201);
  assert.equal(draft.lines[0].productId, product.id); assert.equal(draft.fromLocationId, main.id);
  await ok(cancel(draft));
  await expectError(await transfer([{ productId: product.id, quantity: '1' }], main.id, main.id.toUpperCase()), 400, 'INVALID_INPUT');
  await expectError(await transfer([{ productId: product.id, quantity: '1' }], quarantine.id.toUpperCase(), main.id), 409, 'NOT_MOVABLE');
  await expectError(await send('/stock/transfers', { reference: ref(), fromLocationId: main.id, toLocationId: quarantine.id, lines: [
    { productId: product.id, quantity: '1' }, { productId: product.id.toUpperCase(), quantity: '1' },
  ] }), 400, 'INVALID_INPUT');
});

test('the reference guards a draft: same body replays, different body conflicts', async () => {
  const [product] = bulks;
  const body = { reference: ref(), fromLocationId: main.id, toLocationId: quarantine.id, lines: [{ productId: product.id, quantity: '1' }] };
  const first = await ok(send('/stock/transfers', body), 201);
  assert.equal((await ok(send('/stock/transfers', body), 201)).id, first.id);
  const changed = { ...body, lines: [{ productId: product.id, quantity: '2' }] };
  await expectError(await send('/stock/transfers', changed), 409, 'IDEMPOTENCY_CONFLICT');
});

test('a cancelled draft can never post, and a posted document can never be cancelled', async () => {
  const [product] = bulks;
  await receive(product.id, '2');
  const draft = await ok(transfer([{ productId: product.id, quantity: '1' }]), 201);
  const canceled = await ok(cancel(draft));
  assert.equal(canceled.status, 'CANCELED');
  await expectError(await validate(canceled), 409, 'DOCUMENT_NOT_OPEN');
  const posted = await ok(validate(await ok(transfer([{ productId: product.id, quantity: '1' }]), 201)));
  await expectError(await cancel(posted), 409, 'DOCUMENT_NOT_OPEN');
  await expectError(await send(`/stock/documents/${randomUUID()}/cancel`, { expectedVersion: 1 }), 404, 'NOT_FOUND');
});

test('a receipt cannot be validated or cancelled through these commands', async () => {
  const [product] = bulks;
  const receipt = await receive(product.id, '1');
  await expectError(await send(`/stock/documents/${receipt.id}/cancel`, { expectedVersion: 2 }), 409, 'DOCUMENT_NOT_OPEN');
});

test('a serial transfer quarantines the named units, and nothing leaves quarantine by transfer', async () => {
  const serials = [serial(), serial()];
  const received = await receive(serialized.id, '2', '25000.00', serials);
  const draft = await ok(transfer([{ productId: serialized.id, quantity: '2', serials: [serials[0].toLowerCase(), serials[1]] }]), 201);
  assert.equal(draft.lines[0].unitIds.length, 2);
  const done = await ok(validate(draft));
  assert.deepEqual([...done.lines[0].unitIds].sort(), [...received.lines[0].unitIds].sort());
  const units = await prisma.unit.findMany({ where: { id: { in: done.lines[0].unitIds } } });
  assert.deepEqual(units.map((unit) => unit.status), ['QUARANTINED', 'QUARANTINED']);
  assert.ok(units.every((unit) => unit.version === 2));
  const { rows } = await sql.query('SELECT "locationId" FROM "unit_locations" WHERE "unitId" = ANY($1::uuid[])', [done.lines[0].unitIds]);
  assert.deepEqual(rows.map((row) => row.locationId), [quarantine.id, quarantine.id]);
  await expectError(await transfer([{ productId: serialized.id, quantity: '1', serials: [serials[0]] }], quarantine.id, main.id), 409, 'NOT_MOVABLE');
  await expectError(await transfer([{ productId: bulks[0].id, quantity: '1' }], quarantine.id, main.id), 409, 'NOT_MOVABLE');
});

test('serial transfers refuse units that are reserved, elsewhere, unknown or missing', async () => {
  const [reservedSerial, movedSerial] = [serial(), serial()];
  const received = await receive(serialized.id, '2', '25000.00', [reservedSerial, movedSerial]);
  const reservedDraft = await ok(transfer([{ productId: serialized.id, quantity: '1', serials: [reservedSerial] }]), 201);
  const reservedId = reservedDraft.lines[0].unitIds[0];
  assert.ok(received.lines[0].unitIds.includes(reservedId));
  await prisma.unit.update({ where: { id: reservedId }, data: { status: 'RESERVED' } });
  await expectError(await validate(reservedDraft), 409, 'NOT_MOVABLE');
  assert.equal((await movements(reservedDraft.id)).length, 0);
  const movedFirst = await ok(transfer([{ productId: serialized.id, quantity: '1', serials: [movedSerial] }]), 201);
  const movedSecond = await ok(transfer([{ productId: serialized.id, quantity: '1', serials: [movedSerial] }]), 201);
  await ok(validate(movedFirst));
  await expectError(await validate(movedSecond), 409, 'NOT_MOVABLE');
  await expectError(await transfer([{ productId: serialized.id, quantity: '1', serials: [serial()] }]), 409, 'NOT_MOVABLE');
  await expectError(await transfer([{ productId: serialized.id, quantity: '1' }]), 409, 'NOT_MOVABLE');
  await expectError(await transfer([{ productId: bulks[0].id, quantity: '1', serials: [serial()] }]), 409, 'NOT_MOVABLE');
});

test('validation rechecks planned units against the line after locking', async () => {
  const [first, second] = [serial(), serial()];
  const received = await receive(serialized.id, '2', '25000.00', [first, second]);
  const draft = await ok(transfer([{ productId: serialized.id, quantity: '1', serials: [first] }]), 201);
  const extra = received.lines[0].unitIds.find((unitId) => unitId !== draft.lines[0].unitIds[0]);
  await prisma.stockDocumentLineUnit.create({ data: { lineId: draft.lines[0].id, unitId: extra } });
  await expectError(await validate(draft), 409, 'NOT_MOVABLE');
  assert.equal((await movements(draft.id)).length, 0);
  const moved = await ok(transfer([{ productId: bulks[0].id, quantity: '1' }]), 201);
  await prisma.stockDocumentLineUnit.create({ data: { lineId: moved.lines[0].id, unitId: extra } });
  await expectError(await validate(moved), 409, 'NOT_MOVABLE');
});

test('opposite-order transfers both finish without a deadlock', async () => {
  const [first, second] = bulks;
  await receive(first.id, '20'); await receive(second.id, '20');
  for (let round = 0; round < 5; round += 1) {
    const one = await ok(transfer([{ productId: first.id, quantity: '1' }, { productId: second.id, quantity: '1' }]), 201);
    const two = await ok(transfer([{ productId: second.id, quantity: '1' }, { productId: first.id, quantity: '1' }]), 201);
    const results = await Promise.all([validate(one), validate(two, 'OTHER')]);
    assert.deepEqual(results.map((result) => result.status), [200, 200]);
  }
});

test('competing transfers never take a location below zero', async () => {
  const target = bulks[1];
  const held = Number(await onHand(target.id));
  await receive(target.id, '3');
  const drafts = await Promise.all(Array.from({ length: 2 }, () => transfer([{ productId: target.id, quantity: String(held + 2) }]).then((response) => ok(response, 201))));
  const results = await Promise.all(drafts.map((draft) => validate(draft)));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(await onHand(target.id), (held + 3 - (held + 2)).toFixed(3));
});

test('a count measures at validation, not when drafted, and posts only the difference', async () => {
  const [product] = bulks;
  await receive(product.id, '5');
  const held = Number(await onHand(product.id));
  const draft = await ok(count([{ productId: product.id, countedQuantity: String(held + 2) }]), 201);
  assert.equal(draft.kind, 'ADJUSTMENT'); assert.equal(draft.lines[0].quantity, '0.000'); assert.equal(draft.lines[0].measuredQuantity, null);
  await receive(product.id, '2');
  const matched = await ok(validate(draft));
  assert.equal(matched.status, 'DONE'); assert.equal(matched.lines[0].measuredQuantity, (held + 2).toFixed(3));
  assert.equal(matched.lines[0].quantity, '0.000'); assert.equal(matched.lines[0].movementId, null);
  assert.equal((await movements(matched.id)).length, 0);
  assert.equal(await onHand(product.id), (held + 2).toFixed(3));
});

test('a count posts a shortage out and a surplus in, leaving the average alone', async () => {
  const [product] = bulks;
  await receive(product.id, '5');
  const held = Number(await onHand(product.id));
  const averageBefore = (await prisma.productCostBasis.findUniqueOrThrow({ where: { productId: product.id } })).averageCost.toFixed(6);
  const short = await ok(validate(await ok(count([{ productId: product.id, countedQuantity: String(held - 1.5) }]), 201), 'OTHER'));
  const [out] = await movements(short.id);
  assert.equal(out.fromLocationId, main.id); assert.equal(out.toLocationId, null); assert.equal(out.quantity.toFixed(3), '1.500'); assert.equal(out.actorId, staff.OTHER);
  assert.equal(await onHand(product.id), (held - 1.5).toFixed(3));
  const over = await ok(validate(await ok(count([{ productId: product.id, countedQuantity: String(held + 1) }]), 201)));
  const [surplus] = await movements(over.id);
  assert.equal(surplus.toLocationId, main.id); assert.equal(surplus.fromLocationId, null); assert.equal(surplus.quantity.toFixed(3), '2.500');
  assert.equal(await onHand(product.id), (held + 1).toFixed(3));
  assert.equal((await prisma.productCostBasis.findUniqueOrThrow({ where: { productId: product.id } })).averageCost.toFixed(6), averageBefore);
});

test('a count racing a receipt stays consistent whichever commits first', async () => {
  const [, product] = bulks;
  await receive(product.id, '1');
  const counted = Number(await onHand(product.id)) + 1;
  const draft = await ok(count([{ productId: product.id, countedQuantity: String(counted) }]), 201);
  const [done] = await Promise.all([ok(validate(draft)), receive(product.id, '2')]);
  const final = Number(await onHand(product.id));
  assert.ok(final === counted || final === counted + 2, String(final));
  const measured = Number(done.lines[0].measuredQuantity);
  assert.equal(Number(done.lines[0].quantity), Math.abs(counted - measured));
});

test('a count refuses serialized stock and a surplus with no cost basis', async () => {
  await expectError(await count([{ productId: serialized.id, countedQuantity: '1' }]), 409, 'NOT_MOVABLE');
  const [product] = bulks;
  await receive(product.id, '1');
  const matching = await ok(count([{ productId: product.id, countedQuantity: await onHand(product.id) }]), 201);
  const noCost = await ok(count([{ productId: product.id, countedQuantity: '99999' }]), 201);
  const basis = await prisma.productCostBasis.findUniqueOrThrow({ where: { productId: product.id } });
  await prisma.productCostBasis.delete({ where: { productId: product.id } });
  await expectError(await validate(noCost), 409, 'NOT_MOVABLE');
  assert.equal((await ok(validate(matching))).status, 'DONE');
  await prisma.productCostBasis.create({ data: { productId: product.id, averageCost: basis.averageCost } });
  assert.equal((await movements(noCost.id)).length, 0);
  await ok(cancel(noCost));
});

test('routes need staff with stock access and an Idempotency-Key', async () => {
  const [product] = bulks;
  const body = { reference: ref(), locationId: main.id, lines: [{ productId: product.id, countedQuantity: '1' }] };
  await expectError(await send('/stock/counts', body, 'SALES'), 403, 'FORBIDDEN');
  await expectError(await send('/stock/counts', body, 'WAREHOUSE', null), 400, 'INVALID_INPUT');
  await expectError(await send('/stock/transfers', { reference: ref(), fromLocationId: main.id, toLocationId: main.id, lines: [{ productId: product.id, quantity: '1' }] }), 400, 'INVALID_INPUT');
  await expectError(await send('/stock/counts', { ...body, lines: [body.lines[0], body.lines[0]] }), 400, 'INVALID_INPUT');
});

test('the database refuses a count movement in the wrong direction or size', async () => {
  const [product] = bulks;
  await receive(product.id, '4');
  const held = Number(await onHand(product.id));
  const done = await ok(validate(await ok(count([{ productId: product.id, countedQuantity: String(held - 1) }]), 201)));
  const line = await prisma.stockDocumentLine.findFirstOrThrow({ where: { documentId: done.id } });
  await assert.rejects(sql.query(
    `INSERT INTO "stock_movements" ("id","documentLineId","productId","toLocationId","quantity","actorId","occurredAt") VALUES (gen_random_uuid(),$1,$2,$3,1,$4,$5)`,
    [line.id, product.id, main.id, done.validatedById, done.occurredAt]), /must match its document line/);
});

test('the database keeps count fields on count lines and closes planned units with the document', async () => {
  const [product] = bulks;
  const insertDoc = (kind, columns) => sql.query(
    `INSERT INTO "stock_documents" ("id","kind","reference","payloadHash","actorId","occurredAt","fromLocationId","toLocationId") VALUES (gen_random_uuid(),$1,$2,'x',$3,now(),$4,$5) RETURNING "id"`,
    [kind, ref(), staff.WAREHOUSE, columns.from ?? null, columns.to ?? null]);
  await assert.rejects(insertDoc('TRANSFER', { from: main.id, to: main.id }), /stock_documents_locations_match_kind/);
  await assert.rejects(insertDoc('TRANSFER', { from: main.id }), /stock_documents_locations_match_kind/);
  await assert.rejects(insertDoc('ISSUE', { to: main.id }), /stock_documents_locations_match_kind/);
  const transferDoc = (await insertDoc('TRANSFER', { from: main.id, to: quarantine.id })).rows[0].id;
  const insertLine = (documentId, quantity, counted) => sql.query(
    `INSERT INTO "stock_document_lines" ("id","documentId","lineNumber","productId","quantity","countedQuantity") VALUES (gen_random_uuid(),$1,1,$2,$3,$4)`,
    [documentId, product.id, quantity, counted]);
  await assert.rejects(insertLine(transferDoc, 1, 1), /only a count line/);
  await assert.rejects(insertLine(transferDoc, 0, null), /stock_document_lines_quantity_valid/);
  const countDoc = (await insertDoc('ADJUSTMENT', { to: main.id })).rows[0].id;
  await assert.rejects(insertLine(countDoc, 1, null), /only a count line/);
  await insertLine(countDoc, 0, 3);
  await assert.rejects(sql.query(`UPDATE "stock_document_lines" SET "measuredQuantity" = 1, "quantity" = 5 WHERE "documentId" = $1`, [countDoc]), /stock_document_lines_count_difference/);
  await assert.rejects(sql.query(`UPDATE "stock_documents" SET "status" = 'DONE', "validatedAt" = now() WHERE "id" = $1`, [countDoc]), /must be measured before validation/);
  await sql.query(`DELETE FROM "stock_document_lines" WHERE "documentId" = $1`, [countDoc]);
  const serialValue = serial();
  await receive(serialized.id, '1', '25000.00', [serialValue]);
  const posted = await ok(validate(await ok(transfer([{ productId: serialized.id, quantity: '1', serials: [serialValue] }]), 201)));
  await assert.rejects(sql.query(`DELETE FROM "stock_document_line_units" WHERE "lineId" = $1`, [posted.lines[0].id]), /units of a closed stock document/);
  await assert.rejects(sql.query(`UPDATE "stock_document_lines" SET "quantity" = 2 WHERE "id" = $1`, [posted.lines[0].id]), /lines of a closed stock document/);
  await assert.rejects(sql.query(`UPDATE "stock_documents" SET "validatedById" = NULL WHERE "id" = $1`, [posted.id]), /closed stock document/);
});
