require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ServiceService } = require('../dist/service/service.service');
const { PrismaTicketRepository } = require('../dist/service/service.repository');
const { ticketListQuerySchema, ticketListResponseSchema, serviceTicketResponseSchema } = require('@sunshine/contracts');
const { ApiError } = require('../dist/platform/api-error');

const unitId = randomUUID(), customerId = randomUUID(), jobId = randomUUID();
const row = (id = randomUUID()) => ({
  id, ticketNumber: 'SVC-READ-1', customerId, unitId, jobId, status: 'CLOSED', version: 4,
  replacedUnitId: unitId, newUnitId: randomUUID(), faultDescription: 'Inverter fault',
  assessmentSnapshot: {
    unitId, serial: 'INV-SVC-001', asOfDate: '2026-10-30',
    policyName: 'Inverter cover', policyRevision: 'v1', scope: 'Component repair',
    startDate: '2025-01-01', expiryDate: '2027-01-01', coverageStatus: 'COVERED',
    isCovered: true, reason: 'Under active manufacturer warranty', customerCharge: '0.00',
    chargeStatus: 'FREE', requestedScope: 'Component repair', assessedAt: '2026-10-30T10:10:00.000Z',
  }, resolutionDetails: 'Component replaced',
  resolvedAt: new Date('2026-10-31T10:00:00Z'), confirmedBy: 'Customer',
  confirmationChannel: 'PHONE', confirmedAt: new Date('2026-10-31T11:00:00Z'),
  confirmationNotes: 'Working', closedAt: new Date('2026-10-31T11:01:00Z'),
  createdAt: new Date('2026-10-30T10:00:00Z'), updatedAt: new Date('2026-10-31T11:01:00Z'),
});

test('read contracts bound pages and reject invalid filters', () => {
  assert.deepEqual(ticketListQuerySchema.parse({}), { page: 1, pageSize: 20 });
  assert.deepEqual(ticketListQuerySchema.parse({ page: '2', pageSize: '50', unitId, status: 'CLOSED' }),
    { page: 2, pageSize: 50, unitId, status: 'CLOSED' });
  for (const query of [{ page: '0' }, { pageSize: '51' }, { page: '1.5' }, { unitId: 'bad' },
    { status: 'UNKNOWN' }, { customerId }, { page: '10001' }]) {
    assert.equal(ticketListQuerySchema.safeParse(query).success, false);
  }
});

test('saved detail and list return the same version, lineage and confirmation; unknown ticket is 404', async () => {
  const saved = row(), calls = [];
  const service = new ServiceService({
    async findById(id) { calls.push(['get', id]); return id === saved.id ? saved : null; },
    async list(query) { calls.push(['list', query]); return { rows: [saved], total: 1 }; },
  }, {}, {});
  const detail = await service.getTicket(saved.id);
  const listed = await service.listTickets({ page: 1, pageSize: 20, unitId });
  assert.equal(serviceTicketResponseSchema.safeParse(detail).success, true);
  assert.equal(ticketListResponseSchema.safeParse(listed).success, true);
  assert.deepEqual(listed.data.items[0], detail.data);
  assert.equal(detail.data.version, 4);
  assert.equal(detail.data.newUnitId, saved.newUnitId);
  assert.deepEqual(detail.data.assessmentSnapshot, saved.assessmentSnapshot);
  assert.equal(detail.data.confirmation.confirmedAt, '2026-10-31T11:00:00.000Z');
  assert.equal(detail.data.closedAt, '2026-10-31T11:01:00.000Z');
  await assert.rejects(service.getTicket(randomUUID()), (error) => error instanceof ApiError && error.getStatus() === 404 && error.code === 'TICKET_NOT_FOUND');
  await assert.rejects(service.getTicket('bad'), (error) => error instanceof ApiError && error.getStatus() === 400);
  assert.equal(calls.filter(([name]) => name === 'list').length, 1);
});

test('repository applies deterministic bounded paging and maps missing migration to 503', async () => {
  const calls = [], saved = row();
  const repository = new PrismaTicketRepository({ serviceTicket: {
    async findMany(input) { calls.push(['findMany', input]); return [saved]; },
    async count(input) { calls.push(['count', input]); return 21; },
  } });
  const result = await repository.list({ page: 2, pageSize: 10, unitId, status: 'CLOSED' });
  assert.equal(result.total, 21);
  assert.deepEqual(result.rows, [saved]);
  assert.deepEqual(calls.find(([name]) => name === 'findMany')[1], {
    where: { unitId, status: 'CLOSED' }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: 10, take: 10,
  });
  assert.deepEqual(calls.find(([name]) => name === 'count')[1], { where: { unitId, status: 'CLOSED' } });
  const unavailable = new PrismaTicketRepository({ serviceTicket: {
    async findMany() { throw { code: 'P2021' }; }, async count() { return 0; },
  } });
  await assert.rejects(unavailable.list({ page: 1, pageSize: 20 }),
    (error) => error instanceof ApiError && error.getStatus() === 503 && error.code === 'SERVICE_SCHEMA_UNAVAILABLE');
});

test('HTTP ticket reads require an allowed staff role and cannot access data before guards pass', async () => {
  const { Module } = require('@nestjs/common');
  const { NestFactory } = require('@nestjs/core');
  const { AuthGuard } = require('../dist/auth/auth.guard');
  const { AuthService } = require('../dist/auth/auth.service');
  const { RolesGuard } = require('../dist/auth/roles.guard');
  const { ServiceReadController } = require('../dist/service/service-read.controller');
  const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
  const saved = row(); let reads = 0;
  const staff = Object.fromEntries(['SUPPORT', 'ADMIN', 'TECHNICIAN'].map((role) => [role, randomUUID()]));
  class TestModule {}
  Module({ controllers: [ServiceReadController], providers: [
    AuthGuard,
    { provide: AuthService, useValue: { async findActiveStaff(id) {
      const role = Object.keys(staff).find((name) => staff[name] === id);
      return role ? { id, role, email: 'test@example.com', displayName: role } : null;
    } } },
    RolesGuard,
    { provide: ServiceService, useValue: {
      getTicket(id) { reads++; return { data: { id } }; },
      listTickets() { reads++; return { data: { items: [], page: 1, pageSize: 20, total: 0 } }; },
    } },
  ] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  app.use((request, _response, next) => {
    request.session = { staffUserId: staff[request.header('x-test-role')] };
    next();
  });
  try {
    await app.listen(0, '127.0.0.1');
    const url = `${await app.getUrl()}/api/v1/tickets`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { 'x-test-role': 'TECHNICIAN' } })).status, 403);
    assert.equal(reads, 0);
    let response = await fetch(url, { headers: { 'x-test-role': 'SUPPORT' } });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    response = await fetch(`${url}/${saved.id}`, { headers: { 'x-test-role': 'ADMIN' } });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    response = await fetch(`${url}?pageSize=51`, { headers: { 'x-test-role': 'SUPPORT' } });
    assert.equal(response.status, 400);
    assert.equal(reads, 2);
  } finally { await app.close(); }
});
