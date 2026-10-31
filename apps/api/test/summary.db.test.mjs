// Real PostgreSQL test for the D2 project summary. Only runs against a disposable TEST_DATABASE_URL.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('Disposable TEST_DATABASE_URL required');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'summary-tests-only-session-secret-2026';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
process.env.SESSION_COOKIE_SECURE = 'false';

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
const { PrismaService } = require('../dist/platform/prisma.service');
const { IdempotencyService } = require('../dist/platform/idempotency');
const { EnquiryQueueService } = require('../dist/sales/enquiry-queue.service');
const { SurveysService } = require('../dist/sales/surveys.service');
const { QuotesService } = require('../dist/quotes/quotes.service');
const { OrdersService } = require('../dist/orders/orders.service');
const { InvoicesService } = require('../dist/finance/invoices.service');
const { ProjectSummaryService } = require('../dist/summary/project-summary.service');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { catalogueDemoId: id } = require('../dist/catalog/demo-catalogue');
const { hashPassword } = require('../dist/auth/passwords');

let app, base, prisma, idempotency, queue, surveys, quotes, orders, invoices, summaries, sales, admin, tech;
const password = 'summary-test-password-2026';
const when = '2026-11-02T05:00:00.000Z';
const staff = (row) => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });
const user = async (role) => prisma.user.create({ data: {
  email: `${randomUUID()}@test.local`, displayName: `${role} summary tester`, role, passwordHash: await hashPassword(password),
} });

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  base = `${await app.getUrl()}/api/v1`;
  prisma = app.get(PrismaService);
  [idempotency, queue, surveys, quotes, orders, invoices, summaries] = [
    IdempotencyService, EnquiryQueueService, SurveysService, QuotesService, OrdersService, InvoicesService, ProjectSummaryService,
  ].map((type) => app.get(type));
  await seedCatalogue(prisma);
  [sales, admin, tech] = await Promise.all(['SALES', 'ADMIN', 'TECHNICIAN'].map(user));
});

after(async () => {
  await app?.close();
});

test('the summary follows one customer from enquiry to fully paid, with the right next step at each point', async () => {
  const customer = await prisma.customer.create({ data: {
    name: 'Summary Customer', phone: `8${String(randomInt(1e9)).padStart(9, '0')}`, addressLine: '4 Summary Street', city: 'Indore', pincode: '452001',
  } });
  const enquiry = await prisma.enquiry.create({ data: {
    customerId: customer.id, source: 'WEB', requestedCapacityKw: 1, contactName: 'Summary Customer',
    siteAddressLine: '4 Summary Street', siteCity: 'Indore', sitePincode: '452001',
  } });
  const seen = [];
  const check = async (stage, code) => {
    const { data } = await summaries.get(enquiry.id);
    seen.push(`${data.stage}/${data.nextStep.code}`);
    assert.deepEqual([data.stage, data.nextStep.code], [stage, code]);
    return data;
  };

  await check('ENQUIRY', 'QUALIFY_ENQUIRY');
  await queue.qualify(enquiry.id, { version: 1, shadowFreeRoofAreaSqm: '25.00', monthlyBillInr: '2500.00', gridConnectionSuitable: true, outcome: 'QUALIFIED' });
  await check('SURVEY', 'SCHEDULE_SURVEY');
  const survey = (await surveys.schedule(enquiry.id, { technicianId: tech.id, scheduledFor: when })).data;
  assert.match((await check('SURVEY', 'RECORD_SURVEY')).nextStep.text, /summary tester records/);
  await surveys.submit(survey.id, { version: 1, roofDirection: 'S', roofTiltDeg: '15.0', cableDistanceM: '18.00', usableRoofAreaSqm: '24.00' }, staff(tech));
  await check('SURVEY', 'DECIDE_SURVEY');
  await surveys.approve(survey.id, { version: 2 }, staff(sales));
  await check('QUOTE', 'CREATE_QUOTE');
  const quote = (await quotes.create(enquiry.id, { surveyId: survey.id, packageId: id(1001) }, staff(sales))).data;
  await check('QUOTE', 'SEND_QUOTE');
  await quotes.send(quote.id, { version: 1, channel: 'WHATSAPP' }, staff(sales));
  await check('QUOTE', 'RECORD_QUOTE_DECISION');
  await quotes.accept(quote.id, { version: 2, acceptedByName: 'Summary Customer', channel: 'PHONE' }, staff(sales));
  await check('QUOTE', 'CONFIRM_ORDER');
  const order = (await orders.confirm({ quoteId: quote.id }, randomUUID(), staff(sales))).data;
  const ordered = await check('ORDER', 'RECORD_ADVANCE');
  assert.deepEqual([ordered.order.displayNumber, ordered.order.released, ordered.invoice.balance], [order.displayNumber, false, '55000.00']);

  const receive = (amountInr) => idempotency.run(
    { actorId: admin.id, key: randomUUID(), action: 'PAYMENT_RECEIPT', payload: { amountInr } },
    (tx) => invoices.recordPayment(tx, order.invoice.id, { amountInr, method: 'CASH', reference: `CASH${randomInt(1e9)}`, receivedAt: new Date().toISOString() }, staff(admin)),
  );
  await receive('20000.00');
  const advanced = await check('ORDER', 'COLLECT_BALANCE');
  assert.equal(advanced.order.released, true);
  assert.match(advanced.nextStep.text, /35000\.00/);
  await receive('35000.00');
  await check('PAID', 'NONE');
  assert.equal(seen.length, 11);
});

test('a re-survey after quoting points back to the survey; closed enquiries are history', async () => {
  const customer = await prisma.customer.create({ data: {
    name: 'Closed Customer', phone: `8${String(randomInt(1e9)).padStart(9, '0')}`, addressLine: '5 Closed Lane', city: 'Indore', pincode: '452001',
  } });
  const enquiry = await prisma.enquiry.create({ data: {
    customerId: customer.id, source: 'PHONE', requestedCapacityKw: 1, status: 'QUALIFIED', contactName: 'Closed Customer',
    siteAddressLine: '5 Closed Lane', siteCity: 'Indore', sitePincode: '452001',
  } });
  const first = (await surveys.schedule(enquiry.id, { technicianId: tech.id, scheduledFor: when })).data;
  await surveys.submit(first.id, { version: 1, roofDirection: 'E', roofTiltDeg: '10.0', cableDistanceM: '12.00', usableRoofAreaSqm: '20.00' }, staff(tech));
  await surveys.approve(first.id, { version: 2 }, staff(sales));
  await quotes.create(enquiry.id, { surveyId: first.id, packageId: id(1001) }, staff(sales));
  await surveys.schedule(enquiry.id, { technicianId: tech.id, scheduledFor: when });
  assert.equal((await summaries.get(enquiry.id)).data.nextStep.code, 'RECORD_SURVEY');

  const closed = await prisma.enquiry.create({ data: {
    customerId: customer.id, source: 'PHONE', requestedCapacityKw: 2, status: 'ARCHIVED', closedReason: 'Customer moved away',
    contactName: 'Closed Customer', siteAddressLine: '5 Closed Lane', siteCity: 'Indore', sitePincode: '452001',
  } });
  const history = (await summaries.get(closed.id)).data;
  assert.deepEqual([history.stage, history.nextStep.code], ['CLOSED', 'NONE']);
  await assert.rejects(summaries.get(randomUUID()), (error) => error.getStatus() === 404);
});

test('HTTP: sales and admin read the summary; other roles cannot', async () => {
  const login = async (account) => {
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3001' },
      body: JSON.stringify({ email: account.email, password }),
    });
    return response.headers.get('set-cookie').split(';')[0];
  };
  const enquiry = await prisma.enquiry.findFirstOrThrow();
  assert.equal((await fetch(`${base}/enquiries/${enquiry.id}/summary`, { headers: { cookie: await login(sales) } })).status, 200);
  assert.equal((await fetch(`${base}/enquiries/${enquiry.id}/summary`, { headers: { cookie: await login(tech) } })).status, 403);
  assert.equal((await fetch(`${base}/enquiries/${enquiry.id}/summary`)).status, 401);
});
