const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { WarrantyService } = require('../dist/warranty/warranty.service');
const { PrismaWarrantyReader, WarrantyReader } = require('../dist/warranty/warranty.repository');
const { WarrantyEquipmentReader, WarrantyLookupAccess, UnavailableWarrantyLookupAccess,
  UnavailableWarrantyEquipmentReader } = require('../dist/warranty/warranty-readers');
const { ApiError } = require('../dist/platform/api-error');

const unitId = 'b3f02476-10ba-43dd-aa92-b3129796c148';
const manufacturerId = 'c3f02476-10ba-43dd-aa92-b3129796c148';
const productId = 'd3f02476-10ba-43dd-aa92-b3129796c148';
const equipment = {
  unit: { id: unitId, serial: 'INV-001', manufacturerId, productId },
  customer: { id: manufacturerId, name: 'Anita Sharma' }, job: { id: productId },
};
const saved = {
  unitId, startDate: new Date('2024-02-29T00:00:00Z'), expiryDate: new Date('2026-02-28T00:00:00Z'),
  policyName: 'Inverter component warranty', policyRevision: 'v1', scope: 'Component replacement', active: true,
};
function setup(overrides = {}) {
  const calls = [];
  const units = {
    async findById(id) { calls.push(['id', id]); return equipment; },
    async findBySerial(query) { calls.push(['serial', query]); return [equipment]; },
    ...overrides.units,
  };
  const warranties = { async findByUnitId(id) { calls.push(['warranty', id]); return saved; }, ...overrides.warranties };
  return { service: new WarrantyService(units, warranties), calls };
}
const code = (status, name) => (error) => error instanceof ApiError && error.getStatus() === status && error.code === name;

test('18-month assessment returns free coverage and complete saved-policy metadata', async () => {
  const { service } = setup();
  const result = await service.evaluateWarranty(unitId, new Date('2025-08-29T12:00:00Z'));
  assert.deepEqual(result, {
    unitId, serial: 'INV-001', asOfDate: '2025-08-29', policyName: saved.policyName,
    policyRevision: 'v1', scope: saved.scope, startDate: '2024-02-29', expiryDate: '2026-02-28',
    coverageStatus: 'COVERED', isCovered: true, reason: 'Under active manufacturer/installer warranty',
    customerCharge: '0.00', chargeStatus: 'FREE',
  });
});

test('half-open IST boundaries include start and exclude expiry, independent of host timezone', async () => {
  const { service } = setup();
  for (const [instant, expected, calendarDate] of [
    ['2024-02-28T18:29:59.999Z', 'NOT_STARTED', '2024-02-28'],
    ['2024-02-28T18:30:00.000Z', 'COVERED', '2024-02-29'],
    ['2026-02-27T18:29:59.999Z', 'COVERED', '2026-02-27'],
    ['2026-02-27T18:30:00.000Z', 'EXPIRED', '2026-02-28'],
    ['2026-04-29T00:00:00.000Z', 'EXPIRED', '2026-04-29'],
  ]) {
    const result = await service.evaluateWarranty(unitId, new Date(instant));
    assert.equal(result.coverageStatus, expected, instant);
    assert.equal(result.asOfDate, calendarDate);
    assert.equal(result.customerCharge, expected === 'COVERED' ? '0.00' : null);
    if (expected === 'EXPIRED') assert.equal(result.reason, 'Warranty expired on 2026-02-28');
  }
});

test('uses persisted leap-day and month-end expiry dates without recomputing anniversaries', async () => {
  for (const [start, expiry] of [
    ['2023-02-28', '2024-02-29'], ['2024-02-29', '2025-02-28'],
    ['2024-01-31', '2024-02-29'], ['2025-01-31', '2025-02-28'],
    ['2025-12-31', '2026-01-31'],
  ]) {
    const { service } = setup({ warranties: { async findByUnitId() {
      return { ...saved, startDate: new Date(`${start}T00:00:00Z`), expiryDate: new Date(`${expiry}T00:00:00Z`) };
    } } });
    const boundary = new Date(new Date(`${expiry}T00:00:00+05:30`).getTime());
    assert.equal((await service.evaluateWarranty(unitId, boundary)).coverageStatus, 'EXPIRED');
    assert.equal((await service.evaluateWarranty(unitId, new Date(boundary.getTime() - 1))).isCovered, true);
  }
});

test('inactive, not-started, missing-policy and excluded-scope outcomes never promise a free repair', async () => {
  const asOf = new Date('2025-08-29T00:00:00Z');
  const inactive = setup({ warranties: { async findByUnitId() { return { ...saved, active: false }; } } });
  assert.equal((await inactive.service.evaluateWarranty(unitId, asOf)).coverageStatus, 'VOID');
  const missing = setup({ warranties: { async findByUnitId() { return null; } } });
  const absent = await missing.service.evaluateWarranty(unitId, asOf);
  assert.equal(absent.coverageStatus, 'NO_WARRANTY');
  for (const field of ['startDate', 'expiryDate', 'policyName', 'policyRevision', 'scope', 'customerCharge']) assert.equal(absent[field], null);
  const { service } = setup();
  const excluded = await service.evaluateWarranty(unitId, asOf, 'Labour');
  assert.equal(excluded.coverageStatus, 'OUT_OF_SCOPE');
  assert.equal(excluded.chargeStatus, 'PENDING_ASSESSMENT');
  assert.equal(excluded.customerCharge, null);
  assert.match(excluded.reason, /Component replacement/);
  assert.equal((await service.evaluateWarranty(unitId, asOf, ' component replacement ')).isCovered, true);
});

test('bad IDs, dates and scope types are rejected before reads; unknown units return 404', async () => {
  const { service, calls } = setup();
  await assert.rejects(service.evaluateWarranty('invalid', new Date()), code(400, 'INVALID_INPUT'));
  await assert.rejects(service.evaluateWarranty(unitId, new Date('invalid')), code(400, 'INVALID_INPUT'));
  for (const scope of [null, 123, true, {}, []]) {
    await assert.rejects(service.evaluateWarranty(unitId, new Date(), scope), code(400, 'INVALID_INPUT'));
  }
  assert.equal(calls.length, 0);
  const missing = setup({ units: { async findById() { return null; } } });
  await assert.rejects(missing.service.evaluateWarranty(unitId, new Date()), code(404, 'UNIT_NOT_FOUND'));
});

test('lookup normalizes serial once, passes scoped identifiers, and returns installation projections', async () => {
  const { service, calls } = setup();
  const result = await service.lookup({ serial: '  inv-001  ', manufacturerId, productId }, new Date('2025-08-29T00:00:00Z'));
  assert.deepEqual(calls, [['serial', { serial: 'INV-001', manufacturerId, productId }], ['warranty', unitId]]);
  assert.deepEqual(result.data.unit, equipment.unit);
  assert.deepEqual(result.data.customer, equipment.customer);
  assert.deepEqual(result.data.job, equipment.job);
  assert.equal(result.data.assessment.isCovered, true);
});

test('uninstalled units have explicit null customer/job and no fabricated coverage dates', async () => {
  const { service } = setup({
    units: { async findBySerial() { return [{ ...equipment, customer: null, job: null }]; } },
    warranties: { async findByUnitId() { return null; } },
  });
  const { data } = await service.lookup({ serial: 'INV-001' });
  assert.equal(data.customer, null); assert.equal(data.job, null);
  assert.equal(data.assessment.coverageStatus, 'NO_WARRANTY');
});

test('missing/ambiguous serials do not read or disclose warranty records', async () => {
  for (const [matches, status, expected] of [
    [[], 404, 'UNIT_NOT_FOUND'], [[equipment, equipment], 409, 'AMBIGUOUS_SERIAL'],
  ]) {
    const { service, calls } = setup({ units: { async findBySerial() { return matches; } } });
    await assert.rejects(service.lookup({ serial: 'INV-001' }), code(status, expected));
    assert.equal(calls.length, 0);
  }
  const { service, calls } = setup();
  for (const serial of ['', ' ', 'a'.repeat(129), ['INV-001']]) await assert.rejects(service.lookup({ serial }), code(400, 'INVALID_INPUT'));
  assert.equal(calls.length, 0);
});

test('mismatched equipment/policy identities and corrupt calendar intervals are refused', async () => {
  const asOf = new Date('2025-08-29T00:00:00Z');
  for (const override of [{ unitId: productId }, { expiryDate: saved.startDate },
    { startDate: new Date('invalid') }, { startDate: new Date('2024-02-29T01:00:00Z') }]) {
    const { service } = setup({ warranties: { async findByUnitId() { return { ...saved, ...override }; } } });
    await assert.rejects(service.evaluateWarranty(unitId, asOf), code(503, 'INVALID_WARRANTY_RECORD'));
  }
  const mismatch = setup({ units: { async findById() { return { ...equipment, unit: { ...equipment.unit, id: productId } }; } } });
  await assert.rejects(mismatch.service.evaluateWarranty(unitId, asOf), code(503, 'INVALID_EQUIPMENT_RECORD'));
  const { service } = setup();
  await assert.rejects(service.lookup({ serial: 'OTHER' }), code(503, 'INVALID_EQUIPMENT_RECORD'));
});

test('blank, missing and non-string saved policy metadata return 503 for evaluation and lookup', async () => {
  const asOf = new Date('2025-08-29T00:00:00Z');
  for (const field of ['policyName', 'policyRevision', 'scope']) {
    for (const value of ['', '   ', null, undefined, 123, {}]) {
      const { service } = setup({ warranties: { async findByUnitId() { return { ...saved, [field]: value }; } } });
      await assert.rejects(service.evaluateWarranty(unitId, asOf, saved.scope), code(503, 'INVALID_WARRANTY_RECORD'));
      await assert.rejects(service.lookup({ serial: 'INV-001' }, asOf), code(503, 'INVALID_WARRANTY_RECORD'));
    }
  }
});

test('Prisma reader selects inactive policies too and maps missing migration to 503', async () => {
  let query;
  const reader = new PrismaWarrantyReader({ warranty: { async findUnique(input) { query = input; return saved; } } });
  assert.deepEqual(await reader.findByUnitId(unitId), saved);
  assert.deepEqual(query.where, { unitId });
  assert.equal(query.select.active, true);
  for (const errorCode of ['P2021', 'P2022']) {
    const unavailable = new PrismaWarrantyReader({ warranty: { async findUnique() { throw { code: errorCode }; } } });
    await assert.rejects(unavailable.findByUnitId(unitId), code(503, 'WARRANTY_SCHEMA_UNAVAILABLE'));
  }
  const failure = new Error('Unexpected failure');
  const broken = new PrismaWarrantyReader({ warranty: { async findUnique() { throw failure; } } });
  await assert.rejects(broken.findByUnitId(unitId), (error) => error === failure);
});

test('unavailable production adapters explicitly reject integration attempts', async () => {
  await assert.rejects(new UnavailableWarrantyLookupAccess().assertCanLookup({}), code(503, 'WARRANTY_AUTH_UNAVAILABLE'));
  const units = new UnavailableWarrantyEquipmentReader();
  await assert.rejects(units.findById(unitId), code(503, 'WARRANTY_EQUIPMENT_UNAVAILABLE'));
  await assert.rejects(units.findBySerial({ serial: 'INV-001' }), code(503, 'WARRANTY_EQUIPMENT_UNAVAILABLE'));
});

test('HTTP lookup enforces access before reads, validates query, and emits standard success/error envelopes', async () => {
  const { Module } = require('@nestjs/common');
  const { NestFactory } = require('@nestjs/core');
  const { WarrantyController, WarrantyLookupGuard } = require('../dist/warranty/warranty.controller');
  const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
  const { service, calls } = setup();
  let accessMode = 'unavailable';
  class TestModule {}
  Module({
    controllers: [WarrantyController],
    providers: [WarrantyLookupGuard, { provide: WarrantyService, useValue: service },
      { provide: WarrantyLookupAccess, useValue: { async assertCanLookup() {
        if (accessMode === 'unavailable') return new UnavailableWarrantyLookupAccess().assertCanLookup({});
        if (accessMode === 'denied') throw new ApiError(401, 'UNAUTHENTICATED', 'Staff login is required');
      } } }],
  })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  try {
    await app.listen(0, '127.0.0.1');
    const url = `${await app.getUrl()}/api/v1/warranties/lookup`;
    let response = await fetch(`${url}?serial=INV-001`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'WARRANTY_AUTH_UNAVAILABLE');
    accessMode = 'denied';
    response = await fetch(`${url}?serial=INV-001`);
    assert.equal(response.status, 401);
    assert.equal(calls.length, 0);
    accessMode = 'allowed';
    for (const query of ['', '?serial=', '?serial=INV-001&serial=INV-002', '?serial=INV-001&asOfDate=2025-01-01', '?serial=INV-001&productId=bad']) {
      response = await fetch(url + query);
      assert.equal(response.status, 400, query);
      const { error } = await response.json();
      assert.equal(error.code, 'INVALID_INPUT'); assert.ok(error.requestId); assert.ok(error.fieldErrors);
    }
    assert.equal(calls.length, 0);
    response = await fetch(`${url}?serial=%20inv-001%20`);
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.unit.id, unitId); assert.equal(data.customer.name, 'Anita Sharma');
    assert.equal(data.assessment.coverageStatus, 'EXPIRED');
  } finally { await app.close(); }
});

test('production AppModule rejects anonymous and forged-role warranty requests without an equipment query', async () => {
  process.env.SESSION_SECRET ??= 'test-only-session-secret-at-least-32-characters';
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/api/v1/warranties/lookup?serial=INV-001`, {
      headers: { 'x-role': 'ADMIN' },
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'UNAUTHENTICATED');
  } finally { await app.close(); }
});
