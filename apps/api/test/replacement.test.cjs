require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ReplacementService } = require('../dist/service/replacement.service');
const { UnavailableReplacementStockWriter } = require('../dist/service/replacement.types');
const { RepairBillingService } = require('../dist/service/repair-billing.service');
const { CostWriterService } = require('../dist/finance/cost-writer.service');
const { Prisma } = require('../dist/generated/prisma/client');
const { ApiError } = require('../dist/platform/api-error');
const ticketId = randomUUID(), jobId = randomUUID(), customerId = randomUUID();
const oldUnitId = randomUUID(), newUnitId = randomUUID(), partId = randomUUID(), labourId = randomUUID();
const input = { ticketId, oldUnitId, newUnitId, assessmentDate: '2025-07-01T12:00:00Z' };
const code = (status, name) => (error) => error instanceof ApiError && error.getStatus() === status && error.code === name;

function setup(covered = true) {
  let state = { ticket: { id: ticketId, customerId, jobId, unitId: oldUnitId, version: 2, status: 'ASSESSED',
    billingSnapshot: null, replacementSnapshot: null, replacedUnitId: null, newUnitId: null,
    assessmentSnapshot: { unitId: oldUnitId, serial: 'INV-OLD', asOfDate: '2025-07-01',
      policyName: 'Inverter', policyRevision: 'v1', scope: 'Component replacement',
      startDate: '2024-01-01', expiryDate: '2026-01-01', coverageStatus: covered ? 'COVERED' : 'EXPIRED',
      isCovered: covered, reason: 'Saved decision', customerCharge: covered ? '0.00' : null,
      chargeStatus: covered ? 'FREE' : 'PENDING_ASSESSMENT', requestedScope: 'Component replacement', assessedAt: '2025-07-01T12:00:00Z' } },
    warranties: [{ unitId: oldUnitId, startDate: new Date('2024-01-01'), expiryDate: new Date('2026-01-01'),
      policyName: 'Inverter', policyRevision: 'v1', scope: 'Component replacement', durationMonths: 24, active: true, version: 1 }],
    units: [{ id: oldUnitId, serial: 'INV-OLD', jobId, customerId, status: 'INSTALLED' },
      { id: newUnitId, serial: 'INV-NEW', jobId: null, customerId: null, status: 'AVAILABLE' }],
    movements: [], allocations: [], costs: [], invoices: [], lines: [] };
  const calls = [], writer = new CostWriterService();
  const facts = [{ type: 'PART', sourceId: partId, ticketLineId: randomUUID(), quantity: '1.000', unitCost: '14000.00', unitPrice: '16000.00' },
    { type: 'LABOUR', sourceId: labourId, quantity: '1.000', unitCost: '600.00', unitPrice: '800.00' }]
    .map((ref) => ({ ...ref, ticketId, jobId, customerId, scope: 'Component replacement', description: 'Actual replacement work', occurredAt: '2025-07-01T12:00:00Z' }));
  const tx = { serviceTicket: {
    async findUnique() { calls.push('ticket'); return structuredClone(state.ticket); },
    async updateMany({ where, data }) {
      calls.push('ticket-lock');
      if (where.id !== state.ticket.id || where.version !== state.ticket.version || where.status !== state.ticket.status) return { count: 0 };
      state.ticket.version += data.version.increment; state.ticket.status = data.status; return { count: 1 };
    },
    async update({ data }) { calls.push(data.replacementSnapshot ? 'lineage' : 'billing-save'); Object.assign(state.ticket, structuredClone(data)); return state.ticket; },
  }, warranty: {
    async findUnique({ where }) { calls.push('warranty'); return structuredClone(state.warranties.find((row) => row.unitId === where.unitId) ?? null); },
    async updateMany({ where, data }) {
      calls.push('policy-lock'); const row = state.warranties.find((item) => item.unitId === where.unitId && item.version === where.version);
      if (!row) return { count: 0 }; row.version += data.version.increment; return { count: 1 };
    },
    async create({ data }) {
      calls.push('warranty-create');
      if (state.warranties.some((row) => row.unitId === data.unitId)) throw Object.assign(new Error('Unique warranty'), { code: 'P2002' });
      const row = { ...structuredClone(data), version: 1 }; state.warranties.push(row); return row;
    },
  }, costEntry: {
    async createMany({ data }) {
      for (const row of data) if (!state.costs.some((cost) => cost.uniqueSourceId === row.uniqueSourceId && cost.costType === row.costType)) {
        state.costs.push({ id: randomUUID(), ...row });
      }
    },
    async findUnique({ where }) {
      const key = where.uniqueSourceId_costType;
      const row = state.costs.find((cost) => cost.uniqueSourceId === key.uniqueSourceId && cost.costType === key.costType);
      return row ? { ...row, amount: new Prisma.Decimal(row.amount) } : null;
    },
    async findUniqueOrThrow(query) { const row = await tx.costEntry.findUnique(query); assert.ok(row); return row; },
  }, ticketLine: {
    async findUnique({ where }) {
      const row = state.lines.find((line) => line.id === where.id);
      return row ? { ...row, quantity: new Prisma.Decimal(row.quantity), unitCost: new Prisma.Decimal(row.unitCost), totalCost: new Prisma.Decimal(row.totalCost) } : null;
    },
    async createMany({ data }) { state.lines.push(...structuredClone(data)); },
  } };
  const stock = { async replace(received, command) {
    assert.strictEqual(received, tx); assert.deepEqual(command, { ...input, assessmentDate: command.assessmentDate, jobId, customerId });
    assert.equal(new Date(command.assessmentDate).toISOString(), command.assessmentDate);
    calls.push('stock');
    const old = state.units[0], next = state.units[1];
    if (old.status !== 'INSTALLED' || next.status !== 'AVAILABLE') throw new ApiError(409, 'STOCK_CONFLICT', 'Unit already claimed');
    Object.assign(old, { status: 'QUARANTINED' });
    Object.assign(next, { status: 'RESERVED', jobId, customerId, replacesUnitId: oldUnitId });
    const part = facts[0];
    await tx.ticketLine.createMany({ data: [{ id: part.ticketLineId, ticketId, lineType: 'PART', description: part.description,
      quantity: part.quantity, unitCost: part.unitCost, totalCost: '14000.00', billableToCustomer: !covered }] });
    state.allocations.push({ unitId: newUnitId, ticketLineId: part.ticketLineId });
    state.movements.push({ type: 'RETURN', unitId: oldUnitId }, { id: partId, type: 'ISSUE', unitId: newUnitId });
    await writer.postCost(tx, { uniqueSourceId: `STOCK_MOVEMENT:${partId}`, jobId, costType: 'REPAIR_PARTS', amount: '14000.00', description: 'Actual replacement work', occurredAt: part.occurredAt });
    return { oldUnit: structuredClone(old), newUnit: structuredClone(next), repairItems: facts.map(({ type, sourceId }) => ({ type, sourceId })) };
  } };
  const sources = { async read(received) { assert.strictEqual(received, tx); calls.push('sources'); return facts; } };
  const invoices = { async ensureServiceInvoice(received, command) {
    assert.strictEqual(received, tx); calls.push('invoice');
    const invoiceId = randomUUID(); state.invoices.push({ invoiceId, ...command }); return { invoiceId, subtotal: command.subtotal };
  } };
  const billing = new RepairBillingService(writer, sources, invoices), service = new ReplacementService(stock, billing);
  return { tx, calls, stock, billing, service, sources, invoices, facts, get state() { return state; },
    // Transaction composition double: verifies errors escape and all effects share tx.
    // It is not evidence of PostgreSQL isolation or physical stock integration.
    async run(command = input) {
      const before = structuredClone(state);
      try { return await this.service.executeReplacement(tx, command); }
      catch (error) { state = before; throw error; }
    } };
}

test('18-month replacement keeps exactly the original 24-month warranty interval and serial lineage', async () => {
  const f = setup(), result = await f.run();
  assert.equal(result.oldUnit.id, oldUnitId); assert.equal(result.oldUnit.serial, 'INV-OLD'); assert.equal(result.oldUnit.status, 'QUARANTINED');
  assert.equal(result.newUnit.id, newUnitId); assert.equal(result.newUnit.serial, 'INV-NEW'); assert.equal(result.newUnit.status, 'RESERVED');
  assert.equal(result.newUnit.replacesUnitId, oldUnitId);
  assert.equal(f.state.ticket.unitId, oldUnitId); assert.equal(f.state.ticket.replacedUnitId, oldUnitId); assert.equal(f.state.ticket.newUnitId, newUnitId);
  const [old, next] = f.state.warranties;
  for (const key of ['startDate', 'expiryDate', 'policyName', 'policyRevision', 'scope', 'durationMonths', 'active']) assert.deepEqual(next[key], old[key]);
  assert.equal(next.expiryDate.toISOString(), '2026-01-01T00:00:00.000Z');
  const remainingMonths = (next.expiryDate.getUTCFullYear() - 2025) * 12 + next.expiryDate.getUTCMonth() - 6;
  assert.equal(remainingMonths, 6); assert.equal(next.startDate.toISOString(), '2024-01-01T00:00:00.000Z');
  assert.equal(result.billing.internalCost, '14600.00'); assert.equal(result.billing.customerCharge, '0.00'); assert.equal(result.billing.invoiceId, null);
  assert.equal(f.state.invoices.length, 0); assert.equal(f.state.costs.length, 2); assert.ok(f.state.costs.every((row) => row.jobId === jobId));
  assert.equal(f.state.ticket.status, 'IN_PROGRESS'); assert.equal(f.state.ticket.version, 4); assert.equal(f.state.movements.length, 2);
  assert.ok(f.calls.indexOf('stock') < f.calls.indexOf('sources'));
});

test('replacement reuses the allocation PART line and reconciles ticket totals before and after replay', async () => {
  for (const covered of [true, false]) {
    const f = setup(covered), first = await f.run();
    const partLineId = f.state.allocations[0].ticketLineId;
    assert.equal(f.state.allocations[0].unitId, newUnitId);
    assert.deepEqual(f.state.lines.map((line) => line.lineType).sort(), ['LABOUR', 'PART']);
    assert.equal(f.state.lines.find((line) => line.lineType === 'PART').id, partLineId);
    assert.equal(first.billing.lines.find((line) => line.type === 'PART').ticketLineId, partLineId);
    const sum = () => f.state.lines.reduce((total, line) => total.plus(line.totalCost), new Prisma.Decimal(0)).toFixed(2);
    assert.equal(sum(), '14600.00'); assert.equal(sum(), first.billing.internalCost);
    assert.equal(f.state.invoices.length, covered ? 0 : 1); assert.equal(f.state.costs.length, 2);
    const persisted = structuredClone(f.state);
    assert.deepEqual(await f.run(), first); assert.deepEqual(f.state, persisted);
  }
});

test('uncovered replacement calls real repair billing and D2 invoice boundary once in the same transaction', async () => {
  const f = setup(false); f.state.warranties[0].expiryDate = new Date('2025-01-01');
  const result = await f.run(); assert.equal(result.billing.customerCharge, '16800.00'); assert.ok(result.billing.invoiceId);
  assert.equal(result.warranty.expiryDate, '2025-01-01'); assert.equal(f.state.invoices.length, 1);
  assert.equal(f.state.invoices[0].uniqueSourceId, `TICKET:${ticketId}:REPAIR`);
  assert.deepEqual(await f.run(), result); assert.equal(f.state.invoices.length, 1); assert.equal(f.state.movements.length, 2);
});

test('canonical UUID/offset replay after closure returns frozen results; changed swap/date conflicts', async () => {
  const f = setup(), first = await f.run(); f.state.ticket.status = 'CLOSED';
  f.stock.replace = async () => { throw new Error('Cannot swap twice'); };
  f.billing.executeRepairBilling = async () => { throw new Error('Cannot bill twice'); };
  f.tx.warranty.findUnique = async () => { throw new Error('Cannot re-read mutable warranty on replay'); };
  assert.deepEqual(await f.run({ ticketId: ticketId.toUpperCase(), oldUnitId: oldUnitId.toUpperCase(), newUnitId: newUnitId.toUpperCase(),
    assessmentDate: '2025-07-01T17:30:00+05:30' }), first);
  await assert.rejects(f.run({ ...input, newUnitId: randomUUID() }), code(409, 'REPLACEMENT_CONFLICT'));
  await assert.rejects(f.run({ ...input, assessmentDate: '2025-07-01T12:00:01Z' }), code(409, 'REPLACEMENT_CONFLICT'));
  assert.equal(f.state.costs.length, 2); assert.equal(f.state.warranties.length, 2); assert.equal(f.state.lines.length, 2);
});

test('void flag, leap-day dates, original policy revision and long durations are copied without recalculation', async () => {
  const f = setup(); Object.assign(f.state.warranties[0], { active: false, startDate: new Date('2024-02-29'), expiryDate: new Date('2044-02-29'),
    policyName: ' Original panel policy ', policyRevision: 'historic-v2', durationMonths: 240 });
  const result = await f.run(); assert.equal(result.warranty.active, false); assert.equal(result.warranty.expiryDate, '2044-02-29');
  assert.equal(result.warranty.startDate, '2024-02-29'); assert.equal(result.warranty.policyRevision, 'historic-v2'); assert.equal(result.warranty.durationMonths, 240);
  assert.equal(result.warranty.policyName, ' Original panel policy ');
});

test('assessment matching uses the IST date across UTC midnight', async () => {
  const f = setup(); const result = await f.run({ ...input, assessmentDate: '2025-06-30T18:30:00Z' });
  assert.equal(result.assessmentDate, '2025-06-30T18:30:00.000Z');
  const previous = setup(); await assert.rejects(previous.run({ ...input, assessmentDate: '2025-06-30T18:29:59Z' }), code(409, 'ASSESSMENT_REQUIRED'));
});

test('input rejects self-swap, bad UUID, offsetless/future date and overrides before any read', async () => {
  const f = setup();
  for (const command of [null, {}, { ...input, newUnitId: oldUnitId.toUpperCase() }, { ...input, ticketId: 'bad' },
    { ...input, assessmentDate: '2025-07-01' }, { ...input, assessmentDate: '2025-07-01T12:00:00' },
    { ...input, assessmentDate: '2999-01-01T00:00:00Z' }, { ...input, expiryDate: '2050-01-01' }, { ...input, customerCharge: '0' }]) {
    await assert.rejects(f.run(command), code(400, 'INVALID_INPUT'));
  }
  assert.deepEqual(f.calls, []);
});

test('wrong unit, missing/scope-invalid assessment, date mismatch, completed or already billed work cannot swap', async () => {
  for (const patch of [{ unitId: randomUUID() }, { replacedUnitId: oldUnitId }, { newUnitId }, { billingSnapshot: {} }]) {
    const f = setup(); Object.assign(f.state.ticket, patch); await assert.rejects(f.run(), code(409, 'REPLACEMENT_CONFLICT')); assert.ok(!f.calls.includes('stock'));
  }
  for (const snapshot of [null, {}, { ...setup().state.ticket.assessmentSnapshot, unitId: randomUUID() },
    { ...setup().state.ticket.assessmentSnapshot, asOfDate: '2025-07-02' }]) {
    const f = setup(); f.state.ticket.assessmentSnapshot = snapshot; await assert.rejects(f.run(), code(409, 'ASSESSMENT_REQUIRED'));
  }
  for (const status of ['OPEN', 'AWAITING_CUSTOMER_CONFIRMATION', 'CLOSED']) {
    const f = setup(); f.state.ticket.status = status; await assert.rejects(f.run(), code(409, 'INVALID_TICKET_TRANSITION'));
  }
  const missing = setup(); missing.tx.serviceTicket.findUnique = async () => null;
  await assert.rejects(missing.run(), code(404, 'TICKET_NOT_FOUND'));
});

test('ticket and warranty CAS losses or version exhaustion reject before stock mutation', async () => {
  for (const target of ['serviceTicket', 'warranty']) {
    const f = setup(), before = structuredClone(f.state); f.tx[target].updateMany = async () => ({ count: 0 });
    await assert.rejects(f.run(), code(409, target === 'serviceTicket' ? 'STALE_VERSION' : 'WARRANTY_CONFLICT'));
    assert.deepEqual(f.state, before); assert.ok(!f.calls.includes('stock'));
  }
  const f = setup(); f.state.ticket.version = 2147483645;
  await assert.rejects(f.run(), code(409, 'STALE_VERSION'));
});

test('missing original, malformed policy and existing new-unit warranty never start or overwrite coverage', async () => {
  const missing = setup(); missing.state.warranties.length = 0;
  await assert.rejects(missing.run(), code(409, 'ORIGINAL_WARRANTY_REQUIRED'));
  for (const patch of [{ expiryDate: new Date('invalid') }, { startDate: new Date('2024-01-01T12:00:00Z') },
    { expiryDate: new Date('2023-01-01') }, { durationMonths: 0 }, { policyRevision: ' ' }]) {
    const f = setup(); Object.assign(f.state.warranties[0], patch); await assert.rejects(f.run(), code(503, 'INVALID_WARRANTY_RECORD'));
    assert.ok(!f.calls.includes('stock'));
  }
  const existing = setup(); existing.state.warranties.push({ ...structuredClone(existing.state.warranties[0]), unitId: newUnitId });
  const before = structuredClone(existing.state); await assert.rejects(existing.run(), code(409, 'WARRANTY_CONFLICT')); assert.deepEqual(existing.state, before);
});

test('unavailable stock, stock conflicts and invalid stock result fail atomically', async () => {
  const unavailable = setup(); unavailable.service = new ReplacementService(new UnavailableReplacementStockWriter(), unavailable.billing);
  const initial = structuredClone(unavailable.state);
  await assert.rejects(unavailable.run(), code(503, 'REPLACEMENT_STOCK_UNAVAILABLE')); assert.deepEqual(unavailable.state, initial);
  for (const patch of [{ newUnit: { status: 'DEPLOYED' } },
    { newUnit: { status: 'ALLOCATED' } }, { oldUnit: { status: 'QUARANTINE' } }, { oldUnit: { id: randomUUID() } },
    { newUnit: { jobId: randomUUID() } }, { newUnit: { customerId: randomUUID() } }, { newUnit: { replacesUnitId: randomUUID() } },
    { oldUnit: { serial: 'OTHER-SERIAL' } }, { repairItems: [{ type: 'LABOUR', sourceId: labourId }] }]) {
    const f = setup(), stock = f.stock.replace, before = structuredClone(f.state);
    f.stock.replace = async (...args) => { const result = await stock(...args);
      for (const [key, value] of Object.entries(patch)) if (key === 'repairItems') result[key] = value; else Object.assign(result[key], value);
      return result;
    };
    await assert.rejects(f.run(), (error) => error instanceof ApiError && [409, 503].includes(error.getStatus())); assert.deepEqual(f.state, before);
  }
  const claimed = setup(); claimed.state.units[1].status = 'RESERVED'; const before = structuredClone(claimed.state);
  await assert.rejects(claimed.run(), code(409, 'STOCK_CONFLICT')); assert.deepEqual(claimed.state, before);
});

test('late warranty, billing, invoice and lineage failures roll back stock, warranty, costs and ticket effects', async () => {
  for (const stage of ['warranty', 'billing', 'invoice', 'lineage']) {
    const f = setup(stage !== 'invoice'), before = structuredClone(f.state), failure = new Error(`failed ${stage}`);
    if (stage === 'warranty') f.tx.warranty.create = async () => { throw failure; };
    if (stage === 'billing') f.sources.read = async () => { throw failure; };
    if (stage === 'invoice') f.invoices.ensureServiceInvoice = async () => { throw failure; };
    if (stage === 'lineage') { const save = f.tx.serviceTicket.update; f.tx.serviceTicket.update = async (query) => {
      if (query.data.replacementSnapshot) throw failure; return save(query);
    }; }
    await assert.rejects(f.run(), (error) => error === failure); assert.deepEqual(f.state, before);
  }
});

test('real billing rejects unassessed actual stock work scope; snapshot tampering fails closed', async () => {
  const f = setup(), before = structuredClone(f.state); f.facts[0].scope = 'Unassessed scope';
  await assert.rejects(f.run(), code(409, 'REPAIR_SCOPE_CONFLICT')); assert.deepEqual(f.state, before);
  for (const mutate of [(row) => { row.replacementSnapshot = {}; }, (row) => { row.newUnitId = randomUUID(); },
    (row) => { row.replacementSnapshot.result.billing.jobId = randomUUID(); }]) {
    const saved = setup(); await saved.run(); mutate(saved.state.ticket);
    await assert.rejects(saved.run(), code(503, 'INVALID_REPLACEMENT_RECORD'));
  }
});

test('storage absence and concurrent warranty uniqueness are structured failures', async () => {
  for (const storageCode of ['P2021', 'P2022', 'P2002']) {
    const f = setup(), before = structuredClone(f.state); f.tx.warranty.create = async () => { throw { code: storageCode }; };
    await assert.rejects(f.run(), code(storageCode === 'P2002' ? 409 : 503, storageCode === 'P2002' ? 'REPLACEMENT_CONFLICT' : 'SERVICE_SCHEMA_UNAVAILABLE'));
    assert.deepEqual(f.state, before);
  }
});
