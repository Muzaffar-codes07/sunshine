// Real PostgreSQL tests for site surveys. Same isolation rule as enquiries.db.test.mjs:
// only runs against TEST_DATABASE_URL naming a disposable "test" database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) {
  throw new Error('Set TEST_DATABASE_URL to a disposable database whose name contains "test"; refusing to write to another database.');
}
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'survey-tests-only-session-secret-0000';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
process.env.SESSION_COOKIE_SECURE = 'false';

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
const { PrismaService } = require('../dist/platform/prisma.service');
const { SurveysService } = require('../dist/sales/surveys.service');
const { hashPassword } = require('../dist/auth/passwords');

let app;
let base;
let prisma;
let surveys;
let sales;
let technician;
let otherTechnician;
const password = 'survey-test-password-2026';
const origin = 'http://127.0.0.1:3001';
const when = '2026-11-02T05:00:00.000Z';
const facts = { roofDirection: 'S', roofTiltDeg: '18.5', cableDistanceM: '22.00', usableRoofAreaSqm: '30.00' };

const phone = () => `7${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 10)}`;
const user = async (role) => prisma.user.create({ data: {
  email: `${randomUUID()}@test.local`, displayName: `${role} tester`, passwordHash: await hashPassword(password), role,
} });
const staff = (row) => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });

async function enquiry(status = 'QUALIFIED') {
  const customer = await prisma.customer.create({ data: {
    name: 'Survey Test', phone: phone(), addressLine: '9 Survey Lane', city: 'Pune', pincode: '411001',
  } });
  return prisma.enquiry.create({ data: {
    customerId: customer.id, source: 'PHONE', requestedCapacityKw: 3, status,
    contactName: 'Survey Test', siteAddressLine: '9 Survey Lane', siteCity: 'Pune', sitePincode: '411001',
  } });
}

const rejectsWith = (promise, status, code) => assert.rejects(promise, (error) => {
  assert.equal(error.getStatus(), status);
  assert.equal(error.code, code);
  return true;
});

const quoteCheck = (surveyId) => prisma.$transaction((tx) => surveys.requireApprovedSurvey(tx, surveyId));

/** Schedules, submits and approves one revision; returns the approved survey. */
async function approvedSurvey(enquiryId) {
  const scheduled = (await surveys.schedule(enquiryId, { technicianId: technician.id, scheduledFor: when })).data;
  await surveys.submit(scheduled.id, { version: 1, ...facts }, staff(technician));
  return (await surveys.approve(scheduled.id, { version: 2 }, staff(sales))).data;
}

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  base = `${await app.getUrl()}/api/v1`;
  prisma = app.get(PrismaService);
  surveys = app.get(SurveysService);
  sales = await user('SALES');
  technician = await user('TECHNICIAN');
  otherTechnician = await user('TECHNICIAN');
});

after(async () => {
  await app?.close();
});

test('schedule, submit and approve one revision; only then can a quote use it', async () => {
  const row = await enquiry();
  const scheduled = (await surveys.schedule(row.id, { technicianId: technician.id, scheduledFor: when })).data;
  assert.equal(scheduled.revision, 1);
  assert.equal(scheduled.status, 'SCHEDULED');
  assert.equal(scheduled.site.addressLine, '9 Survey Lane');
  await rejectsWith(quoteCheck(scheduled.id), 409, 'SURVEY_NOT_APPROVED');

  const mine = await surveys.assigned(staff(technician));
  assert.ok(mine.data.items.some((item) => item.id === scheduled.id));

  const submitted = (await surveys.submit(scheduled.id, { version: 1, ...facts, notes: 'Water tank on north side' }, staff(technician))).data;
  assert.equal(submitted.status, 'SUBMITTED');
  assert.equal(submitted.roofTiltDeg, '18.5');
  assert.equal(submitted.cableDistanceM, '22.00');
  await rejectsWith(quoteCheck(scheduled.id), 409, 'SURVEY_NOT_APPROVED');

  const approved = (await surveys.approve(scheduled.id, { version: 2 }, staff(sales))).data;
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.decidedBy.id, sales.id);
  assert.equal(approved.version, 3);
  assert.equal((await quoteCheck(scheduled.id)).id, scheduled.id);
  assert.ok(!(await surveys.assigned(staff(technician))).data.items.some((item) => item.id === scheduled.id), 'decided surveys leave the schedule');
});

test('a survey needs a qualified enquiry and an active technician', async () => {
  const fresh = await enquiry('NEW');
  await rejectsWith(surveys.schedule(fresh.id, { technicianId: technician.id, scheduledFor: when }), 409, 'INVALID_TRANSITION');
  await rejectsWith(surveys.schedule(randomUUID(), { technicianId: technician.id, scheduledFor: when }), 404, 'NOT_FOUND');
  const row = await enquiry();
  await assert.rejects(surveys.schedule(row.id, { technicianId: sales.id, scheduledFor: when }), (error) => {
    assert.equal(error.getStatus(), 400);
    assert.ok(error.fieldErrors.technicianId?.length);
    return true;
  });
});

test('only one revision can be open; of two simultaneous schedules exactly one wins', async () => {
  const row = await enquiry();
  const results = await Promise.allSettled([
    surveys.schedule(row.id, { technicianId: technician.id, scheduledFor: when }),
    surveys.schedule(row.id, { technicianId: otherTechnician.id, scheduledFor: when }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'SURVEY_ALREADY_OPEN');
  assert.equal(await prisma.survey.count({ where: { enquiryId: row.id } }), 1);
});

test('a rejected revision keeps its reason and blocks quoting until a new revision is approved', async () => {
  const row = await enquiry();
  const first = (await surveys.schedule(row.id, { technicianId: technician.id, scheduledFor: when })).data;
  await surveys.submit(first.id, { version: 1, ...facts }, staff(technician));
  const rejected = (await surveys.reject(first.id, { version: 2, reason: 'Cable route not measured' }, staff(sales))).data;
  assert.equal(rejected.decisionReason, 'Cable route not measured');
  await rejectsWith(quoteCheck(first.id), 409, 'SURVEY_NOT_APPROVED');
  await rejectsWith(surveys.submit(first.id, { version: 3, ...facts }, staff(technician)), 409, 'INVALID_TRANSITION');

  const second = (await surveys.schedule(row.id, { technicianId: technician.id, scheduledFor: when })).data;
  assert.equal(second.revision, 2);
  await surveys.submit(second.id, { version: 1, ...facts, cableDistanceM: '31.00' }, staff(technician));
  await surveys.approve(second.id, { version: 2 }, staff(sales));
  assert.equal((await quoteCheck(second.id)).revision, 2);
});

test('changing an approved survey opens a new revision and leaves the approval untouched', async () => {
  const row = await enquiry();
  const approved = await approvedSurvey(row.id);
  const revision = (await surveys.schedule(row.id, { technicianId: otherTechnician.id, scheduledFor: when })).data;
  assert.equal(revision.revision, 2);
  // While revision 2 is open, revision 1 can no longer be quoted from.
  await rejectsWith(quoteCheck(approved.id), 409, 'SURVEY_NOT_APPROVED');
  const kept = await prisma.survey.findUniqueOrThrow({ where: { id: approved.id } });
  assert.equal(kept.status, 'APPROVED');
  assert.equal(kept.version, 3);
  assert.equal(kept.cableDistanceM.toFixed(2), '22.00');
  await rejectsWith(surveys.approve(approved.id, { version: 3 }, staff(sales)), 409, 'INVALID_TRANSITION');
});

test('a technician sees and submits only their own surveys; stale versions are refused', async () => {
  const row = await enquiry();
  const scheduled = (await surveys.schedule(row.id, { technicianId: technician.id, scheduledFor: when })).data;
  await rejectsWith(surveys.get(scheduled.id, staff(otherTechnician)), 404, 'NOT_FOUND');
  await rejectsWith(surveys.submit(scheduled.id, { version: 1, ...facts }, staff(otherTechnician)), 404, 'NOT_FOUND');
  await rejectsWith(surveys.submit(scheduled.id, { version: 4, ...facts }, staff(technician)), 409, 'STALE_VERSION');
  const moved = (await surveys.reschedule(scheduled.id, { version: 1, technicianId: otherTechnician.id, scheduledFor: when })).data;
  assert.equal(moved.technician.id, otherTechnician.id);
  await rejectsWith(surveys.get(scheduled.id, staff(technician)), 404, 'NOT_FOUND');
  assert.equal((await surveys.get(scheduled.id, staff(otherTechnician))).data.id, scheduled.id);
});

test('the database refuses a submitted or approved survey without its facts', async () => {
  const row = await enquiry();
  const scheduled = (await surveys.schedule(row.id, { technicianId: technician.id, scheduledFor: when })).data;
  await assert.rejects(prisma.survey.update({ where: { id: scheduled.id }, data: { status: 'SUBMITTED' } }));
  await assert.rejects(prisma.survey.update({ where: { id: scheduled.id }, data: {
    status: 'APPROVED', ...facts, submittedAt: new Date(),
  } }), 'approval needs a decider');
  assert.equal((await prisma.survey.findUniqueOrThrow({ where: { id: scheduled.id } })).status, 'SCHEDULED');
});

async function login(account) {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ email: account.email, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

const post = (path, cookie, body) => fetch(`${base}${path}`, {
  method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('HTTP: sales schedules and decides, the assigned technician submits', async () => {
  const row = await enquiry();
  const salesCookie = await login(sales);
  const techCookie = await login(technician);

  assert.equal((await post(`/enquiries/${row.id}/surveys`, techCookie, { technicianId: technician.id, scheduledFor: when })).status, 403);
  const created = await post(`/enquiries/${row.id}/surveys`, salesCookie, { technicianId: technician.id, scheduledFor: when });
  assert.equal(created.status, 201);
  const { data: survey } = await created.json();

  const schedule = await fetch(`${base}/surveys/assigned`, { headers: { cookie: techCookie } });
  assert.equal(schedule.status, 200);
  assert.ok((await schedule.json()).data.items.some((item) => item.id === survey.id));
  assert.equal((await fetch(`${base}/surveys/assigned`, { headers: { cookie: salesCookie } })).status, 403);

  const blank = await post(`/surveys/${survey.id}/submit`, techCookie, { version: 1, ...facts, roofTiltDeg: '' });
  assert.equal(blank.status, 400);
  assert.ok((await blank.json()).error.fieldErrors.roofTiltDeg?.length);
  assert.equal((await post(`/surveys/${survey.id}/submit`, salesCookie, { version: 1, ...facts })).status, 403);
  assert.equal((await post(`/surveys/${survey.id}/submit`, techCookie, { version: 1, ...facts })).status, 201);

  assert.equal((await post(`/surveys/${survey.id}/approve`, techCookie, { version: 2 })).status, 403);
  const approved = await post(`/surveys/${survey.id}/approve`, salesCookie, { version: 2 });
  assert.equal(approved.status, 201);
  assert.equal((await approved.json()).data.status, 'APPROVED');

  const history = await fetch(`${base}/enquiries/${row.id}/surveys`, { headers: { cookie: salesCookie } });
  assert.deepEqual((await history.json()).data.items.map((item) => item.revision), [1]);
});
