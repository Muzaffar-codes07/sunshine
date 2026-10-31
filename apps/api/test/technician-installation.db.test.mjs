// Explicit disposable test database and owned upload directory only; never load the application .env.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('TEST_DATABASE_URL must name a disposable test database');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'installation-tests-only-session-secret';
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
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { catalogueDemoId: id } = require('../dist/catalog/demo-catalogue');
const { hashPassword } = require('../dist/auth/passwords');
const { PrivateFileStore } = require('../dist/files/private-file.store');
const { JobFileAccess } = require('../dist/field/job-file-access');
const { Client } = require('pg');

const origin = 'http://127.0.0.1:3001';
const password = 'installation-test-password-2026';
const facts = { roofDirection: 'S', roofTiltDeg: '18.5', cableDistanceM: '22.00', usableRoofAreaSqm: '30.00' };
const jpeg = Buffer.from([255, 216, 255, 224, 0, 2, 255, 217]);
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const CHECKS = ['MOUNTING', 'PANELS', 'WIRING', 'EARTHING', 'POWER_GENERATION'];
const cookies = {}; const staff = {};
let app, base, prisma, idempotency, quotes, surveys, orders, invoices, sql, main, directory;
const identity = (row) => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });
const addStaff = async (name, role) => {
  staff[name] = await prisma.user.create({ data: { email: randomUUID() + '@test.local', displayName: name + ' installation tester', role, passwordHash: await hashPassword(password) } });
  return staff[name];
};

before(async () => {
  const parent = resolve(import.meta.dirname, '../../../var');
  await mkdir(parent, { recursive: true });
  directory = await mkdtemp(resolve(parent, 'installation-test-'));
  process.env.UPLOAD_DIR = directory;
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1'); base = (await app.getUrl()) + '/api/v1';
  prisma = app.get(PrismaService); idempotency = app.get(IdempotencyService); quotes = app.get(QuotesService); surveys = app.get(SurveysService);
  orders = app.get(OrdersService); invoices = app.get(InvoicesService);
  await seedCatalogue(prisma);
  sql = new Client({ connectionString: testUrl }); await sql.connect();
  // The login route allows five attempts a minute per address.
  for (const [name, role] of [['SALES', 'SALES'], ['ADMIN', 'ADMIN'], ['WAREHOUSE', 'WAREHOUSE'], ['TECH_A', 'TECHNICIAN'], ['TECH_B', 'TECHNICIAN']]) {
    const row = await addStaff(name, role);
    const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email: row.email, password }) });
    assert.equal(response.status, 200); cookies[name] = response.headers.get('set-cookie').split(';')[0];
  }
  await addStaff('TECH_C', 'TECHNICIAN');
  main = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'MAIN' } });
});
after(async () => { await sql?.end(); await app?.close(); await rm(directory, { recursive: true, force: true }); });

const send = (route, body, role = 'TECH_A', key = randomUUID()) => fetch(base + route, {
  method: 'POST', headers: { 'content-type': 'application/json', origin, ...(key ? { 'idempotency-key': key } : {}), cookie: cookies[role] }, body: JSON.stringify(body),
});
const get = (route, role = 'SALES') => fetch(base + route, { headers: { cookie: cookies[role] } });
const ok = async (pending, status = 200) => {
  const response = await pending; const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); return body.data;
};
const refused = async (pending, status, code) => {
  const response = await pending; const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); assert.equal(body.error.code, code); return body.error;
};
const upload = (jobId, role = 'TECH_A', bytes = jpeg, type = 'image/jpeg') => {
  const form = new FormData();
  if (jobId) { form.append('contextType', 'JOB'); form.append('contextId', jobId); }
  form.append('file', new Blob([bytes], { type }), type === 'image/jpeg' ? 'photo.jpg' : 'signature.pdf');
  return fetch(base + '/files', { method: 'POST', headers: { origin, cookie: cookies[role] }, body: form });
};

/** A confirmed, optionally paid order. Package 1001 is 1 kW On-Grid. */
async function newOrder({ paid = true, packageId = id(1001) } = {}) {
  const customer = await prisma.customer.create({ data: { name: 'Install Customer', phone: `7${String(randomInt(1e9)).padStart(9, '0')}`, addressLine: '8 Roof Road', city: 'Nagpur', pincode: '440001' } });
  const enquiry = await prisma.enquiry.create({ data: { customerId: customer.id, source: 'PHONE', requestedCapacityKw: 1, status: 'QUALIFIED', contactName: 'Install Customer', siteAddressLine: '8 Roof Road', siteCity: 'Nagpur', sitePincode: '440001' } });
  const sales = identity(staff.SALES);
  const survey = (await surveys.schedule(enquiry.id, { technicianId: staff.TECH_A.id, scheduledFor: '2026-11-02T05:00:00.000Z' })).data;
  await surveys.submit(survey.id, { version: 1, ...facts }, identity(staff.TECH_A));
  await surveys.approve(survey.id, { version: 2 }, sales);
  const draft = (await quotes.create(enquiry.id, { surveyId: survey.id, packageId }, sales)).data;
  await quotes.send(draft.id, { version: 1, channel: 'PRINT' }, sales);
  await quotes.accept(draft.id, { version: 2, acceptedByName: 'Install Customer', channel: 'IN_PERSON' }, sales);
  const order = (await orders.confirm({ quoteId: draft.id }, randomUUID(), sales)).data;
  // Backdated, so each job can have its own window of past work.
  await prisma.order.update({ where: { id: order.id }, data: { confirmedAt: new Date('2026-01-01T00:00:00.000Z') } });
  if (paid) {
    const receipt = { amountInr: '1000.00', method: 'UPI', reference: `UTR${randomUUID().slice(0, 12)}`, receivedAt: new Date().toISOString() };
    await idempotency.run({ actorId: staff.ADMIN.id, key: randomUUID(), action: 'PAYMENT_RECEIPT', payload: receipt }, (tx) => invoices.recordPayment(tx, order.invoice.id, receipt, identity(staff.ADMIN)));
  }
  return order;
}
const version = async (jobId) => (await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).version;
async function allocate(order) {
  const products = await prisma.product.findMany({ where: { id: { in: order.packing.map((line) => line.productId) } } });
  for (const product of products) {
    const needed = order.packing.filter((line) => line.productId === product.id).reduce((sum, line) => sum + Number(line.quantity), 0);
    const serials = product.trackingMode === 'SERIALIZED' ? Array.from({ length: needed }, () => 'SN-' + randomUUID().slice(0, 13).toUpperCase()) : [];
    await ok(send('/stock/receipts', { reference: 'REC-' + randomUUID(), locationId: main.id, receivedAt: '2026-10-30T10:00:00.000Z', lines: [{ productId: product.id, quantity: String(needed), unitCost: '10.00', serials }] }, 'WAREHOUSE'), 201);
  }
  await ok(send(`/orders/${order.id}/allocations`, { expectedVersion: await version(order.jobId) }, 'WAREHOUSE'), 201);
}
const crew = async (jobId, names = ['TECH_A']) => ok(send(`/jobs/${jobId}/schedule`, {
  expectedVersion: await version(jobId), scheduledStart: '2026-11-03T04:00:00.000Z', scheduledFinish: '2026-11-03T10:00:00.000Z', technicianIds: names.map((name) => staff[name].id),
}, 'SALES'));
let clock = Date.parse('2026-02-01T00:00:00.000Z');
/** A separate window for each job, so unrelated tests never look like overlapping labour. */
const nextWindow = () => { clock += 8 * 3_600_000; return { start: new Date(clock).toISOString(), finish: new Date(clock + 2 * 3_600_000).toISOString() }; };
const start = async (jobId, startedAt, role = 'TECH_A', key) => send(`/jobs/${jobId}/start`, { expectedVersion: await version(jobId), startedAt }, role, key);
/** Allocated, crewed, started, with a photo and a signature uploaded to the job. */
async function startedJob({ names = ['TECH_A'], window = nextWindow(), ...options } = {}) {
  const order = await newOrder(options);
  await allocate(order);
  await crew(order.jobId, names);
  await ok(start(order.jobId, window.start));
  const photo = await ok(upload(order.jobId), 201);
  const signature = await ok(upload(order.jobId, 'TECH_A', pdf, 'application/pdf'), 201);
  return { order, jobId: order.jobId, window, photo, signature };
}
const body = async (job, overrides = {}) => ({
  expectedVersion: await version(job.jobId), startedAt: job.window.start, finishedAt: job.window.finish, installedCapacityKw: 1,
  photoFileIds: [job.photo.id], signatureFileId: job.signature.id, signerName: 'Install Customer', completedChecks: CHECKS,
  timeRecords: [{ technicianId: staff.TECH_A.id, startedAt: job.window.start, finishedAt: job.window.finish }], ...overrides,
});
const complete = async (job, overrides = {}, role = 'TECH_A', key) => send(`/jobs/${job.jobId}/complete`, await body(job, overrides), role, key);
const unchanged = async (job) => {
  const row = await prisma.job.findUniqueOrThrow({ where: { id: job.jobId }, include: { photos: true, timeRecords: true } });
  assert.equal(row.status, 'IN_PROGRESS'); assert.equal(row.signatureFileId, null); assert.equal(row.finishedAt, null);
  assert.equal(row.photos.length, 0); assert.equal(row.timeRecords.length, 0);
};

test('a technician starts and completes a job, and the evidence survives a refresh', async () => {
  const job = await startedJob({ names: ['TECH_A', 'TECH_B'] });
  const seen = await ok(get(`/jobs/${job.jobId}`, 'TECH_A'));
  assert.equal(seen.status, 'IN_PROGRESS'); assert.equal(seen.startedAt, job.window.start);
  const middle = new Date(Date.parse(job.window.start) + 3_600_000).toISOString();
  const done = await ok(complete(job, { timeRecords: [
    { technicianId: staff.TECH_A.id, startedAt: job.window.start, finishedAt: middle },
    { technicianId: staff.TECH_A.id, startedAt: middle, finishedAt: job.window.finish },
    { technicianId: staff.TECH_B.id, startedAt: job.window.start, finishedAt: job.window.finish },
  ] }));
  assert.equal(done.status, 'COMPLETED'); assert.equal(done.finishedAt, job.window.finish); assert.equal(done.installedCapacityKw, 1);
  assert.deepEqual(done.photoFileIds, [job.photo.id]); assert.equal(done.signatureFileId, job.signature.id); assert.equal(done.signerName, 'Install Customer');
  assert.deepEqual(done.completedChecks, CHECKS); assert.equal(done.timeRecords.length, 3);
  assert.deepEqual(await ok(get(`/jobs/${job.jobId}`, 'WAREHOUSE')), done);
  const row = await prisma.job.findUniqueOrThrow({ where: { id: job.jobId } });
  assert.equal(row.startedById, staff.TECH_A.id); assert.equal(row.completedById, staff.TECH_A.id); assert.ok(row.completedAt);
  const records = await prisma.installationTimeRecord.findMany({ where: { jobId: job.jobId } });
  assert.ok(records.every((record) => record.recordedById === staff.TECH_A.id));
  const download = await get(`/files/${job.photo.id}`, 'SALES');
  assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), jpeg);
});

test('start needs a crew, a payment and allocated equipment, and lists every gap', async () => {
  const order = await newOrder({ paid: false });
  const window = nextWindow();
  const error = await refused(start(order.jobId, window.start, 'ADMIN'), 409, 'NOT_READY');
  assert.deepEqual(error.reasons.map((reason) => reason.code).sort(), ['JOB_MATERIAL_NOT_ALLOCATED', 'JOB_NOT_SCHEDULED', 'ORDER_NOT_RELEASED']);
  const row = await prisma.job.findUniqueOrThrow({ where: { id: order.jobId } });
  assert.equal(row.status, 'SCHEDULED'); assert.equal(row.startedAt, null); assert.equal(row.version, 1);
});

test('start refuses bad times, stale versions and people who are not on the job, and a retry replays', async () => {
  const order = await newOrder();
  await allocate(order);
  await crew(order.jobId);
  const window = nextWindow();
  await refused(start(order.jobId, new Date(Date.now() + 60_000).toISOString()), 400, 'INVALID_INPUT');
  await refused(start(order.jobId, '2025-12-31T00:00:00.000Z'), 409, 'INSTALLATION_TIME_INVALID');
  await refused(send(`/jobs/${order.jobId}/start`, { expectedVersion: 99, startedAt: window.start }), 409, 'STALE_VERSION');
  await refused(start(order.jobId, window.start, 'TECH_B'), 404, 'NOT_FOUND');
  await refused(start(order.jobId, window.start, 'SALES'), 403, 'FORBIDDEN');
  await refused(start(order.jobId, window.start, 'TECH_A', null), 400, 'INVALID_INPUT');
  const key = randomUUID();
  const v = await version(order.jobId);
  const first = await ok(send(`/jobs/${order.jobId}/start`, { expectedVersion: v, startedAt: window.start }, 'TECH_A', key));
  assert.deepEqual(await ok(send(`/jobs/${order.jobId}/start`, { expectedVersion: v, startedAt: window.start }, 'TECH_A', key)), first);
  await refused(start(order.jobId, window.start), 409, 'JOB_ALREADY_STARTED');
  await refused(send(`/jobs/${order.jobId}/schedule`, { expectedVersion: first.version, scheduledStart: window.start, scheduledFinish: window.finish, technicianIds: [staff.TECH_B.id] }, 'SALES'), 409, 'JOB_ALREADY_STARTED');
});

test('missing evidence prevents completion, lists every gap and changes nothing', async () => {
  const job = await startedJob();
  const error = await refused(complete(job, { installedCapacityKw: 3, completedChecks: ['MOUNTING', 'BATTERY'], startedAt: new Date(Date.parse(job.window.start) - 1000).toISOString(), timeRecords: [{ technicianId: staff.TECH_B.id, startedAt: job.window.start, finishedAt: job.window.finish }] }), 409, 'NOT_READY');
  const codes = error.reasons.map((reason) => reason.code);
  for (const code of ['INSTALLATION_CAPACITY_MISMATCH', 'INSTALLATION_CHECKS_MISSING', 'INSTALLATION_CHECK_NOT_APPLICABLE', 'INSTALLATION_TIME_INVALID']) assert.ok(codes.includes(code), code);
  await unchanged(job);
  await refused(complete(job, { installedCapacityKw: 2 }), 409, 'INSTALLATION_CAPACITY_MISMATCH');
  await refused(complete(job, { completedChecks: CHECKS.slice(1) }), 409, 'INSTALLATION_CHECKS_MISSING');
  await refused(complete(job, { photoFileIds: [] }), 400, 'INVALID_INPUT');
  await refused(complete(job, { signatureFileId: job.photo.id }), 400, 'INVALID_INPUT');
  await refused(complete(job, { signerName: ' ' }), 400, 'INVALID_INPUT');
  await refused(complete(job, { finishedAt: new Date(Date.now() + 60_000).toISOString(), timeRecords: [{ technicianId: staff.TECH_A.id, startedAt: job.window.start, finishedAt: new Date(Date.now() + 60_000).toISOString() }] }), 400, 'INVALID_INPUT');
  await refused(complete(job, { expectedVersion: 99 }), 409, 'STALE_VERSION');
  await unchanged(job);
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.jobId } })).version, await version(job.jobId));
  assert.equal((await ok(complete(job))).status, 'COMPLETED', 'it completes once the evidence is right');
});

test('an off-grid job also needs the battery check', async () => {
  const offGrid = await prisma.package.findFirstOrThrow({ where: { capacityKw: 1, systemType: 'OFF_GRID', active: true } });
  const job = await startedJob({ packageId: offGrid.id });
  await refused(complete(job), 409, 'INSTALLATION_CHECKS_MISSING');
  assert.equal((await ok(complete(job, { completedChecks: [...CHECKS, 'BATTERY'] }))).status, 'COMPLETED');
});

test('files must be real, on this job, the right type, and intact', async () => {
  const job = await startedJob();
  const other = await startedJob();
  await refused(complete(job, { photoFileIds: [other.photo.id] }), 409, 'FILE_ALREADY_ATTACHED');
  await refused(complete(job, { photoFileIds: [randomUUID()] }), 404, 'NOT_FOUND');
  await refused(complete(job, { photoFileIds: [job.signature.id], signatureFileId: job.photo.id }), 409, 'INSTALLATION_PHOTO_INVALID');
  const orphanByOther = await ok(upload(null, 'TECH_B'), 201);
  await refused(complete(job, { photoFileIds: [orphanByOther.id] }), 403, 'FORBIDDEN');
  const orphan = await ok(upload(null), 201);
  await refused(complete(job, { photoFileIds: [orphan.id, other.photo.id] }), 409, 'FILE_ALREADY_ATTACHED');
  assert.equal((await prisma.file.findUniqueOrThrow({ where: { id: orphan.id } })).contextId, null, 'a refused completion attaches nothing');
  await unchanged(job);
  const row = await prisma.file.findUniqueOrThrow({ where: { id: job.signature.id } });
  await app.get(PrivateFileStore).remove(row.storageKey);
  await refused(complete(job), 503, 'FILE_UNAVAILABLE');
  await unchanged(job);
  const replacement = await ok(upload(job.jobId, 'TECH_A', pdf, 'application/pdf'), 201);
  const done = await ok(complete(job, { photoFileIds: [job.photo.id, orphan.id], signatureFileId: replacement.id }));
  assert.deepEqual(done.photoFileIds, [job.photo.id, orphan.id]);
  assert.equal((await prisma.file.findUniqueOrThrow({ where: { id: orphan.id } })).contextId, job.jobId, 'a valid completion binds its own upload');
});

test('completion has one winner, a retry replays, and only started jobs can complete', async () => {
  const job = await startedJob();
  const results = await Promise.all([complete(job), complete(job)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(await prisma.installationTimeRecord.count({ where: { jobId: job.jobId } }), 1);
  await refused(complete(job), 409, 'JOB_ALREADY_COMPLETED');
  const retried = await startedJob();
  const key = randomUUID(); const payload = await body(retried);
  const first = await ok(send(`/jobs/${retried.jobId}/complete`, payload, 'TECH_A', key));
  assert.deepEqual(await ok(send(`/jobs/${retried.jobId}/complete`, payload, 'TECH_A', key)), first);
  assert.equal(await prisma.jobPhoto.count({ where: { jobId: retried.jobId } }), 1);
  const order = await newOrder();
  await crew(order.jobId);
  const window = nextWindow();
  const photo = await ok(upload(order.jobId), 201); const signature = await ok(upload(order.jobId, 'TECH_A', pdf, 'application/pdf'), 201);
  await refused(complete({ jobId: order.jobId, window, photo, signature }), 409, 'JOB_NOT_STARTED');
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: order.jobId } })).version, await version(order.jobId));
});

test('roles decide who can complete, and technicians not on the job get a 404', async () => {
  const job = await startedJob();
  await refused(complete(job, {}, 'TECH_B'), 404, 'NOT_FOUND');
  await refused(complete(job, {}, 'SALES'), 403, 'FORBIDDEN');
  await refused(complete(job, {}, 'WAREHOUSE'), 403, 'FORBIDDEN');
  await refused(complete(job, {}, 'TECH_A', null), 400, 'INVALID_INPUT');
  await unchanged(job);
  assert.equal((await ok(complete(job, {}, 'ADMIN'))).status, 'COMPLETED');
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.jobId } })).completedById, staff.ADMIN.id);
});

test('one technician cannot log overlapping time across jobs; touching times and other technicians can', async () => {
  const window = nextWindow();
  const first = await startedJob({ window });
  assert.equal((await ok(complete(first))).status, 'COMPLETED');
  const inside = new Date(Date.parse(window.start) + 3_600_000).toISOString();
  const overlapping = await startedJob({ names: ['TECH_A', 'TECH_B'], window: { start: inside, finish: new Date(Date.parse(window.finish) + 3_600_000).toISOString() } });
  await refused(complete(overlapping), 409, 'TIME_RECORD_OVERLAP');
  await unchanged(overlapping);
  assert.equal((await ok(complete(overlapping, { timeRecords: [
    { technicianId: staff.TECH_A.id, startedAt: window.finish, finishedAt: overlapping.window.finish },
    { technicianId: staff.TECH_B.id, startedAt: overlapping.window.start, finishedAt: overlapping.window.finish },
  ] }))).status, 'COMPLETED');
  await refused(complete(await startedJob(), { timeRecords: [
    { technicianId: staff.TECH_A.id.toUpperCase(), startedAt: window.start, finishedAt: inside }, { technicianId: staff.TECH_A.id, startedAt: window.start, finishedAt: inside },
  ] }), 400, 'INVALID_INPUT');
});

test('two jobs logging the same technician at the same moment have one winner', async () => {
  const window = nextWindow();
  const [one, two] = [await startedJob({ window }), await startedJob({ window })];
  const results = await Promise.all([complete(one), complete(two)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(await prisma.installationTimeRecord.count({ where: { jobId: { in: [one.jobId, two.jobId] } } }), 1);
});

test('job file rules follow the agreed table, and removal revokes access', async () => {
  const order = await newOrder();
  await crew(order.jobId, ['TECH_A', 'TECH_B']);
  const file = await ok(upload(order.jobId, 'TECH_B'), 201);
  assert.equal((await ok(upload(order.jobId, 'ADMIN'), 201)).contextId, order.jobId);
  await refused(upload(order.jobId, 'SALES'), 403, 'FORBIDDEN');
  await refused(upload(order.jobId, 'WAREHOUSE'), 403, 'FORBIDDEN');
  await refused(upload(randomUUID()), 404, 'NOT_FOUND');
  for (const role of ['ADMIN', 'SALES', 'TECH_A', 'TECH_B']) assert.equal((await get(`/files/${file.id}`, role)).status, 200, role);
  await refused(get(`/files/${file.id}`, 'WAREHOUSE'), 403, 'FORBIDDEN');
  const access = new JobFileAccess();
  const support = { ...identity(staff.TECH_C), role: 'SUPPORT' };
  await assert.rejects(access.assertAccess(prisma, support, { contextType: 'JOB', contextId: order.jobId }, 'DOWNLOAD'), (error) => error.code === 'FORBIDDEN');
  await assert.rejects(access.assertAccess(prisma, identity(staff.TECH_C), { contextType: 'JOB', contextId: order.jobId }, 'DOWNLOAD'), (error) => error.code === 'FORBIDDEN');
  await assert.rejects(access.assertAccess(prisma, identity(staff.ADMIN), { contextType: 'TICKET', contextId: order.jobId }, 'DOWNLOAD'), (error) => error.code === 'FILE_AUTHORIZATION_UNAVAILABLE');
  await crew(order.jobId, ['TECH_A']);
  await refused(get(`/files/${file.id}`, 'TECH_B'), 403, 'FORBIDDEN');
  await refused(upload(order.jobId, 'TECH_B'), 403, 'FORBIDDEN');
});

test('a completed job takes no more files, and its files can still be read', async () => {
  const job = await startedJob();
  await ok(complete(job));
  await refused(upload(job.jobId, 'TECH_A'), 409, 'JOB_ALREADY_COMPLETED');
  await refused(upload(job.jobId, 'ADMIN'), 409, 'JOB_ALREADY_COMPLETED');
  assert.equal((await get(`/files/${job.signature.id}`, 'TECH_A')).status, 200);
  assert.equal((await get(`/files/${job.signature.id}`, 'ADMIN')).status, 200);
});

test('the database keeps a job moving forward and its evidence final', async () => {
  const open = await startedJob();
  const fresh = await newOrder();
  const update = (jobId, set, ...values) => sql.query(`UPDATE jobs SET ${set} WHERE id = $1`, [jobId, ...values]);
  await assert.rejects(update(fresh.jobId, `status = 'COMPLETED'`), /cannot move from SCHEDULED to COMPLETED|jobs_started_has_time/);
  await assert.rejects(update(fresh.jobId, `status = 'IN_PROGRESS'`), /jobs_started_has_time/);
  await assert.rejects(update(open.jobId, `status = 'SCHEDULED'`), /cannot move from IN_PROGRESS to SCHEDULED/);
  await assert.rejects(update(open.jobId, `"startedAt" = now()`), /start cannot change/);
  await assert.rejects(update(open.jobId, `status = 'COMPLETED'`), /needs photos and time records/);
  await sql.query('BEGIN');
  await sql.query('ALTER TABLE jobs DISABLE TRIGGER jobs_guarded');
  await assert.rejects(update(open.jobId, `status = 'COMPLETED'`), /jobs_completed_has_evidence/);
  await sql.query('ROLLBACK');
  await assert.rejects(update(open.jobId, `"installedCapacityKw" = 9`), /jobs_capacity_range/);
  await assert.rejects(update(open.jobId, `"signerName" = ' '`), /jobs_signer_not_blank/);
  await assert.rejects(update(open.jobId, `"finishedAt" = "startedAt" - interval '1 hour'`), /jobs_finished_after_start/);
  const complete_ = `status = 'COMPLETED', "finishedAt" = $2, "completedAt" = now(), "completedById" = $3, "installedCapacityKw" = 1, "signatureFileId" = $4, "signerName" = 'X', "completedChecks" = '{MOUNTING}'`;
  await assert.rejects(update(open.jobId, complete_, open.window.finish, staff.TECH_A.id, open.signature.id), /needs photos and time records/);
  const insertPhoto = (jobId, fileId) => sql.query('INSERT INTO job_photos (id, "jobId", "fileId", position) VALUES (gen_random_uuid(), $1, $2, 1)', [jobId, fileId]);
  const insertTime = (jobId, from, to) => sql.query('INSERT INTO installation_time_records (id, "jobId", "technicianId", "startedAt", "finishedAt", "recordedById") VALUES (gen_random_uuid(), $1, $2, $3, $4, $2)', [jobId, staff.TECH_C.id, from, to]);
  const unbound = await ok(upload(null), 201);
  await assert.rejects(insertPhoto(open.jobId, unbound.id), /must be a file bound to that job/);
  await assert.rejects(insertPhoto(fresh.jobId, open.photo.id), /only be added to a job in progress/);
  await assert.rejects(insertTime(open.jobId, open.window.finish, open.window.start), /installation_time_records_ordered/);
  await insertPhoto(open.jobId, open.photo.id);
  const before = new Date(Date.parse(open.window.start) - 3_600_000).toISOString();
  await insertTime(open.jobId, before, open.window.start);
  await assert.rejects(update(open.jobId, complete_, open.window.finish, staff.TECH_A.id, open.photo.id), /separate file/);
  await assert.rejects(update(open.jobId, complete_, open.window.finish, staff.TECH_A.id, open.signature.id), /within the installation/);
  const done = await startedJob();
  await ok(complete(done));
  await assert.rejects(update(done.jobId, `"signerName" = 'Someone else'`), /evidence cannot change/);
  await assert.rejects(update(done.jobId, `"completedChecks" = '{}'`), /evidence cannot change|jobs_completed_has_evidence/);
  await assert.rejects(update(done.jobId, `status = 'IN_PROGRESS'`), /cannot move from COMPLETED/);
  for (const table of ['job_photos', 'installation_time_records']) {
    await assert.rejects(sql.query(`DELETE FROM ${table} WHERE "jobId" = $1`, [done.jobId]), /append-only/);
    await assert.rejects(sql.query(`TRUNCATE ${table}`), /append-only/);
  }
  await assert.rejects(sql.query('UPDATE installation_time_records SET "finishedAt" = now() WHERE "jobId" = $1', [done.jobId]), /append-only/);
  await assert.rejects(insertPhoto(done.jobId, unbound.id), /only be added to a job in progress/);
});
