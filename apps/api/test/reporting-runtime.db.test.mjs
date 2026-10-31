// Real production providers, real sessions and persisted source records; explicit test DB only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID, randomInt } from 'node:crypto';
const require = createRequire(import.meta.url);
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw Error('Explicit disposable _test database required');
process.env.DATABASE_URL = url;
process.env.SESSION_SECRET = 'reporting-runtime-only-test-session-secret';
process.env.SESSION_COOKIE_SECURE = 'false';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/platform/prisma.service');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { catalogueDemoId } = require('../dist/catalog/demo-catalogue');
const { hashPassword } = require('../dist/auth/passwords');
const { ReportingSourceReader } = require('../dist/reporting/reporting-readers');
const { SurveysService } = require('../dist/sales/surveys.service');
const { QuotesService } = require('../dist/quotes/quotes.service');
const { OrdersService } = require('../dist/orders/orders.service');
const { CostWriterService } = require('../dist/finance/cost-writer.service');
const { InvoicesService } = require('../dist/finance/invoices.service');
const { IdempotencyService } = require('../dist/platform/idempotency');

test('production reports reconcile persisted invoice, independent receipts and signed costs with real access and CSV', async () => {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  const base = (await app.getUrl()) + '/api/v1', prisma = app.get(PrismaService), origin = 'http://127.0.0.1:3001';
  try {
    await seedCatalogue(prisma);
    const actors = {}, cookies = {}, password = 'reporting-tests-only-password';
    for (const role of ['ADMIN', 'SALES', 'TECHNICIAN']) {
      const user = await prisma.user.create({ data: { email: `${randomUUID()}@report.test`, displayName: role, role, passwordHash: await hashPassword(password) } });
      actors[role] = { id: user.id, email: user.email, role, displayName: role };
      const login = await fetch(base + '/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
      assert.equal(login.status, 200); cookies[role] = login.headers.get('set-cookie').split(';')[0];
    }
    const started = new Date();
    const customer = await prisma.customer.create({ data: { name: 'Report Fixture', phone: `7${String(randomInt(1e9)).padStart(9,'0')}`, addressLine: '44 Roof Road', city: 'Nagpur', pincode: '440001' } });
    const enquiry = await prisma.enquiry.create({ data: { customerId: customer.id, source: 'PHONE', requestedCapacityKw: 1, status: 'QUALIFIED', contactName: customer.name, siteAddressLine: customer.addressLine, siteCity: customer.city, sitePincode: customer.pincode } });
    const surveys = app.get(SurveysService), quotes = app.get(QuotesService);
    const survey = (await surveys.schedule(enquiry.id, { technicianId: actors.TECHNICIAN.id, scheduledFor: new Date(Date.now()+86400000).toISOString() })).data;
    await surveys.submit(survey.id, { version: 1, roofDirection: 'S', roofTiltDeg: '18.5', cableDistanceM: '22.00', usableRoofAreaSqm: '30.00' }, actors.TECHNICIAN);
    await surveys.approve(survey.id, { version: 2 }, actors.SALES);
    const quote = (await quotes.create(enquiry.id, { surveyId: survey.id, packageId: catalogueDemoId(1001) }, actors.SALES)).data;
    await quotes.send(quote.id, { version: 1, channel: 'PRINT' }, actors.SALES);
    await quotes.accept(quote.id, { version: 2, acceptedByName: customer.name, channel: 'IN_PERSON' }, actors.SALES);
    const order = (await app.get(OrdersService).confirm({ quoteId: quote.id }, randomUUID(), actors.SALES)).data;
    const beforePayments = new Date();
    for (const amountInr of ['1000.00', '1000.00']) {
      const payment = { amountInr, method: 'UPI', reference: randomUUID(), receivedAt: new Date(Date.now()-86400000).toISOString() };
      await app.get(IdempotencyService).run({ actorId: actors.ADMIN.id, key: randomUUID(), action: 'PAYMENT_RECEIPT', payload: payment }, tx => app.get(InvoicesService).recordPayment(tx, order.invoice.id, payment, actors.ADMIN));
    }
    const costs = app.get(CostWriterService);
    await prisma.$transaction(async tx => {
      const original = await costs.postCost(tx, { uniqueSourceId: 'REPORT-ORIGINAL:'+randomUUID(), jobId: order.jobId, costType: 'MATERIAL_DISPATCH', amount: '500.00', occurredAt: new Date().toISOString(), description: 'Explicit synthetic posted source for reconciliation test' });
      await costs.postCost(tx, { uniqueSourceId: 'REVERSAL:'+original.id, jobId: order.jobId, costType: 'MATERIAL_DISPATCH', amount: '-500.00', reversalOfId: original.id, occurredAt: new Date().toISOString(), description: 'Full source reversal' });
      await costs.postCost(tx, { uniqueSourceId: 'REPORT-CORRECTED:'+randomUUID(), jobId: order.jobId, costType: 'MATERIAL_DISPATCH', amount: '600.00', occurredAt: new Date().toISOString(), description: 'Corrected source' });
    });
    const get = (path, role = 'ADMIN', extra = {}) => fetch(base+path, { headers: { ...(role ? { cookie: cookies[role] } : {}), ...extra } });
    for (const path of ['/reports/overview', '/reports/profitability?jobId='+order.jobId, '/reports/subsidies', '/reports/operations', '/reports/export.csv?report=overview']) {
      assert.equal((await get(path, null, {'x-role':'ADMIN'})).status, 401);
      assert.equal((await get(path, 'SALES')).status, 403);
      assert.equal((await get(path, 'TECHNICIAN')).status, 403);
    }
    const response = await get('/reports/profitability?jobId='+order.jobId.toUpperCase());
    assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store'); const result = (await response.json()).data;
    assert.equal(result.jobId, order.jobId); assert.equal(result.invoicedRevenue, '55000.00'); assert.equal(result.cashReceived, '2000.00');
    assert.equal(result.actualCost,'600.00'); assert.equal(result.contribution,'54400.00'); assert.equal(result.outstanding,'53000.00'); assert.equal(result.isProvisional,true);
    const csv = await get('/reports/export.csv?report=profitability&jobId='+order.jobId);
    assert.equal(csv.status,200); assert.match(csv.headers.get('content-type'), /text\/csv/);
    const rows = (await csv.text()).trim().split(/\r?\n/).map(row => row.split(','));
    const values = Object.fromEntries(rows[0].map((key,index)=>[key.replaceAll('"',''),rows[1][index].replaceAll('"','')]));
    assert.equal(values.invoicedRevenue,result.invoicedRevenue); assert.equal(values.cashReceived,result.cashReceived); assert.equal(values.actualCost,result.actualCost);
    const source = app.get(ReportingSourceReader);
    const cutoff = new Date();
    const activity = await prisma.$transaction(tx => source.readPeriod(tx, { start: started, end: new Date(cutoff.getTime()+1), asOf: cutoff }));
    assert.deepEqual(activity.invoices,[{amount:'55000.00'}]); assert.deepEqual(activity.payments,[], 'backdated receipt is not cash received today');
    const oldWindow = { start: new Date(started.getTime()-2*86400000), end: started, asOf: cutoff };
    const before = await prisma.$transaction(tx => source.readPeriod(tx,{...oldWindow,asOf:beforePayments}));
    const after = await prisma.$transaction(tx => source.readPeriod(tx,oldWindow));
    assert.equal(after.payments.length,before.payments.length+2,'two late-entered receipts appear only after their recording cutoff');
    const operations = await get('/reports/operations?pageSize=50'); assert.equal(operations.status,200);
    const work = (await operations.json()).data; assert.equal(work.jobs.total, await prisma.job.count({where:{status:{not:'COMPLETED'}}}));
    assert.equal(work.tickets.total,await prisma.serviceTicket.count({where:{status:{not:'CLOSED'}}}));
    assert.equal((await get('/reports/operations?pageSize=10000')).status,400);
    const pay = await get('/reports/pay-summary'); assert.equal(pay.status,503); assert.equal((await pay.json()).error.code,'REPORTING_TIME_SOURCE_UNAVAILABLE');
    assert.equal((await get('/reports/profitability?jobId='+randomUUID())).status,404);
    await prisma.user.update({where:{id:actors.ADMIN.id},data:{active:false}});
    assert.equal((await get('/reports/overview')).status,401);
  } finally { await app.close(); }
});
