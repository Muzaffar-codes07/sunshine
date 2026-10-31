// Opt-in database acceptance for the coordinated D4 migration. Apply the
// active queue first. No .env loading, resets or placeholder tables.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const testUrl = process.env.TEST_DATABASE_URL;
assert.ok(testUrl, 'Set TEST_DATABASE_URL to an explicitly disposable database');
const target = new URL(testUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) && /test/i.test(target.pathname));
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'd4-draft-tests-only-session-secret-value';
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { PrismaService } = require('./dist/platform/prisma.service');
const { CostWriterService } = require('./dist/finance/cost-writer.service');
const { PrismaReportingReader } = require('./dist/reporting/reporting.repository');
const { SurveysService } = require('./dist/sales/surveys.service');
const { QuotesService } = require('./dist/quotes/quotes.service');
const { OrdersService } = require('./dist/orders/orders.service');
const { StockReceiptsService } = require('./dist/inventory/stock-receipts.service');
const { seedCatalogue } = require('./dist/catalog/seed-catalogue');
const { catalogueDemoId: id } = require('./dist/catalog/demo-catalogue');
const { Client } = require('pg');
let app, prisma, sql, writer, sales, tech, firstOrder, secondOrder, unitId;
const actor = row => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });
const conflict = error => error.code === 'IDEMPOTENCY_CONFLICT' && error.getStatus() === 409;
const databaseError = sqlstate => error => error.code === sqlstate;
const now = '2026-10-31T12:00:00.000Z';

async function confirmedOrder() {
  const customer = await prisma.customer.create({ data: { name: 'D4 migration customer',
    phone: `7${String(randomInt(1e9)).padStart(9, '0')}`, addressLine: '1 Draft Road', city: 'Nagpur', pincode: '440001' } });
  const enquiry = await prisma.enquiry.create({ data: { customerId: customer.id, source: 'PHONE',
    requestedCapacityKw: 1, status: 'QUALIFIED', contactName: customer.name,
    siteAddressLine: customer.addressLine, siteCity: customer.city, sitePincode: customer.pincode } });
  const surveys = app.get(SurveysService), quotes = app.get(QuotesService);
  const survey = (await surveys.schedule(enquiry.id, { technicianId: tech.id, scheduledFor: now })).data;
  await surveys.submit(survey.id, { version: 1, roofDirection: 'S', roofTiltDeg: '18.5',
    cableDistanceM: '22.00', usableRoofAreaSqm: '30.00' }, actor(tech));
  await surveys.approve(survey.id, { version: 2 }, actor(sales));
  const quote = (await quotes.create(enquiry.id, { surveyId: survey.id, packageId: id(1001) }, actor(sales))).data;
  await quotes.send(quote.id, { version: 1, channel: 'PRINT' }, actor(sales));
  await quotes.accept(quote.id, { version: 2, acceptedByName: customer.name, channel: 'IN_PERSON' }, actor(sales));
  return (await app.get(OrdersService).confirm({ quoteId: quote.id }, randomUUID(), actor(sales))).data;
}

before(async () => {
  sql = new Client({ connectionString: testUrl }); await sql.connect();
  assert.match((await sql.query('SHOW server_version')).rows[0].server_version, /^17\.11(?:\s|$)/);
  app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  prisma = app.get(PrismaService); writer = app.get(CostWriterService);
  await seedCatalogue(prisma);
  [sales, tech] = await Promise.all(['ADMIN', 'TECHNICIAN'].map(role => prisma.user.create({ data: {
    email: `${randomUUID()}@test.local`, displayName: role + ' draft tester', role, passwordHash: 'test-only-non-login-hash',
  } })));
  firstOrder = await confirmedOrder(); secondOrder = await confirmedOrder();
  const location = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'MAIN' } });
  const product = await prisma.product.findFirstOrThrow({ where: { trackingMode: 'SERIALIZED', active: true } });
  const receipt = (await app.get(StockReceiptsService).receive(sales.id, randomUUID(), {
    reference: 'D4-' + randomUUID(), locationId: location.id, receivedAt: now,
    lines: [{ productId: product.id, quantity: '1', unitCost: '100.00', serials: ['D4-' + randomUUID()] }],
  })).data;
  unitId = receipt.lines[0].unitIds[0];
});
after(async () => { await sql?.end(); await app?.close(); });
const cost = (overrides = {}) => ({ uniqueSourceId: `TIME_RECORD:${randomUUID()}`, jobId: firstOrder.jobId,
  costType: 'SERVICE_LABOUR', amount: '600.20', description: 'Actual draft labour', occurredAt: now, ...overrides });
const post = command => prisma.$transaction(tx => writer.postCost(tx, command));
const ticket = (overrides = {}) => prisma.serviceTicket.create({ data: { ticketNumber: 'D4-' + randomUUID(),
  customerId: firstOrder.customerId, jobId: firstOrder.jobId, unitId, faultDescription: 'Synthetic migration fault', ...overrides } });

test('D4 references have actual upstream targets and Restrict delete policies', async () => {
  const { rows } = await sql.query(`SELECT c.conname AS name, c.confdeltype, c.confupdtype, t.relname AS target
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.confrelid
    WHERE c.connamespace='public'::regnamespace AND c.contype='f' AND c.conname=ANY($1)`, [[
    'warranties_unitId_fkey', 'service_tickets_unitId_fkey', 'service_tickets_replacedUnitId_fkey',
    'service_tickets_newUnitId_fkey', 'cost_entries_jobId_fkey', 'service_tickets_jobId_fkey',
    'subsidy_milestones_jobId_fkey', 'subsidy_milestones_evidenceFileId_fkey',
  ]]);
  assert.equal(rows.length, 8);
  for (const row of rows) { assert.equal(row.confdeltype, 'r'); assert.equal(row.confupdtype, 'c'); }
  assert.equal(rows.find(row => row.name === 'subsidy_milestones_evidenceFileId_fkey').target, 'files');
  await assert.rejects(prisma.$transaction(tx => writer.postCost(tx, cost({ jobId: randomUUID() }))));
});

test('concurrent identical sources post once, and semantic decimals replay', async () => {
  const input = cost();
  const results = await Promise.all(Array.from({ length: 4 }, () => post(input)));
  assert.equal(new Set(results.map(row => row.id)).size, 1);
  assert.equal((await post({ ...input, amount: '600.2', occurredAt: '2026-10-31T17:30:00+05:30' })).id, results[0].id);
  assert.equal(await prisma.costEntry.count({ where: { uniqueSourceId: input.uniqueSourceId } }), 1);
});

test('competing different payloads have one winner and one explicit conflict', async () => {
  const input = cost();
  const results = await Promise.allSettled([post(input), post({ ...input, amount: '1.00' })]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.ok(conflict(results.find(row => row.status === 'rejected').reason));
});

test('changed amount or job aborts the caller transaction, including preceding domain writes', async () => {
  const input = cost(); await post(input);
  for (const change of [{ amount: '1.00' }, { jobId: secondOrder.jobId }]) {
    const customerId = randomUUID();
    await assert.rejects(prisma.$transaction(async tx => {
      await tx.customer.create({ data: { id: customerId, name: 'Rollback customer', phone: `7${String(randomInt(1e9)).padStart(9, '0')}`,
        addressLine: '1 Rollback Road', city: 'Nagpur', pincode: '440001' } });
      await writer.postCost(tx, { ...input, ...change });
    }), conflict);
    assert.equal(await prisma.customer.findUnique({ where: { id: customerId } }), null);
  }
});

test('full reversals serialize, replay once and preserve the original expense', async () => {
  const original = await post(cost());
  const reversal = cost({ uniqueSourceId: `REVERSAL:${original.id}`, reversalOfId: original.id,
    amount: '-600.20', description: 'Reverse original cost', occurredAt: '2026-11-01T12:00:00Z' });
  const saved = await Promise.all([post(reversal), post(reversal)]);
  assert.equal(saved[0].id, saved[1].id);
  assert.equal((await prisma.costEntry.aggregate({ where: { id: { in: [original.id, saved[0].id] } }, _sum: { amount: true } }))._sum.amount.toFixed(2), '0.00');
  const insert = `INSERT INTO cost_entries (id,"uniqueSourceId","jobId","costType",amount,description,"occurredAt","reversalOfId")
    VALUES ($1,$2,$3,'SERVICE_LABOUR',$4,'Invalid direct reversal',$5,$6)`;
  const other = await post(cost());
  await assert.rejects(sql.query(insert, [randomUUID(), `REVERSAL:${other.id}`, firstOrder.jobId, '-1', now, other.id]), databaseError('23514'));
  await assert.rejects(sql.query(insert, [randomUUID(), `REVERSAL:${saved[0].id}`, firstOrder.jobId, '-600.20', now, saved[0].id]), databaseError('23514'));
});

test('the database refuses destructive ledger edits, nonfinite money and orphan references', async () => {
  const original = await post(cost());
  for (const statement of ['UPDATE cost_entries SET amount=1 WHERE id=$1', 'DELETE FROM cost_entries WHERE id=$1']) {
    await assert.rejects(sql.query(statement, [original.id]), databaseError('23514'));
  }
  await assert.rejects(sql.query('TRUNCATE cost_entries CASCADE'), databaseError('23514'));
  await assert.rejects(sql.query(`INSERT INTO cost_entries (id,"uniqueSourceId","jobId","costType",amount,description,"occurredAt")
    VALUES ($1,$2,$3,'SERVICE_LABOUR','NaN','Invalid',now())`, [randomUUID(), randomUUID(), firstOrder.jobId]), databaseError('23514'));
  const milestone = { jobId: firstOrder.jobId, stage: 'Application', amount: '1.00' };
  await assert.rejects(prisma.subsidyMilestone.create({ data: { ...milestone, evidenceFileId: randomUUID() } }));
});

test('late costs remain in their occurrence period and respect the posting cutoff', async () => {
  const input = cost({ occurredAt: '2026-10-30T12:00:00Z' });
  const entry = await post(input);
  const reader = new PrismaReportingReader(prisma, { async readPeriod() { return { invoices: [], payments: [] }; } });
  const earlier = { start: new Date('2026-10-30T00:00:00Z'), end: new Date('2026-10-31T00:00:00Z'), asOf: new Date(entry.postedAt.getTime() + 1) };
  const beforePosting = await reader.readPeriod({ ...earlier, asOf: new Date(entry.postedAt.getTime() - 1) });
  assert.equal((await reader.readPeriod(earlier)).costs.length, beforePosting.costs.length + 1);
});

test('warranty uniqueness, replacement lineage pairing and confirmation ordering are SQL backstops', async () => {
  const warranty = { unitId, startDate: new Date('2024-01-01'), expiryDate: new Date('2026-01-01'),
    policyName: 'Component policy', policyRevision: 'v1', scope: 'Component replacement', durationMonths: 24 };
  const created = await Promise.allSettled([prisma.warranty.create({ data: warranty }), prisma.warranty.create({ data: warranty })]);
  assert.equal(created.filter(row => row.status === 'fulfilled').length, 1);
  const row = await ticket();
  await assert.rejects(prisma.serviceTicket.update({ where: { id: row.id }, data: { status: 'CLOSED' } }));
  await assert.rejects(prisma.serviceTicket.update({ where: { id: row.id }, data: { replacedUnitId: unitId } }));
  await assert.rejects(prisma.serviceTicket.update({ where: { id: row.id }, data: {
    status: 'CLOSED', assessmentSnapshot: {}, resolutionDetails: 'Resolved', resolvedAt: new Date(now),
    confirmedBy: 'Customer', confirmationChannel: 'PHONE', confirmedAt: new Date('2026-10-30'), closedAt: new Date(now),
  } }));
  const closed = await prisma.serviceTicket.update({ where: { id: row.id }, data: {
    status: 'CLOSED', assessmentSnapshot: {}, resolutionDetails: 'Resolved', resolvedAt: new Date(now),
    confirmedBy: 'Customer', confirmationChannel: 'PHONE', confirmedAt: new Date(now), closedAt: new Date(now),
  } });
  assert.equal(closed.status, 'CLOSED');
});

test('a missing File prerequisite rolls back the entire migration, including its new types', async () => {
  const schema = `d4_atomicity_${randomUUID().replaceAll('-', '')}`;
  const isolated = new Client({ connectionString: testUrl }); await isolated.connect();
  try {
    await isolated.query(`CREATE SCHEMA "${schema}"`);
    await isolated.query(`SET search_path TO "${schema}", public`);
    const migration = await readFile(new URL('../prisma/migrations/20261031260000_d4/migration.sql', import.meta.url), 'utf8');
    // Fault injection only: the real migration is unchanged. Its File dependency
    // fails late, after all five new tables have been created in this schema.
    await assert.rejects(isolated.query(migration.replace('REFERENCES "files"', 'REFERENCES "d4_missing_file_prerequisite"')), databaseError('42P01'));
    await isolated.query('ROLLBACK');
    assert.equal((await isolated.query('SELECT to_regclass($1) AS object', [`${schema}.warranties`])).rows[0].object, null);
    assert.equal((await isolated.query('SELECT count(*)::int AS count FROM pg_type WHERE typnamespace=$1::regnamespace', [schema])).rows[0].count, 0);
  } finally {
    await isolated.query('ROLLBACK');
    await isolated.query(`DROP SCHEMA "${schema}"`);
    await isolated.end();
  }
});
