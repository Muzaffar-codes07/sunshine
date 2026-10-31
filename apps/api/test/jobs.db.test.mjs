// Explicit disposable test database only; never load the application .env.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('TEST_DATABASE_URL must name a disposable test database');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'job-tests-only-session-secret-value';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
process.env.SESSION_COOKIE_SECURE = 'false';
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/platform/prisma.service');
const { IdempotencyService } = require('../dist/platform/idempotency');
const { QuotesService } = require('../dist/quotes/quotes.service');
const { SurveysService } = require('../dist/sales/surveys.service');
const { OrdersService } = require('../dist/orders/orders.service');
const { InvoicesService } = require('../dist/finance/invoices.service');
const { JobsService } = require('../dist/field/jobs.service');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { catalogueDemoId: id } = require('../dist/catalog/demo-catalogue');
const { hashPassword } = require('../dist/auth/passwords');
const { Client } = require('pg');

let app, prisma, idempotency, quotes, surveys, orders, invoices, jobs, sql, sales, tech;
const facts = { roofDirection: 'S', roofTiltDeg: '18.5', cableDistanceM: '22.00', usableRoofAreaSqm: '30.00' };
const staff = (row) => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });
const user = async (role) => prisma.user.create({ data: {
  email: `${randomUUID()}@test.local`, displayName: `${role} job tester`, role, passwordHash: await hashPassword('job-test-password-2026'),
} });

async function acceptedQuote() {
  const customer = await prisma.customer.create({ data: {
    name: 'Job Customer', phone: `7${String(randomInt(1e9)).padStart(9, '0')}`, addressLine: '4 Job Road', city: 'Nagpur', pincode: '440001',
  } });
  const enquiry = await prisma.enquiry.create({ data: {
    customerId: customer.id, source: 'PHONE', requestedCapacityKw: 1, status: 'QUALIFIED',
    contactName: 'Job Customer', siteAddressLine: '4 Job Road', siteCity: 'Nagpur', sitePincode: '440001',
  } });
  const survey = (await surveys.schedule(enquiry.id, { technicianId: tech.id, scheduledFor: '2026-11-02T05:00:00.000Z' })).data;
  await surveys.submit(survey.id, { version: 1, ...facts }, staff(tech));
  await surveys.approve(survey.id, { version: 2 }, staff(sales));
  const draft = (await quotes.create(enquiry.id, { surveyId: survey.id, packageId: id(1001) }, staff(sales))).data;
  await quotes.send(draft.id, { version: 1, channel: 'PRINT' }, staff(sales));
  return (await quotes.accept(draft.id, { version: 2, acceptedByName: 'Job Customer', channel: 'IN_PERSON' }, staff(sales))).data;
}
const confirm = async () => (await orders.confirm({ quoteId: (await acceptedQuote()).id }, randomUUID(), staff(sales))).data;
const orderFacts = (order, overrides = {}) => ({
  orderId: order.id, enquiryId: order.enquiryId, customerId: order.customerId, quoteId: order.quoteId, capacityKw: 1, systemType: 'ON_GRID', ...overrides,
});

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  prisma = app.get(PrismaService); idempotency = app.get(IdempotencyService); quotes = app.get(QuotesService);
  surveys = app.get(SurveysService); orders = app.get(OrdersService); invoices = app.get(InvoicesService); jobs = app.get(JobsService);
  await seedCatalogue(prisma);
  [sales, tech] = await Promise.all(['SALES', 'TECHNICIAN'].map(user));
  sql = new Client({ connectionString: testUrl }); await sql.connect();
});
after(async () => { await sql?.end(); await app?.close(); });

test('confirming an order creates its one job, linked both ways', async () => {
  const order = await confirm();
  assert.ok(order.jobId);
  const job = await prisma.job.findUniqueOrThrow({ where: { orderId: order.id } });
  assert.equal(job.id, order.jobId); assert.equal(job.status, 'SCHEDULED'); assert.equal(job.version, 1);
});

test('a confirmation retry replays the same job, and another key is refused without a second one', async () => {
  const quote = await acceptedQuote();
  const key = randomUUID();
  const first = (await orders.confirm({ quoteId: quote.id }, key, staff(sales))).data;
  const retried = (await orders.confirm({ quoteId: quote.id }, key, staff(sales))).data;
  assert.equal(retried.jobId, first.jobId);
  await assert.rejects(orders.confirm({ quoteId: quote.id }, randomUUID(), staff(sales)), (error) => error.code === 'ORDER_ALREADY_CONFIRMED');
  assert.equal(await prisma.job.count({ where: { orderId: first.id } }), 1);
});

test('two confirmations at the same moment make one order and one job', async () => {
  const quote = await acceptedQuote();
  const results = await Promise.allSettled([1, 2].map(() => orders.confirm({ quoteId: quote.id }, randomUUID(), staff(sales))));
  assert.deepEqual(results.map((result) => result.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(await prisma.job.count({ where: { order: { quoteId: quote.id } } }), 1);
});

test('ensureJob returns the same job when called again', async () => {
  const order = await confirm();
  const again = await prisma.$transaction((tx) => jobs.ensureJob(tx, orderFacts(order)));
  assert.equal(again.jobId, order.jobId);
  assert.equal(await prisma.job.count({ where: { orderId: order.id } }), 1);
});

test('ensureJob checks the supplied facts against the real order', async () => {
  const order = await confirm();
  for (const wrong of [{ orderId: randomUUID() }, { quoteId: randomUUID() }, { enquiryId: randomUUID() }, { customerId: randomUUID() }, { capacityKw: 5 }, { systemType: 'OFF_GRID' }]) {
    await assert.rejects(prisma.$transaction((tx) => jobs.ensureJob(tx, orderFacts(order, wrong))), (error) => error.code === 'JOB_SOURCE_INVALID');
  }
});

test('a failure after the job is created rolls back the whole confirmation', async () => {
  const quote = await acceptedQuote();
  const failing = new OrdersService(prisma, idempotency, quotes, invoices, { async ensureJob(tx, input) {
    await jobs.ensureJob(tx, input);
    assert.equal(await tx.job.count({ where: { orderId: input.orderId } }), 1, 'the job exists inside the transaction');
    throw new Error('later step failed');
  } });
  const key = randomUUID();
  const before = await prisma.job.count();
  await assert.rejects(failing.confirm({ quoteId: quote.id }, key, staff(sales)), /later step failed/);
  assert.equal(await prisma.job.count(), before);
  assert.equal(await prisma.order.count({ where: { quoteId: quote.id } }), 0);
  assert.equal(await prisma.invoice.count({ where: { order: { quoteId: quote.id } } }), 0);
  const retried = (await orders.confirm({ quoteId: quote.id }, key, staff(sales))).data;
  assert.ok(retried.jobId);
});

test('the database keeps one job per order and lets an order point only at its own job', async () => {
  const [one, two] = [await confirm(), await confirm()];
  await assert.rejects(sql.query('UPDATE orders SET "jobId" = $1 WHERE id = $2', [two.jobId, one.id]), /orders_id_jobId_fkey|orders_jobId_key/);
  await assert.rejects(sql.query('INSERT INTO jobs (id, "orderId", "updatedAt") VALUES (gen_random_uuid(), $1, now())', [one.id]), /jobs_orderId_key/);
  await assert.rejects(sql.query('UPDATE jobs SET "orderId" = $1 WHERE id = $2', [randomUUID(), one.jobId]), /foreign key/);
  await assert.rejects(sql.query('DELETE FROM jobs WHERE id = $1', [one.jobId]), /foreign key/);
  await assert.rejects(sql.query('UPDATE jobs SET version = 0 WHERE id = $1', [one.jobId]), /jobs_version_positive/);
  await assert.rejects(sql.query('DELETE FROM orders WHERE id = $1', [one.id]), /foreign key/);
});
