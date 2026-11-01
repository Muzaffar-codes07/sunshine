// Independent #60/#65 regression. Real Nest services, HTTP identity, PostgreSQL, stock and costs.
// Failure injection only wraps the caller transaction after real work, to prove rollback.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID, randomInt } from 'node:crypto';
const require = createRequire(import.meta.url);
const target = process.env.TEST_DATABASE_URL;
if (!target || !/test/i.test(new URL(target).pathname)) throw Error('Explicit disposable TEST_DATABASE_URL required');
process.env.DATABASE_URL = target;
process.env.SESSION_SECRET = 'independent-shipping-proof-only-session-2026';
process.env.SESSION_COOKIE_SECURE = 'false';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/platform/prisma.service');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
const { IdempotencyService } = require('../dist/platform/idempotency');
const { SurveysService } = require('../dist/sales/surveys.service');
const { QuotesService } = require('../dist/quotes/quotes.service');
const { OrdersService } = require('../dist/orders/orders.service');
const { InvoicesService } = require('../dist/finance/invoices.service');
const { WarrantyPolicyService } = require('../dist/warranty/warranty-policy.service');
const { DispatchPostingService } = require('../dist/inventory/dispatch-posting.service');
const { DispatchScansService } = require('../dist/inventory/dispatch-scans.service');
const { StockLedgerService } = require('../dist/inventory/stock-ledger.service');
const { StockIntegrityService } = require('../dist/inventory/stock-integrity.service');
const { CostWriterService } = require('../dist/finance/cost-writer.service');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { catalogueDemoId } = require('../dist/catalog/demo-catalogue');
const { hashPassword } = require('../dist/auth/passwords');
const { Prisma } = require('../dist/generated/prisma/client');
let app, prisma, root, commands, posting, scans, ledger, policies, main;
const staff = {}, cookies = {};
const identity = row => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });
const origin = 'http://127.0.0.1:3001', password = 'independent-test-password-2026';
before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1'); root = (await app.getUrl()) + '/api/v1';
  prisma = app.get(PrismaService); commands = app.get(IdempotencyService);
  posting = app.get(DispatchPostingService); scans = app.get(DispatchScansService);
  ledger = app.get(StockLedgerService); policies = app.get(WarrantyPolicyService);
  await seedCatalogue(prisma); main = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'MAIN' } });
  for (const role of ['ADMIN', 'SALES', 'WAREHOUSE', 'TECHNICIAN']) {
    staff[role] = await prisma.user.create({ data: {
      email: randomUUID() + '@independent.test', displayName: role + ' independent reviewer', role,
      passwordHash: await hashPassword(password),
    } });
    const response = await fetch(root + '/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: staff[role].email, password }) });
    assert.equal(response.status, 200); cookies[role] = response.headers.get('set-cookie').split(';')[0];
  }
});
after(async () => { await app?.close(); });
const send = (path, body, role = 'WAREHOUSE', key = randomUUID()) => fetch(root + path, {
  method: 'POST', headers: { origin, 'content-type': 'application/json', cookie: cookies[role], 'idempotency-key': key },
  body: JSON.stringify(body),
});
const ok = async (request, status = 200) => {
  const response = await request, json = await response.json(); assert.equal(response.status, status, JSON.stringify(json)); return json.data;
};
const refused = async (request, status, code) => {
  const response = await request, json = await response.json();
  assert.equal(response.status, status, JSON.stringify(json)); assert.equal(json.error.code, code); return json;
};
const exactEffect = async order => {
  const allocations = await prisma.allocation.findMany({ where: { jobId: order.jobId }, orderBy: { id: 'asc' } });
  const document = await prisma.stockDocument.findUnique({ where: { kind_reference: { kind: 'ISSUE', reference: 'DISPATCH:' + order.dispatch.id } },
    include: { lines: { include: { movement: true } } } });
  const costs = await prisma.costEntry.findMany({ where: { jobId: order.jobId, costType: 'MATERIAL_DISPATCH' } });
  return { allocations, document, costs };
};
async function policy(productId, months) {
  const previous = (await policies.get(productId)).data;
  await policies.save(productId, {
    expectedFingerprint: previous.fingerprint, policyName: 'Independent persisted cover', revision: randomUUID(),
    scope: 'Component repair', durationMonths: months,
  }, randomUUID(), staff.ADMIN.id);
}
async function fixture() {
  const packageView = await prisma.package.findUniqueOrThrow({ where: { id: catalogueDemoId(1001) }, include: { items: { include: { product: true } } } });
  const products = packageView.items.map(item => item.product);
  for (const product of products.filter(row => row.trackingMode === 'SERIALIZED')) await policy(product.id, 24);
  const customer = await prisma.customer.create({ data: {
    name: 'Independent shipping customer', phone: '7' + String(randomInt(1e9)).padStart(9, '0'),
    addressLine: '1 Independent Road', city: 'Nagpur', pincode: '440001',
  } });
  const enquiry = await prisma.enquiry.create({ data: {
    customerId: customer.id, source: 'PHONE', status: 'QUALIFIED', requestedCapacityKw: 1,
    contactName: customer.name, siteAddressLine: customer.addressLine, siteCity: customer.city, sitePincode: customer.pincode,
  } });
  const surveys = app.get(SurveysService), quotes = app.get(QuotesService), actor = identity(staff.SALES);
  const survey = (await surveys.schedule(enquiry.id, { technicianId: staff.TECHNICIAN.id, scheduledFor: new Date().toISOString() })).data;
  await surveys.submit(survey.id, { version: 1, roofDirection: 'S', roofTiltDeg: '12', cableDistanceM: '10', usableRoofAreaSqm: '40' }, identity(staff.TECHNICIAN));
  await surveys.approve(survey.id, { version: 2 }, actor);
  const quote = (await quotes.create(enquiry.id, { surveyId: survey.id, packageId: packageView.id }, actor)).data;
  await quotes.send(quote.id, { version: 1, channel: 'PRINT' }, actor);
  await quotes.accept(quote.id, { version: 2, channel: 'IN_PERSON', acceptedByName: customer.name }, actor);
  const order = (await app.get(OrdersService).confirm({ quoteId: quote.id }, randomUUID(), actor)).data;
  await prisma.$transaction(tx => app.get(InvoicesService).recordPayment(tx, order.invoice.id,
    { amountInr: '100', method: 'UPI', reference: randomUUID(), receivedAt: new Date().toISOString() }, identity(staff.ADMIN)));
  for (const product of products) {
    const quantity = order.packing.filter(row => row.productId === product.id)
      .reduce((sum, row) => sum.add(row.quantity), new Prisma.Decimal(0));
    await ok(send('/stock/receipts', { reference: 'INDEPENDENT-' + randomUUID(), locationId: main.id,
      receivedAt: new Date().toISOString(), lines: [{
        productId: product.id, quantity: quantity.toFixed(3), unitCost: '11.23',
        serials: product.trackingMode === 'SERIALIZED' ? Array.from({ length: quantity.toNumber() }, () => 'PROOF-' + randomUUID()) : [],
      }] }), 201);
  }
  const job = await prisma.job.findUniqueOrThrow({ where: { id: order.jobId } });
  await ok(send('/orders/' + order.id + '/allocations', { expectedVersion: job.version }), 201);
  const currentJob = await prisma.job.findUniqueOrThrow({ where: { id: order.jobId } });
  const dispatch = await ok(send('/orders/' + order.id + '/dispatches', { expectedVersion: currentJob.version }), 201);
  const units = await prisma.allocation.findMany({ where: { jobId: order.jobId, unitId: { not: null } }, include: { unit: true } });
  return { ...order, dispatch, units, products };
}
async function ready(order) {
  let last = order.dispatch;
  for (const row of order.units) last = await ok(send('/dispatches/' + last.id + '/scans', {
    rawValue: row.unit.rawSerial, unitId: row.unitId, method: 'SCANNER',
  }), 201);
  return last;
}

test('real current policies cannot replace sold warranty terms; dispatch sources reconcile exactly', async () => {
  const order = await fixture(), draft = await ready(order);
  for (const row of order.products.filter(product => product.trackingMode === 'SERIALIZED')) await policy(row.id, 36);
  const posted = await ok(send('/dispatches/' + draft.id + '/dispatch', { expectedVersion: draft.version }));
  order.dispatch = posted;
  const effects = await exactEffect(order);
  assert.equal(effects.document.status, 'DONE');
  assert.equal(effects.document.lines.length, effects.allocations.length);
  assert.equal(effects.costs.length, effects.allocations.length);
  for (const line of effects.document.lines) {
    assert.ok(line.movement);
    const cost = effects.costs.find(row => row.uniqueSourceId === 'STOCK_MOVEMENT:' + line.movement.id);
    assert.ok(cost); assert.equal(cost.jobId, order.jobId);
    assert.ok(cost.amount.equals(line.quantity.mul('11.23').toDecimalPlaces(2)), 'exact frozen acquisition/average basis');
    assert.equal(cost.occurredAt.getTime(), line.movement.occurredAt.getTime());
  }
  const delivered = await ok(send('/dispatches/' + draft.id + '/deliver', { expectedVersion: posted.version, deliveredAt: new Date().toISOString() }));
  assert.equal(delivered.status, 'DELIVERED');
  const warranties = await prisma.warranty.findMany({ where: { unitId: { in: order.units.map(row => row.unitId) } } });
  assert.equal(warranties.length, order.units.length);
  assert.ok(warranties.every(row => row.durationMonths === 24), 'accepted 24 months retained despite current 36-month configuration');
  assert.ok((await app.get(StockIntegrityService).report()).data.ok);
});

test('late delivery caller failure rolls back actual coverage, allocation and command record; retry succeeds once', async () => {
  const order = await fixture(), draft = await ready(order);
  const posted = await ok(send('/dispatches/' + draft.id + '/dispatch', { expectedVersion: draft.version }));
  const key = randomUUID(), input = { expectedVersion: posted.version, deliveredAt: new Date().toISOString() };
  const wrapped = new DispatchPostingService({
    run: (command, work) => commands.run(command, async tx => { await work(tx); throw Error('independent late delivery failure'); }),
  }, scans, ledger, app.get(CostWriterService));
  await assert.rejects(wrapped.deliver(staff.WAREHOUSE.id, key, draft.id, input), /independent late delivery failure/);
  assert.equal((await prisma.dispatch.findUniqueOrThrow({ where: { id: draft.id } })).status, 'DISPATCHED');
  assert.ok((await prisma.allocation.findMany({ where: { jobId: order.jobId } })).every(row => row.status === 'DISPATCHED'));
  assert.equal(await prisma.warranty.count({ where: { unitId: { in: order.units.map(row => row.unitId) } } }), 0);
  assert.equal((await prisma.dispatch.findUniqueOrThrow({ where: { id: draft.id } })).version, posted.version);
  assert.equal(await prisma.unit.count({ where: { id: { in: order.units.map(row => row.unitId) }, status: 'DISPATCHED' } }), order.units.length);
  assert.equal(await prisma.command.count({ where: { actorId: staff.WAREHOUSE.id, idempotencyKey: key } }), 0);
  const success = await posting.deliver(staff.WAREHOUSE.id, key, draft.id, input);
  assert.deepEqual(await posting.deliver(staff.WAREHOUSE.id, key, draft.id, input), success);
  assert.equal(await prisma.warranty.count({ where: { unitId: { in: order.units.map(row => row.unitId) } } }), order.units.length);
});

test('distinct concurrent delivery intents cannot choose two dates or duplicate coverage and costs', async () => {
  const order = await fixture(), draft = await ready(order);
  const posted = await ok(send('/dispatches/' + draft.id + '/dispatch', { expectedVersion: draft.version }));
  const now = new Date().toISOString(), input = { expectedVersion: posted.version, deliveredAt: now };
  const alternate = { ...input, deliveredAt: posted.dispatchedAt };
  const results = await Promise.all([send('/dispatches/' + draft.id + '/deliver', input), send('/dispatches/' + draft.id + '/deliver', alternate)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(await prisma.warranty.count({ where: { unitId: { in: order.units.map(row => row.unitId) } } }), order.units.length);
  assert.equal(await prisma.costEntry.count({ where: { jobId: order.jobId } }), order.packing.reduce((count, row) => {
    const product = order.products.find(item => item.id === row.productId);
    return count + (product.trackingMode === 'SERIALIZED' ? Number(row.quantity) : 1);
  }, 0));
  assert.ok([now, alternate.deliveredAt].includes((await prisma.dispatch.findUniqueOrThrow({ where: { id: draft.id } })).deliveredAt.toISOString()));
});

test('one millisecond before actual delivery refuses start without recording intent; exact boundary and replay work', async () => {
  const order = await fixture(), draft = await ready(order);
  const posted = await ok(send('/dispatches/' + draft.id + '/dispatch', { expectedVersion: draft.version }));
  const deliveredAt = new Date().toISOString();
  await ok(send('/dispatches/' + draft.id + '/deliver', { expectedVersion: posted.version, deliveredAt }));
  let job = await prisma.job.findUniqueOrThrow({ where: { id: order.jobId } });
  await ok(send('/jobs/' + order.jobId + '/schedule', {
    expectedVersion: job.version, scheduledStart: deliveredAt,
    scheduledFinish: new Date(Date.parse(deliveredAt) + 3600000).toISOString(), technicianIds: [staff.TECHNICIAN.id],
  }, 'ADMIN'));
  job = await prisma.job.findUniqueOrThrow({ where: { id: order.jobId } });
  const key = randomUUID();
  const error = await refused(send('/jobs/' + order.jobId + '/start', {
    expectedVersion: job.version, startedAt: new Date(Date.parse(deliveredAt) - 1).toISOString(),
  }, 'TECHNICIAN', key), 409, 'INSTALLATION_TIME_INVALID');
  assert.ok(error.error.reasons.length);
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: order.jobId } })).version, job.version);
  assert.equal(await prisma.command.count({ where: { actorId: staff.TECHNICIAN.id, idempotencyKey: key } }), 0);
  const body = { expectedVersion: job.version, startedAt: deliveredAt };
  const first = await ok(send('/jobs/' + order.jobId + '/start', body, 'TECHNICIAN', key));
  assert.equal(first.status, 'IN_PROGRESS');
  assert.deepEqual(await ok(send('/jobs/' + order.jobId + '/start', body, 'TECHNICIAN', key)), first);
  await refused(send('/jobs/' + order.jobId + '/start', { ...body, startedAt: new Date().toISOString() }, 'TECHNICIAN', key), 409, 'IDEMPOTENCY_CONFLICT');
});

test('deactivated warehouse session cannot dispatch even with a saved cookie and forged role header', async () => {
  const order = await fixture(), draft = await ready(order);
  await prisma.user.update({ where: { id: staff.WAREHOUSE.id }, data: { active: false } });
  try {
    const response = await fetch(root + '/dispatches/' + draft.id + '/dispatch', {
      method: 'POST', headers: { origin, 'content-type': 'application/json', cookie: cookies.WAREHOUSE,
        'idempotency-key': randomUUID(), 'x-role': 'ADMIN' }, body: JSON.stringify({ expectedVersion: draft.version }),
    });
    assert.equal(response.status, 401);
    assert.equal((await prisma.dispatch.findUniqueOrThrow({ where: { id: draft.id } })).status, 'DRAFT');
    assert.equal(await prisma.costEntry.count({ where: { jobId: order.jobId } }), 0);
  } finally { await prisma.user.update({ where: { id: staff.WAREHOUSE.id }, data: { active: true } }); }
});
