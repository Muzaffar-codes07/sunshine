// Explicit disposable test database only; never load the application .env.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('TEST_DATABASE_URL must name a disposable test database');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'job-scheduling-tests-only-session-secret';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
process.env.SESSION_COOKIE_SECURE = 'false';
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
const { PrismaService } = require('../dist/platform/prisma.service');
const { QuotesService } = require('../dist/quotes/quotes.service');
const { SurveysService } = require('../dist/sales/surveys.service');
const { OrdersService } = require('../dist/orders/orders.service');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { catalogueDemoId: id } = require('../dist/catalog/demo-catalogue');
const { hashPassword } = require('../dist/auth/passwords');
const { Client } = require('pg');

const origin = 'http://127.0.0.1:3001';
const password = 'job-scheduling-test-password-2026';
const facts = { roofDirection: 'S', roofTiltDeg: '18.5', cableDistanceM: '22.00', usableRoofAreaSqm: '30.00' };
const start = '2026-11-03T04:00:00.000Z'; const finish = '2026-11-03T10:00:00.000Z';
const cookies = {}; const staff = {};
let app, base, prisma, quotes, surveys, orders, sql;
const identity = (row) => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });

const addStaff = async (name, role) => {
  staff[name] = await prisma.user.create({ data: { email: randomUUID() + '@test.local', displayName: name + ' scheduling tester', role, passwordHash: await hashPassword(password) } });
  return staff[name];
};
const signIn = async (name, role) => {
  const row = await addStaff(name, role);
  const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email: row.email, password }) });
  assert.equal(response.status, 200); cookies[name] = response.headers.get('set-cookie').split(';')[0];
};
before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1'); base = (await app.getUrl()) + '/api/v1';
  prisma = app.get(PrismaService); quotes = app.get(QuotesService); surveys = app.get(SurveysService); orders = app.get(OrdersService);
  await seedCatalogue(prisma);
  sql = new Client({ connectionString: testUrl }); await sql.connect();
  // The login route allows five attempts a minute per address, so only the accounts that make requests sign in.
  for (const [name, role] of [['SALES', 'SALES'], ['WAREHOUSE', 'WAREHOUSE'], ['SUPPORT', 'SUPPORT'], ['TECH_A', 'TECHNICIAN'], ['TECH_C', 'TECHNICIAN']]) await signIn(name, role);
  await addStaff('TECH_B', 'TECHNICIAN');
});
after(async () => { await sql?.end(); await app?.close(); });

const post = (route, body, role = 'SALES') => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', origin, 'idempotency-key': randomUUID(), cookie: cookies[role] }, body: JSON.stringify(body) });
const get = (route, role = 'SALES') => fetch(base + route, { headers: { cookie: cookies[role] } });
const ok = async (pending, status = 200) => {
  const response = await pending; const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); return body.data;
};
const refused = async (pending, status, code) => {
  const response = await pending; const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); assert.equal(body.error.code, code); return body.error;
};

async function newJob() {
  const customer = await prisma.customer.create({ data: { name: 'Crew Customer', phone: `7${String(randomInt(1e9)).padStart(9, '0')}`, addressLine: '6 Crew Road', city: 'Nagpur', pincode: '440001' } });
  const enquiry = await prisma.enquiry.create({ data: { customerId: customer.id, source: 'PHONE', requestedCapacityKw: 1, status: 'QUALIFIED', contactName: 'Crew Customer', siteAddressLine: '6 Crew Road', siteCity: 'Nagpur', sitePincode: '440001' } });
  const sales = identity(staff.SALES);
  const survey = (await surveys.schedule(enquiry.id, { technicianId: staff.TECH_A.id, scheduledFor: '2026-11-02T05:00:00.000Z' })).data;
  await surveys.submit(survey.id, { version: 1, ...facts }, identity(staff.TECH_A));
  await surveys.approve(survey.id, { version: 2 }, sales);
  const draft = (await quotes.create(enquiry.id, { surveyId: survey.id, packageId: id(1001) }, sales)).data;
  await quotes.send(draft.id, { version: 1, channel: 'PRINT' }, sales);
  await quotes.accept(draft.id, { version: 2, acceptedByName: 'Crew Customer', channel: 'IN_PERSON' }, sales);
  const order = (await orders.confirm({ quoteId: draft.id }, randomUUID(), sales)).data;
  return { order, jobId: order.jobId, customerId: customer.id };
}
const schedule = (jobId, body, role) => post(`/jobs/${jobId}/schedule`, { expectedVersion: 1, scheduledStart: start, scheduledFinish: finish, technicianIds: [staff.TECH_A.id], ...body }, role);
const dbJob = (jobId) => prisma.job.findUniqueOrThrow({ where: { id: jobId }, include: { assignments: true } });

test('scheduling saves the times and crew, and a new job has neither', async () => {
  const { order, jobId, customerId } = await newJob();
  const fresh = await ok(get(`/jobs/${jobId}`));
  assert.equal(fresh.version, 1); assert.equal(fresh.scheduledStart, null); assert.deepEqual(fresh.technicianIds, []);
  assert.equal(fresh.orderId, order.id); assert.equal(fresh.customerId, customerId); assert.equal(fresh.status, 'SCHEDULED');
  const done = await ok(schedule(jobId, { technicianIds: [staff.TECH_A.id, staff.TECH_B.id] }));
  assert.equal(done.version, 2); assert.equal(done.scheduledStart, start); assert.equal(done.scheduledFinish, finish);
  assert.deepEqual(done.technicianIds, [staff.TECH_A.id, staff.TECH_B.id].sort());
  assert.deepEqual(await ok(get(`/jobs/${jobId}`, 'WAREHOUSE')), done);
  const saved = await dbJob(jobId);
  assert.ok(saved.assignments.every((row) => row.assignedById === staff.SALES.id && row.removedAt === null));
});

test('a stale version is refused and changes nothing', async () => {
  const { jobId } = await newJob();
  await ok(schedule(jobId, {}));
  await refused(schedule(jobId, { technicianIds: [staff.TECH_B.id], scheduledStart: '2026-11-04T04:00:00.000Z', scheduledFinish: '2026-11-04T05:00:00.000Z' }), 409, 'STALE_VERSION');
  const saved = await dbJob(jobId);
  assert.equal(saved.version, 2); assert.equal(saved.scheduledStart.toISOString(), start);
  assert.deepEqual(saved.assignments.map((row) => row.technicianId), [staff.TECH_A.id]);
});

test('two schedules at the same moment have one winner', async () => {
  const { jobId } = await newJob();
  const results = await Promise.all([schedule(jobId, { technicianIds: [staff.TECH_A.id] }), schedule(jobId, { technicianIds: [staff.TECH_B.id] })]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const saved = await dbJob(jobId);
  assert.equal(saved.version, 2); assert.equal(saved.assignments.length, 1);
});

test('a technician sees and opens only their own jobs, and loses access when removed', async () => {
  const [mine, other] = [await newJob(), await newJob()];
  await refused(get(`/jobs/${mine.jobId}`, 'TECH_C'), 404, 'NOT_FOUND');
  await ok(schedule(mine.jobId, { technicianIds: [staff.TECH_C.id] }));
  await ok(schedule(other.jobId, { technicianIds: [staff.TECH_B.id] }));
  assert.equal((await ok(get(`/jobs/${mine.jobId}`, 'TECH_C'))).id, mine.jobId);
  await refused(get(`/jobs/${other.jobId}`, 'TECH_C'), 404, 'NOT_FOUND');
  const listed = (await ok(get('/jobs/assigned', 'TECH_C'))).map((job) => job.id);
  assert.ok(listed.includes(mine.jobId)); assert.ok(!listed.includes(other.jobId));
  await ok(post(`/jobs/${mine.jobId}/schedule`, { expectedVersion: 2, scheduledStart: start, scheduledFinish: finish, technicianIds: [staff.TECH_B.id] }));
  await refused(get(`/jobs/${mine.jobId}`, 'TECH_C'), 404, 'NOT_FOUND');
  assert.ok(!(await ok(get('/jobs/assigned', 'TECH_C'))).map((job) => job.id).includes(mine.jobId));
  const rows = (await dbJob(mine.jobId)).assignments;
  assert.equal(rows.length, 2, 'the removed technician stays as history');
  assert.ok(rows.find((row) => row.technicianId === staff.TECH_C.id).removedAt);
});

test('roles decide who can read and change jobs, including assigned technicians', async () => {
  const { jobId } = await newJob();
  await ok(schedule(jobId, { technicianIds: [staff.TECH_A.id] }));
  for (const role of ['TECH_A', 'WAREHOUSE', 'SUPPORT']) await refused(post(`/jobs/${jobId}/schedule`, { expectedVersion: 2, scheduledStart: start, scheduledFinish: finish, technicianIds: [staff.TECH_B.id] }, role), 403, 'FORBIDDEN');
  await refused(get(`/jobs/${jobId}`, 'SUPPORT'), 403, 'FORBIDDEN');
  await refused(get('/jobs', 'TECH_A'), 403, 'FORBIDDEN');
  await refused(get('/jobs', 'SUPPORT'), 403, 'FORBIDDEN');
  await refused(get('/jobs/assigned', 'SALES'), 403, 'FORBIDDEN');
  const anonymous = await fetch(`${base}/jobs/${jobId}`);
  assert.equal(anonymous.status, 401);
  assert.equal((await dbJob(jobId)).version, 2);
});

test('only active technicians can be assigned, and a refused crew changes nothing', async () => {
  const { jobId } = await newJob();
  const inactive = await prisma.user.create({ data: { email: randomUUID() + '@test.local', displayName: 'Left the company', role: 'TECHNICIAN', active: false, passwordHash: 'x' } });
  for (const technicianId of [staff.SALES.id, inactive.id, randomUUID()]) {
    await refused(schedule(jobId, { technicianIds: [staff.TECH_A.id, technicianId] }), 400, 'INVALID_INPUT');
  }
  const saved = await dbJob(jobId);
  assert.equal(saved.version, 1); assert.equal(saved.scheduledStart, null); assert.equal(saved.assignments.length, 0);
  await refused(schedule(jobId, { technicianIds: [] }), 400, 'INVALID_INPUT');
  await refused(schedule(jobId, { scheduledStart: finish, scheduledFinish: start }), 400, 'INVALID_INPUT');
  await refused(schedule(randomUUID(), {}), 404, 'NOT_FOUND');
  await refused(schedule(jobId, { technicianIds: [staff.TECH_A.id, staff.TECH_A.id.toUpperCase()] }), 400, 'INVALID_INPUT');
});

test('an upper-case technician ID is the same technician', async () => {
  const { jobId } = await newJob();
  const first = await ok(schedule(jobId, { technicianIds: [staff.TECH_A.id.toUpperCase()] }));
  assert.deepEqual(first.technicianIds, [staff.TECH_A.id]);
  const again = await ok(post(`/jobs/${jobId}/schedule`, { expectedVersion: 2, scheduledStart: start, scheduledFinish: finish, technicianIds: [staff.TECH_A.id.toUpperCase()] }));
  assert.deepEqual(again.technicianIds, [staff.TECH_A.id]);
  assert.equal((await dbJob(jobId)).assignments.length, 1);
});

test('taking a technician off and putting them back keeps both records', async () => {
  const { jobId } = await newJob();
  await ok(schedule(jobId, { technicianIds: [staff.TECH_A.id] }));
  const moved = await ok(post(`/jobs/${jobId}/schedule`, { expectedVersion: 2, scheduledStart: start, scheduledFinish: finish, technicianIds: [staff.TECH_B.id] }));
  const back = await ok(post(`/jobs/${jobId}/schedule`, { expectedVersion: moved.version, scheduledStart: start, scheduledFinish: finish, technicianIds: [staff.TECH_A.id] }));
  assert.deepEqual(back.technicianIds, [staff.TECH_A.id]);
  const rows = (await dbJob(jobId)).assignments.filter((row) => row.technicianId === staff.TECH_A.id);
  assert.equal(rows.length, 2); assert.equal(rows.filter((row) => row.removedAt === null).length, 1);
});

test('a job that has started can no longer be rescheduled', async () => {
  const { jobId } = await newJob();
  await ok(schedule(jobId, {}));
  await prisma.job.update({ where: { id: jobId }, data: { status: 'IN_PROGRESS' } });
  await refused(post(`/jobs/${jobId}/schedule`, { expectedVersion: 2, scheduledStart: start, scheduledFinish: finish, technicianIds: [staff.TECH_B.id] }), 409, 'JOB_ALREADY_STARTED');
  assert.deepEqual((await dbJob(jobId)).assignments.map((row) => row.technicianId), [staff.TECH_A.id]);
});

test('a schedule change makes an older allocation request stale', async () => {
  const { order, jobId } = await newJob();
  await ok(schedule(jobId, {}));
  await refused(post(`/orders/${order.id}/allocations`, { expectedVersion: 1 }, 'WAREHOUSE'), 409, 'STALE_VERSION');
  assert.equal((await ok(get(`/jobs/${jobId}`, 'WAREHOUSE'))).version, 2, 'the job view gives the version allocation needs');
});

test('the job list is paged and bounded', async () => {
  await newJob(); await newJob();
  const first = await ok(get('/jobs?pageSize=1'));
  assert.equal(first.items.length, 1); assert.ok(first.total >= 2); assert.equal(first.page, 1);
  const second = await ok(get('/jobs?pageSize=1&page=2'));
  assert.notEqual(second.items[0].id, first.items[0].id);
  const past = await ok(get('/jobs?pageSize=1&page=10000'));
  assert.deepEqual(past.items, []); assert.equal(past.total, first.total);
  await refused(get('/jobs?pageSize=101'), 400, 'INVALID_INPUT');
  await refused(get('/jobs?page=10001'), 400, 'INVALID_INPUT');
});

test('the database keeps times ordered and one active assignment per technician', async () => {
  const { jobId } = await newJob();
  await assert.rejects(sql.query('UPDATE jobs SET "scheduledStart" = $1, "scheduledFinish" = $2 WHERE id = $3', [finish, start, jobId]), /jobs_schedule_ordered/);
  await assert.rejects(sql.query('UPDATE jobs SET "scheduledStart" = $1 WHERE id = $2', [start, jobId]), /jobs_schedule_ordered/);
  await ok(schedule(jobId, {}));
  const insert = () => sql.query('INSERT INTO job_assignments (id, "jobId", "technicianId", "assignedById") VALUES (gen_random_uuid(), $1, $2, $3)', [jobId, staff.TECH_A.id, staff.SALES.id]);
  await assert.rejects(insert(), /job_assignments_one_active/);
  await assert.rejects(sql.query(`UPDATE job_assignments SET "removedAt" = "createdAt" - interval '1 day' WHERE "jobId" = $1`, [jobId]), /job_assignments_removed_after_created/);
  await assert.rejects(sql.query('DELETE FROM users WHERE id = $1', [staff.TECH_A.id]), /foreign key/);
});
