require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ServiceService } = require('../dist/service/service.service');
const { PrismaTicketRepository } = require('../dist/service/service.repository');
const { ServiceTicketAccess, UnavailableServiceTicketAccess } = require('../dist/service/service-access');
const { WarrantyService } = require('../dist/warranty/warranty.service');
const { ApiError } = require('../dist/platform/api-error');
const { serviceTicketResponseSchema, apiErrorSchema } = require('@sunshine/contracts');

const unitId = randomUUID(), jobId = randomUUID(), customerId = randomUUID();
const equipment = { unit: { id: unitId, serial: 'INV-SVC-001', manufacturerId: randomUUID(), productId: randomUUID() },
  customer: { id: customerId, name: 'Anita Sharma' }, job: { id: jobId } };
const policy = { unitId, policyName: 'Inverter components', policyRevision: 'v1', scope: 'Component repair',
  startDate: new Date('2024-01-01T00:00:00Z'), expiryDate: new Date('2026-01-01T00:00:00Z'), active: true };
const assess = { version: 1, asOfDate: '2025-07-01T10:00:00+05:30', requestedScope: 'Component repair' };
const code = (status, name) => (error) => error instanceof ApiError && error.getStatus() === status && error.code === name;

function setup() {
  const rows = new Map(), calls = [];
  const units = { async findById() { calls.push('equipment'); return structuredClone(equipment); } };
  const warranties = { async findByUnitId() { calls.push('warranty'); return structuredClone(policy); } };
  // This double models atomic CAS; it is not PostgreSQL integration evidence.
  const repository = {
    async create(input) {
      calls.push('create');
      const row = { ...input, id: randomUUID(), status: 'OPEN', version: 1,
        assessmentSnapshot: null, resolutionDetails: null, resolvedAt: null,
        confirmedBy: null, confirmationChannel: null, confirmedAt: null, confirmationNotes: null, closedAt: null,
        createdAt: new Date('2025-01-01T00:00:00Z'), updatedAt: new Date('2025-01-01T00:00:00Z') };
      rows.set(row.id, structuredClone(row)); return structuredClone(row);
    },
    async findById(id) { calls.push('read'); return structuredClone(rows.get(id) ?? null); },
    async transition(current, patch) {
      calls.push('transition');
      const row = rows.get(current.id);
      if (!row || row.version !== current.version || row.status !== current.status) throw new ApiError(409, 'STALE_VERSION', 'Changed');
      const result = { ...row, ...structuredClone(patch), version: row.version + 1, updatedAt: new Date() };
      rows.set(row.id, result); return structuredClone(result);
    },
  };
  const service = new ServiceService(repository, new WarrantyService(units, warranties), units);
  return { service, repository, units, warranties, rows, calls };
}

async function opened(fixture) {
  return (await fixture.service.createTicket({ unitId, faultDescription: ' ERR-04: ground fault ' })).data;
}
async function awaiting(fixture) {
  const ticket = await opened(fixture);
  await fixture.service.assessTicket(ticket.id, assess);
  const resolved = (await fixture.service.resolveTicket(ticket.id, { version: 2, resolutionDetails: 'Replaced faulty component and tested' })).data;
  return resolved;
}
const confirmation = () => ({ version: 3, confirmerName: ' Anita Sharma ', channel: 'PHONE', confirmedAt: new Date().toISOString(), notes: 'Customer confirmed operation by phone' });

test('complete lifecycle persists explained assessment, resolution and customer confirmation separately', async () => {
  const f = setup();
  const ticket = await opened(f);
  assert.equal(ticket.status, 'OPEN'); assert.equal(ticket.version, 1);
  assert.equal(ticket.customerId, customerId); assert.equal(ticket.jobId, jobId);
  assert.equal(ticket.faultDescription, 'ERR-04: ground fault');
  assert.equal(ticket.confirmation, null); assert.equal(ticket.closedAt, null);
  const assessed = await f.service.assessTicket(ticket.id, assess);
  assert.equal(assessed.data.status, 'ASSESSED');
  const snapshot = structuredClone(assessed.data.assessmentSnapshot);
  assert.equal(snapshot.isCovered, true); assert.equal(snapshot.customerCharge, '0.00');
  assert.equal(snapshot.asOfDate, '2025-07-01'); assert.equal(snapshot.policyRevision, 'v1');
  assert.equal(snapshot.requestedScope, 'Component repair'); assert.ok(snapshot.assessedAt);
  const resolved = await f.service.resolveTicket(ticket.id, { version: 2, resolutionDetails: ' Repaired and tested ' });
  assert.equal(resolved.data.status, 'AWAITING_CUSTOMER_CONFIRMATION');
  assert.equal(resolved.data.resolutionDetails, 'Repaired and tested'); assert.ok(resolved.data.resolvedAt);
  assert.equal(resolved.data.closedAt, null);
  // Later policy edits do not replace the saved decision or trigger a new evaluation.
  f.warranties.findByUnitId = async () => { throw new Error('Must use saved assessment'); };
  const closed = await f.service.confirmClosure(ticket.id, confirmation());
  assert.equal(closed.data.status, 'CLOSED'); assert.equal(closed.data.version, 4);
  assert.equal(closed.data.confirmation.confirmerName, 'Anita Sharma');
  assert.equal(closed.data.confirmation.channel, 'PHONE');
  assert.ok(new Date(closed.data.closedAt) >= new Date(closed.data.confirmation.confirmedAt));
  assert.deepEqual(closed.data.assessmentSnapshot, snapshot);
  assert.equal(serviceTicketResponseSchema.safeParse(closed).success, true);
});

test('expired and out-of-scope decisions stay charge-pending in the snapshot', async () => {
  for (const input of [{ ...assess, asOfDate: '2026-01-01T00:00:00+05:30' }, { ...assess, requestedScope: 'Labour' }]) {
    const f = setup(), ticket = await opened(f);
    const snapshot = (await f.service.assessTicket(ticket.id, input)).data.assessmentSnapshot;
    assert.equal(snapshot.isCovered, false); assert.equal(snapshot.customerCharge, null);
    assert.equal(snapshot.chargeStatus, 'PENDING_ASSESSMENT');
    assert.equal(snapshot.requestedScope, input.requestedScope);
    assert.equal(snapshot.coverageStatus, input.requestedScope === 'Labour' ? 'OUT_OF_SCOPE' : 'EXPIRED');
  }
});

test('ticket responses retain replacement lineage through resolution and confirmed closure', async () => {
  const f = setup(), ticket = await opened(f), newUnitId = randomUUID();
  assert.equal(ticket.replacedUnitId, null); assert.equal(ticket.newUnitId, null);
  await f.service.assessTicket(ticket.id, assess);
  Object.assign(f.rows.get(ticket.id), { replacedUnitId: unitId, newUnitId });
  const resolved = await f.service.resolveTicket(ticket.id, { version: 2, resolutionDetails: 'Replacement tested' });
  assert.equal(resolved.data.unitId, unitId); assert.equal(resolved.data.replacedUnitId, unitId); assert.equal(resolved.data.newUnitId, newUnitId);
  const closed = await f.service.confirmClosure(ticket.id, confirmation());
  assert.equal(closed.data.replacedUnitId, unitId); assert.equal(closed.data.newUnitId, newUnitId);
  assert.equal(serviceTicketResponseSchema.safeParse(closed).success, true);
});

test('creation rejects forged linkage/status and uninstalled, missing or mismatched equipment', async () => {
  const f = setup();
  for (const input of [null, {}, { unitId, faultDescription: ' ' }, { unitId: 'bad', faultDescription: 'fault' },
    ...['customerId', 'jobId', 'status', 'assessmentSnapshot'].map((key) => ({ unitId, faultDescription: 'fault', [key]: 'forged' }))]) {
    await assert.rejects(f.service.createTicket(input), code(400, 'INVALID_INPUT'));
  }
  assert.deepEqual(f.calls, []);
  for (const [record, status, name] of [[null, 404, 'UNIT_NOT_FOUND'], [{ ...equipment, job: null }, 409, 'INSTALLATION_REQUIRED'],
    [{ ...equipment, customer: null }, 409, 'INSTALLATION_REQUIRED'],
    [{ ...equipment, unit: { ...equipment.unit, id: randomUUID() } }, 503, 'INVALID_EQUIPMENT_RECORD']]) {
    f.units.findById = async () => record;
    await assert.rejects(opened(f), code(status, name));
  }
  assert.equal(f.rows.size, 0);
});

test('invalid lifecycle actions, missing records and stale versions do not change tickets', async () => {
  const f = setup(), ticket = await opened(f);
  await assert.rejects(f.service.resolveTicket(ticket.id, { version: 1, resolutionDetails: 'done' }), code(409, 'INVALID_TICKET_TRANSITION'));
  await assert.rejects(f.service.confirmClosure(ticket.id, { ...confirmation(), version: 1 }), code(409, 'INVALID_TICKET_TRANSITION'));
  await assert.rejects(f.service.assessTicket(randomUUID(), assess), code(404, 'TICKET_NOT_FOUND'));
  await assert.rejects(f.service.assessTicket('bad', assess), code(400, 'INVALID_INPUT'));
  await assert.rejects(f.service.assessTicket(ticket.id, { ...assess, version: 2 }), code(409, 'STALE_VERSION'));
  await f.service.assessTicket(ticket.id, assess);
  await assert.rejects(f.service.assessTicket(ticket.id, { ...assess, version: 2 }), code(409, 'INVALID_TICKET_TRANSITION'));
  assert.equal(f.rows.get(ticket.id).version, 2);
});

test('bad assessment input, failed warranty read or changed installation never partially assess', async () => {
  const f = setup(), ticket = await opened(f);
  for (const change of [{ asOfDate: 'invalid' }, { asOfDate: '2025-07-01' }, { asOfDate: '9999-01-01T00:00:00Z' },
    { requestedScope: ' ' }, { requestedScope: null }, { version: 0 }, { version: '1' }, { isCovered: true }]) {
    await assert.rejects(f.service.assessTicket(ticket.id, { ...assess, ...change }), code(400, 'INVALID_INPUT'));
  }
  f.units.findById = async () => ({ ...equipment, job: { id: randomUUID() } });
  await assert.rejects(f.service.assessTicket(ticket.id, assess), code(409, 'TICKET_LINK_CONFLICT'));
  f.units.findById = async () => equipment;
  const failure = new Error('warranty unavailable');
  f.warranties.findByUnitId = async () => { throw failure; };
  await assert.rejects(f.service.assessTicket(ticket.id, assess), (error) => error === failure);
  assert.equal(f.rows.get(ticket.id).status, 'OPEN');
  assert.equal(f.rows.get(ticket.id).assessmentSnapshot, null);
});

test('strict confirmation gate rejects missing/blank facts, invalid channels and timestamp order without closing', async () => {
  const f = setup(), ticket = await awaiting(f);
  const good = confirmation();
  const inputs = [null, {}, { version: 3 },
    ...['confirmerName', 'channel', 'confirmedAt'].map((key) => { const input = { ...good }; delete input[key]; return input; }),
    ...[{ confirmerName: ' ' }, { confirmerName: null }, { channel: 'EMAIL' }, { channel: null },
      { confirmedAt: '2025-01-01' }, { confirmedAt: '2025-01-01T00:00:00' },
      { confirmedAt: '2025-01-01T00:00:00Z' }, { confirmedAt: '9999-01-01T00:00:00Z' },
      { status: 'CLOSED' }, { closedAt: good.confirmedAt }].map((change) => ({ ...good, ...change }))];
  for (const input of inputs) await assert.rejects(f.service.confirmClosure(ticket.id, input), code(400, 'INVALID_INPUT'));
  assert.equal(f.rows.get(ticket.id).status, 'AWAITING_CUSTOMER_CONFIRMATION');
  assert.equal(f.rows.get(ticket.id).confirmedBy, null); assert.equal(f.rows.get(ticket.id).closedAt, null);
  await f.service.confirmClosure(ticket.id, good);
  await assert.rejects(f.service.confirmClosure(ticket.id, { ...good, version: 4 }), code(409, 'INVALID_TICKET_TRANSITION'));
  await assert.rejects(f.service.resolveTicket(ticket.id, { version: 4, resolutionDetails: 'rewrite' }), code(409, 'INVALID_TICKET_TRANSITION'));
});

test('resolution requires valid saved assessment and nonblank work notes; IN_PROGRESS is supported', async () => {
  const f = setup(), ticket = await opened(f);
  await f.service.assessTicket(ticket.id, assess);
  for (const resolutionDetails of ['', '  ', null]) {
    await assert.rejects(f.service.resolveTicket(ticket.id, { version: 2, resolutionDetails }), code(400, 'INVALID_INPUT'));
  }
  const row = f.rows.get(ticket.id), snapshot = row.assessmentSnapshot;
  for (const invalid of [null, {}, { ...snapshot, unitId: randomUUID() }]) {
    row.assessmentSnapshot = invalid;
    await assert.rejects(f.service.resolveTicket(ticket.id, { version: 2, resolutionDetails: 'done' }), code(409, 'ASSESSMENT_REQUIRED'));
  }
  row.assessmentSnapshot = snapshot; row.status = 'IN_PROGRESS';
  await f.service.resolveTicket(ticket.id, { version: 2, resolutionDetails: 'done' });
  f.rows.get(ticket.id).resolvedAt = null;
  await assert.rejects(f.service.confirmClosure(ticket.id, confirmation()), code(409, 'RESOLUTION_REQUIRED'));
});

test('concurrent assessment and confirmation requests each have one winner and preserve first facts', async () => {
  const f = setup(), ticket = await opened(f);
  const results = await Promise.allSettled([f.service.assessTicket(ticket.id, assess), f.service.assessTicket(ticket.id, assess)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(code(409, 'STALE_VERSION')(results.find((r) => r.status === 'rejected').reason));
  await f.service.resolveTicket(ticket.id, { version: 2, resolutionDetails: 'done' });
  const confirmations = await Promise.allSettled([
    f.service.confirmClosure(ticket.id, confirmation()),
    f.service.confirmClosure(ticket.id, { ...confirmation(), confirmerName: 'Different person' }),
  ]);
  assert.equal(confirmations.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(code(409, 'STALE_VERSION')(confirmations.find((r) => r.status === 'rejected').reason));
  assert.equal(f.rows.get(ticket.id).version, 4);
  assert.equal(f.rows.get(ticket.id).confirmedBy, 'Anita Sharma');
});

test('Prisma repository uses a transaction and status/version CAS for all facts', async () => {
  const calls = [], id = randomUUID();
  const tx = { serviceTicket: {
    async updateMany(query) { calls.push(['update', query]); return { count: 1 }; },
    async findUniqueOrThrow(query) { calls.push(['result', query]); return { id, version: 8 }; },
  } };
  const repository = new PrismaTicketRepository({
    async $transaction(callback) { calls.push(['transaction']); return callback(tx); },
  });
  const patch = { status: 'CLOSED', confirmedBy: 'Anita', confirmationChannel: 'PHONE', confirmedAt: new Date(), closedAt: new Date() };
  const result = await repository.transition({ id, version: 7, status: 'AWAITING_CUSTOMER_CONFIRMATION' }, patch);
  assert.equal(result.version, 8);
  assert.deepEqual(calls[1][1], { where: { id, version: 7, status: 'AWAITING_CUSTOMER_CONFIRMATION' }, data: { ...patch, version: { increment: 1 } } });
  assert.deepEqual(calls.map(([name]) => name), ['transaction', 'update', 'result']);
  tx.serviceTicket.updateMany = async () => ({ count: 0 });
  tx.serviceTicket.findUniqueOrThrow = async () => { throw new Error('Must not read a lost transition'); };
  await assert.rejects(repository.transition({ id, version: 7, status: 'ASSESSED' }, {}), code(409, 'STALE_VERSION'));
});

test('Prisma repository creates OPEN rows, reads by ID and maps missing migration/link failures', async () => {
  let query;
  const repository = new PrismaTicketRepository({ serviceTicket: {
    async create(input) { query = input; return { id: unitId }; },
    async findUnique(input) { query = input; return null; },
  } });
  await repository.create({ ticketNumber: 'SVC-001', unitId, customerId, jobId, faultDescription: 'fault' });
  assert.equal(query.data.status, 'OPEN');
  await repository.findById(unitId); assert.deepEqual(query, { where: { id: unitId } });
  for (const [dbCode, status, name] of [['P2021', 503, 'SERVICE_SCHEMA_UNAVAILABLE'], ['P2022', 503, 'SERVICE_SCHEMA_UNAVAILABLE'], ['P2003', 409, 'TICKET_LINK_CONFLICT']]) {
    const failure = async () => { throw { code: dbCode }; };
    const unavailable = new PrismaTicketRepository({ serviceTicket: { create: failure, findUnique: failure }, $transaction: failure });
    await assert.rejects(unavailable.create({}), code(status, name));
    await assert.rejects(unavailable.findById(unitId), code(status, name));
    await assert.rejects(unavailable.transition({}, {}), code(status, name));
  }
  const failure = new Error('Unexpected');
  const broken = new PrismaTicketRepository({ serviceTicket: { async findUnique() { throw failure; } } });
  await assert.rejects(broken.findById(unitId), (error) => error === failure);
});

test('HTTP routes validate all commands and reject closure without confirmation with standard 400 envelope', async () => {
  const { Module } = require('@nestjs/common');
  const { NestFactory } = require('@nestjs/core');
  const { ServiceController, ServiceTicketGuard } = require('../dist/service/service.controller');
  const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
  const f = setup(); let mode = 'unavailable';
  class TestModule {}
  Module({ controllers: [ServiceController], providers: [ServiceTicketGuard,
    { provide: ServiceService, useValue: f.service },
    { provide: ServiceTicketAccess, useValue: { async assertCanManage() {
      if (mode === 'unavailable') return new UnavailableServiceTicketAccess().assertCanManage({});
      if (mode === 'denied') throw new ApiError(403, 'FORBIDDEN', 'Not authorized');
    } } },
  ] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const post = (path, body) => fetch(`${base}/api/v1/tickets${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal((await post('', { unitId, faultDescription: 'fault' })).status, 503);
    mode = 'denied'; assert.equal((await post('', {})).status, 403);
    assert.equal(f.calls.length, 0); mode = 'allowed';
    let response = await post('', { unitId, faultDescription: 'fault', status: 'CLOSED' });
    assert.equal(response.status, 400);
    response = await post('', { unitId, faultDescription: 'fault' });
    assert.equal(response.status, 201); const ticket = (await response.json()).data;
    response = await post(`/${ticket.id}/resolve`, { version: 1, resolutionDetails: 'done' });
    assert.equal(response.status, 409);
    response = await post('/invalid/assess', assess); assert.equal(response.status, 400);
    response = await post(`/${ticket.id}/assess`, assess); assert.equal(response.status, 200);
    response = await post(`/${ticket.id}/resolve`, { version: 2, resolutionDetails: 'done' }); assert.equal(response.status, 200);
    for (const body of [{}, { version: 3 }, { version: 3, confirmerName: 'Anita', channel: 'PHONE' }]) {
      response = await post(`/${ticket.id}/confirm`, body);
      assert.equal(response.status, 400);
      const payload = await response.json(); assert.equal(apiErrorSchema.safeParse(payload).success, true);
      assert.equal(payload.error.code, 'INVALID_INPUT'); assert.ok(payload.error.fieldErrors.confirmedAt);
    }
    assert.equal(f.rows.get(ticket.id).status, 'AWAITING_CUSTOMER_CONFIRMATION');
    response = await post(`/${ticket.id}/confirm`, confirmation()); assert.equal(response.status, 200);
    assert.equal((await response.json()).data.status, 'CLOSED');
  } finally { await app.close(); }
});

test('production AppModule registers every ticket route behind unavailable verified access', async () => {
  process.env.SESSION_SECRET ??= 'test-only-session-secret-at-least-32-characters';
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  try {
    await app.listen(0, '127.0.0.1');
    for (const path of ['', `/${unitId}/assess`, `/${unitId}/resolve`, `/${unitId}/confirm`]) {
      const response = await fetch(`${await app.getUrl()}/api/v1/tickets${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://127.0.0.1:3001',
          'x-role': 'ADMIN',
        },
        body: '{}',
      });
      assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'SERVICE_AUTH_UNAVAILABLE');
    }
  } finally { await app.close(); }
});
