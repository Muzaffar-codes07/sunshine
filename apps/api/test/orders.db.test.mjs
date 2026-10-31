// Real PostgreSQL tests for order confirmation, invoices and receipts (C5). Only runs against TEST_DATABASE_URL
// naming a disposable "test" database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('Disposable TEST_DATABASE_URL required');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'order-tests-only-session-secret-2026';
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
<<<<<<< HEAD
const { JobsService } = require('../dist/field/jobs.service');
=======
>>>>>>> origin/main
const { constraintError } = require('../dist/platform/constraint-errors');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { catalogueDemoId: id } = require('../dist/catalog/demo-catalogue');
const { hashPassword } = require('../dist/auth/passwords');
const { orderSchema } = require('@sunshine/contracts');

let app, base, prisma, idempotency, quotes, surveys, orders, invoices, sales, admin, tech, warehouse;
const password = 'order-test-password-2026';
const origin = 'http://127.0.0.1:3001';
const when = '2026-11-02T05:00:00.000Z';
const facts = { roofDirection: 'S', roofTiltDeg: '18.5', cableDistanceM: '22.00', usableRoofAreaSqm: '30.00' };
const staff = (row) => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });
const user = async (role) => prisma.user.create({ data: {
  email: `${randomUUID()}@test.local`, displayName: `${role} order tester`, role, passwordHash: await hashPassword(password),
} });
const key = () => randomUUID();
const reference = () => `UTR${randomInt(1e9)}`;
const refuses = (promise, status, code) => assert.rejects(promise, (error) => {
  assert.equal(error.getStatus(), status, error.message);
  assert.equal(error.code, code);
  return true;
});

/** An accepted 1 kW On-Grid quote: package 50,000 + installation 5,000 = 55,000, with 9 component lines. */
async function acceptedQuote({ accept = true } = {}) {
  const customer = await prisma.customer.create({ data: {
    name: 'Order Customer', phone: `7${String(randomInt(1e9)).padStart(9, '0')}`, addressLine: '3 Order Road', city: 'Nagpur', pincode: '440001',
  } });
  const enquiry = await prisma.enquiry.create({ data: {
    customerId: customer.id, source: 'PHONE', requestedCapacityKw: 1, status: 'QUALIFIED',
    contactName: 'Order Customer', siteAddressLine: '3 Order Road', siteCity: 'Nagpur', sitePincode: '440001',
  } });
  const survey = (await surveys.schedule(enquiry.id, { technicianId: tech.id, scheduledFor: when })).data;
  await surveys.submit(survey.id, { version: 1, ...facts }, staff(tech));
  await surveys.approve(survey.id, { version: 2 }, staff(sales));
  const draft = (await quotes.create(enquiry.id, { surveyId: survey.id, packageId: id(1001) }, staff(sales))).data;
  const sent = (await quotes.send(draft.id, { version: 1, channel: 'PRINT' }, staff(sales))).data;
  if (!accept) return { enquiry, quote: sent };
  const quote = (await quotes.accept(draft.id, { version: 2, acceptedByName: 'Order Customer', channel: 'IN_PERSON' }, staff(sales))).data;
  return { enquiry, quote };
}

const pay = (invoiceId, amountInr, extra = {}) => idempotency.run(
  { actorId: admin.id, key: extra.key ?? key(), action: 'PAYMENT_RECEIPT', payload: { invoiceId, amountInr, ...extra } },
  (tx) => invoices.recordPayment(tx, invoiceId, {
    amountInr, method: extra.method ?? 'UPI', reference: extra.reference ?? reference(), receivedAt: extra.receivedAt ?? new Date().toISOString(),
  }, staff(admin)),
);

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  base = `${await app.getUrl()}/api/v1`;
  prisma = app.get(PrismaService);
  idempotency = app.get(IdempotencyService);
  quotes = app.get(QuotesService);
  surveys = app.get(SurveysService);
  orders = app.get(OrdersService);
  invoices = app.get(InvoicesService);
  await seedCatalogue(prisma);
  [sales, admin, tech, warehouse] = await Promise.all(['SALES', 'ADMIN', 'TECHNICIAN', 'WAREHOUSE'].map(user));
});

after(async () => {
  await app?.close();
});

test('confirmation creates one order, its packing requirements and one invoice from the accepted quote', async () => {
  const { quote } = await acceptedQuote();
  const order = (await orders.confirm({ quoteId: quote.id }, key(), staff(sales))).data;
  assert.ok(orderSchema.safeParse(order).success);
  assert.match(order.displayNumber, /^ORD-\d{6}$/);
<<<<<<< HEAD
  assert.ok(order.jobId, 'the job is created with the order');
=======
  assert.equal(order.jobId, null, 'D3 job helper is not wired in this build');
>>>>>>> origin/main
  const components = quote.lines.filter((line) => line.kind === 'COMPONENT');
  assert.equal(order.packing.length, components.length);
  assert.deepEqual(order.packing.map((item) => item.quoteLineId), components.map((line) => line.id));
  const { invoice } = order;
  assert.equal(invoice.total, '55000.00');
  assert.equal(invoice.balance, '55000.00');
  assert.equal(invoice.taxAmount, '0.00');
  assert.match(invoice.taxNote, /not configured/);
  assert.deepEqual(invoice.lines.map((line) => line.lineTotal), ['50000.00', '5000.00'], 'package and installation only; components are not charged twice');
  assert.equal(invoice.status, 'POSTED');
  assert.equal(order.released, false, 'nothing is released before a payment');
});

test('a retried confirmation replays; another key, another quote revision or an unaccepted quote is refused', async () => {
  const { quote } = await acceptedQuote();
  const k = key();
  const first = await orders.confirm({ quoteId: quote.id }, k, staff(sales));
  const retry = await orders.confirm({ quoteId: quote.id }, k, staff(sales));
  assert.deepEqual(retry, first);
  await refuses(orders.confirm({ quoteId: quote.id }, key(), staff(sales)), 409, 'ORDER_ALREADY_CONFIRMED');
  assert.equal(await prisma.order.count({ where: { quoteId: quote.id } }), 1);
  assert.equal(await prisma.invoice.count({ where: { orderId: first.data.id } }), 1);
  // Once confirmed, the quote can't be revised into a second sale.
  await refuses(quotes.revise(quote.id, { version: quote.version, surveyId: quote.surveyId, packageId: id(1001), reason: 'Try a second sale' }, staff(sales)),
    409, 'ORDER_ALREADY_CONFIRMED');

  const { quote: sentOnly } = await acceptedQuote({ accept: false });
  await refuses(orders.confirm({ quoteId: sentOnly.id }, key(), staff(sales)), 409, 'QUOTE_NOT_ACCEPTED');
  assert.equal(await prisma.order.count({ where: { quoteId: sentOnly.id } }), 0);
});

test('two confirmations with different keys at the same moment make exactly one order', async () => {
  const { quote } = await acceptedQuote();
  const results = await Promise.allSettled([
    orders.confirm({ quoteId: quote.id }, key(), staff(sales)),
    orders.confirm({ quoteId: quote.id }, key(), staff(sales)),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'ORDER_ALREADY_CONFIRMED');
  assert.equal(await prisma.order.count({ where: { quoteId: quote.id } }), 1);
  assert.equal(await prisma.invoice.count({ where: { order: { quoteId: quote.id } } }), 1);
});

/** Waits until a statement is blocked on a row lock; each poll is its own transaction, so the stats are fresh. */
async function untilBlockedOn(fragment) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [{ waiting }] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE $1`, `%${fragment}%`,
    );
    if (waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`nothing waited on a lock for "${fragment}"`);
}

test('a closed enquiry cannot be confirmed, including one closed while the confirmation waits on it', async () => {
  const { EnquiryQueueService } = require('../dist/sales/enquiry-queue.service');
  const queue = app.get(EnquiryQueueService);
  const archived = await acceptedQuote();
  await queue.archive(archived.enquiry.id, { version: 1, reason: 'Customer cancelled before confirmation' });
  const k = key();
  await refuses(orders.confirm({ quoteId: archived.quote.id }, k, staff(sales)), 409, 'ENQUIRY_NOT_QUALIFIED');
  assert.equal(await prisma.order.count({ where: { enquiryId: archived.enquiry.id } }), 0);
  assert.equal(await prisma.invoice.count({ where: { customerId: archived.quote.customerId } }), 0);
  assert.equal(await prisma.command.count({ where: { idempotencyKey: k } }), 0, 'the refusal leaves no command behind');

  // The archive holds the enquiry row; the confirmation blocks on its share lock and must see ARCHIVED when it wakes.
  const racing = await acceptedQuote();
  let confirming;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE enquiries SET status = 'ARCHIVED', "closedReason" = 'Customer cancelled', version = version + 1 WHERE id = $1::uuid`,
      racing.enquiry.id,
    );
    confirming = orders.confirm({ quoteId: racing.quote.id }, key(), staff(sales));
    confirming.catch(() => {});
    await untilBlockedOn('FOR SHARE');
  });
  await refuses(confirming, 409, 'ENQUIRY_NOT_QUALIFIED');
  assert.equal(await prisma.order.count({ where: { enquiryId: racing.enquiry.id } }), 0);
  assert.equal(await prisma.invoice.count({ where: { customerId: racing.quote.customerId } }), 0);
});

test('advance, partial and final receipts move the balance; overpayment and paying a paid invoice are refused', async () => {
  const { quote } = await acceptedQuote();
  const { invoice } = (await orders.confirm({ quoteId: quote.id }, key(), staff(sales))).data;
  const advance = await pay(invoice.id, '20000.00');
  assert.deepEqual([advance.status, advance.paidAmount, advance.balance, advance.payments[0].kind], ['PART_PAID', '20000.00', '35000.00', 'ADVANCE']);
  const partial = await pay(invoice.id, '15000.50');
  assert.deepEqual([partial.status, partial.balance, partial.payments[1].kind], ['PART_PAID', '19999.50', 'PARTIAL']);
  await refuses(pay(invoice.id, '20000.00'), 409, 'PAYMENT_EXCEEDS_BALANCE');
  const final = await pay(invoice.id, '19999.50');
  assert.deepEqual([final.status, final.balance, final.payments[2].kind], ['PAID', '0.00', 'FINAL']);
  await refuses(pay(invoice.id, '1.00'), 409, 'INVOICE_ALREADY_PAID');
  const facts = await prisma.$transaction((tx) => invoices.getOrderPaymentFacts(tx, invoice.orderId));
  assert.deepEqual([facts.status, facts.balance, facts.released], ['PAID', '0.00', true]);
});

test('a retried receipt replays; a reused bank reference or a future date is refused', async () => {
  const { quote } = await acceptedQuote();
  const { invoice } = (await orders.confirm({ quoteId: quote.id }, key(), staff(sales))).data;
  const k = key();
  const ref = reference();
  const first = await pay(invoice.id, '10000.00', { key: k, reference: ref });
  const retry = await pay(invoice.id, '10000.00', { key: k, reference: ref });
  assert.deepEqual(retry, first);
  assert.equal(await prisma.payment.count({ where: { invoiceId: invoice.id } }), 1);
  const reused = await pay(invoice.id, '5000.00', { reference: ref }).then(() => assert.fail('reference reused'), (error) => error);
  assert.deepEqual(constraintError(reused).fieldErrors, { reference: ['This payment reference is already recorded for this method'] });
  await refuses(pay(invoice.id, '5000.00', { receivedAt: new Date(Date.now() + 3_600_000).toISOString() }), 400, 'INVALID_INPUT');
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).paidAmount.toFixed(2), '10000.00');
});

test('two receipts that each fit but together exceed the balance: exactly one is recorded', async () => {
  const { quote } = await acceptedQuote();
  const { invoice } = (await orders.confirm({ quoteId: quote.id }, key(), staff(sales))).data;
  const results = await Promise.allSettled([pay(invoice.id, '40000.00'), pay(invoice.id, '40000.00')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'PAYMENT_EXCEEDS_BALANCE');
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).paidAmount.toFixed(2), '40000.00');
});

test("D3's job helper runs inside the confirming transaction, and its failure leaves nothing behind", async () => {
  const calls = [];
  const jobs = { async ensureJob(tx, facts) {
    calls.push(facts);
    assert.equal(await tx.order.count({ where: { id: facts.orderId } }), 1, 'sees the uncommitted order');
<<<<<<< HEAD
    return app.get(JobsService).ensureJob(tx, facts);
=======
    return { jobId: randomUUID() };
>>>>>>> origin/main
  } };
  const withJobs = new OrdersService(prisma, idempotency, quotes, invoices, jobs);
  const { quote } = await acceptedQuote();
  const order = (await withJobs.confirm({ quoteId: quote.id }, key(), staff(sales))).data;
  assert.ok(order.jobId);
  assert.deepEqual([calls[0].capacityKw, calls[0].systemType, calls[0].quoteId], [1, 'ON_GRID', quote.id]);

  const failing = new OrdersService(prisma, idempotency, quotes, invoices, { ensureJob: async () => { throw new Error('jobs unavailable'); } });
  const second = await acceptedQuote();
  const k = key();
  await assert.rejects(failing.confirm({ quoteId: second.quote.id }, k, staff(sales)), /jobs unavailable/);
  assert.equal(await prisma.order.count({ where: { quoteId: second.quote.id } }), 0);
  assert.equal(await prisma.invoice.count({ where: { order: { quoteId: second.quote.id } } }), 0);
  assert.equal(await prisma.command.count({ where: { idempotencyKey: k } }), 0, 'the same key can be retried');
});

test('the database refuses invoice figures that disagree with each other', async () => {
  const { quote } = await acceptedQuote();
  const { invoice } = (await orders.confirm({ quoteId: quote.id }, key(), staff(sales))).data;
  for (const data of [{ paidAmount: '60000.00', status: 'PAID' }, { paidAmount: '100.00', status: 'POSTED' }, { total: '1.00' }]) {
    await assert.rejects(prisma.invoice.update({ where: { id: invoice.id }, data }), JSON.stringify(data));
  }
  await assert.rejects(prisma.$executeRawUnsafe(
    `INSERT INTO payments (id, "invoiceId", amount, method, reference, kind, "receivedAt", "recordedById")
     VALUES ($1::uuid, $2::uuid, 'NaN', 'CASH', $3, 'ADVANCE', now(), $4::uuid)`, randomUUID(), invoice.id, reference(), admin.id,
  ), 'NaN payment amount');
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, 'POSTED');
});

async function login(account) {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email: account.email, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}
const post = (path, cookie, body, idempotencyKey) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { cookie, origin, 'content-type': 'application/json', ...(idempotencyKey && { 'idempotency-key': idempotencyKey }) },
  body: JSON.stringify(body),
});

test('HTTP: sales confirms with a key, only admin records receipts, warehouse reads only the fulfilment view', async () => {
  const { enquiry, quote } = await acceptedQuote();
  const [salesCookie, adminCookie, warehouseCookie] = [await login(sales), await login(admin), await login(warehouse)];
  assert.equal((await post('/orders', salesCookie, { quoteId: quote.id })).status, 400, 'Idempotency-Key is required');
  assert.equal((await post('/orders', warehouseCookie, { quoteId: quote.id }, key())).status, 403);
  assert.equal((await post('/orders', salesCookie, { quoteId: quote.id, total: '1.00' }, key())).status, 400, 'no client totals');
  const confirmed = await post('/orders', salesCookie, { quoteId: quote.id }, key());
  assert.equal(confirmed.status, 201);
  const { data: order } = await confirmed.json();

  const receipt = { amountInr: '25000', method: 'BANK_TRANSFER', reference: reference(), receivedAt: new Date().toISOString() };
  assert.equal((await post(`/invoices/${order.invoice.id}/payments`, salesCookie, receipt, key())).status, 403, 'viewing an order does not grant posting money');
  const paid = await post(`/invoices/${order.invoice.id}/payments`, adminCookie, receipt, key());
  assert.equal(paid.status, 201);
  assert.equal((await paid.json()).data.balance, '30000.00');

  assert.equal((await fetch(`${base}/orders/${order.id}`, { headers: { cookie: warehouseCookie } })).status, 403, 'no invoice or references');
  const read = await fetch(`${base}/orders/${order.id}/fulfilment`, { headers: { cookie: warehouseCookie } });
  assert.equal(read.status, 200);
  const { data: fulfilment } = await read.json();
  assert.equal(fulfilment.released, true);
  assert.equal(fulfilment.packing.length, order.packing.length);
  assert.deepEqual(Object.keys(fulfilment).filter((field) => ['invoice', 'customerId', 'quoteId', 'confirmedById'].includes(field)), []);
  const byEnquiry = await fetch(`${base}/enquiries/${enquiry.id}/order`, { headers: { cookie: salesCookie } });
  assert.equal((await byEnquiry.json()).data.id, order.id);
  const again = await post('/orders', salesCookie, { quoteId: quote.id }, key());
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error.reasons[0].code, 'ORDER_ALREADY_CONFIRMED');
});

test('a ₹0 accepted quote cannot be confirmed, because no payment could ever release it', async () => {
  // The catalogue allows zero prices; free-installation settlement is an owner policy we don't have. Temporarily
  // zero one seeded kit (restored below) rather than adding rows, so other test files still see the plain seed.
  const original = await prisma.package.findUniqueOrThrow({ where: { id: id(2005) } });
  const free = await prisma.package.update({ where: { id: original.id }, data: { hardwarePrice: '0.00', installationPrice: '0.00' } });
  try {
    const customer = await prisma.customer.create({ data: {
      name: 'Free Customer', phone: `7${String(randomInt(1e9)).padStart(9, '0')}`, addressLine: '1 Free Road', city: 'Nagpur', pincode: '440001',
    } });
    const enquiry = await prisma.enquiry.create({ data: {
      customerId: customer.id, source: 'PHONE', requestedCapacityKw: 5, status: 'QUALIFIED',
      contactName: 'Free Customer', siteAddressLine: '1 Free Road', siteCity: 'Nagpur', sitePincode: '440001',
    } });
    const survey = (await surveys.schedule(enquiry.id, { technicianId: tech.id, scheduledFor: when })).data;
    await surveys.submit(survey.id, { version: 1, ...facts }, staff(tech));
    await surveys.approve(survey.id, { version: 2 }, staff(sales));
    const draft = (await quotes.create(enquiry.id, { surveyId: survey.id, packageId: free.id }, staff(sales))).data;
    assert.equal(draft.totalPrice, '0.00');
    await quotes.send(draft.id, { version: 1, channel: 'PRINT' }, staff(sales));
    await quotes.accept(draft.id, { version: 2, acceptedByName: 'Free Customer', channel: 'IN_PERSON' }, staff(sales));
    const k = key();
    await refuses(orders.confirm({ quoteId: draft.id }, k, staff(sales)), 409, 'ORDER_TOTAL_ZERO');
    assert.equal(await prisma.order.count({ where: { quoteId: draft.id } }), 0);
    assert.equal(await prisma.command.count({ where: { idempotencyKey: k } }), 0);
  } finally {
    await prisma.package.update({ where: { id: original.id }, data: { hardwarePrice: original.hardwarePrice, installationPrice: original.installationPrice } });
  }
});
