require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { RepairBillingService } = require('../dist/service/repair-billing.service');
const { UnavailableRepairSourceReader } = require('../dist/service/repair-billing.types');
const { CostWriterService } = require('../dist/finance/cost-writer.service');
const { UnavailableServiceInvoiceWriter } = require('../dist/finance/service-invoice-writer');
const { ReportingService } = require('../dist/reporting/reporting.service');
const { Prisma } = require('../dist/generated/prisma/client');
const { ApiError } = require('../dist/platform/api-error');
const ticketId = randomUUID(), jobId = randomUUID(), customerId = randomUUID(), unitId = randomUUID();
const partId = randomUUID(), labourId = randomUUID(), productId = randomUUID();
const refs = [{ type: 'PART', sourceId: partId }, { type: 'LABOUR', sourceId: labourId }];
const code = (status, name) => (error) => error instanceof ApiError && error.getStatus() === status && error.code === name;

function setup(covered = true) {
  let state = { ticket: { id: ticketId, jobId, customerId, unitId, status: 'ASSESSED', version: 2,
    billingSnapshot: null, assessmentSnapshot: { unitId, serial: 'INV-1', asOfDate: '2025-07-01',
      policyName: 'Components', policyRevision: 'v1', scope: 'Component repair', startDate: '2024-01-01', expiryDate: '2026-01-01',
      coverageStatus: covered ? 'COVERED' : 'EXPIRED', isCovered: covered, reason: 'Saved decision',
      customerCharge: covered ? '0.00' : null, chargeStatus: covered ? 'FREE' : 'PENDING_ASSESSMENT',
      requestedScope: 'Component repair', assessedAt: '2025-07-01T12:00:00Z' } }, costs: [], lines: [], invoices: [] };
  const calls = [];
  const tx = { serviceTicket: {
    async findUnique(query) { calls.push(['ticket', query]); return structuredClone(state.ticket); },
    async updateMany(query) {
      calls.push(['lock', query]); const { id, version, status } = query.where;
      if (state.ticket.id !== id || state.ticket.version !== version || state.ticket.status !== status) return { count: 0 };
      state.ticket.version += query.data.version.increment; state.ticket.status = query.data.status; return { count: 1 };
    },
    async update(query) { calls.push(['save', query]); Object.assign(state.ticket, structuredClone(query.data)); return state.ticket; },
  }, costEntry: {
    async createMany({ data }) {
      for (const entry of data) if (!state.costs.some((cost) => cost.uniqueSourceId === entry.uniqueSourceId && cost.costType === entry.costType)) {
        state.costs.push({ ...entry, id: randomUUID() });
      }
    },
    async findUnique({ where }) {
      const key = where.uniqueSourceId_costType;
      const entry = state.costs.find((row) => row.uniqueSourceId === key.uniqueSourceId && row.costType === key.costType);
      return entry ? { ...entry, amount: new Prisma.Decimal(entry.amount) } : null;
    },
    async findUniqueOrThrow(query) { const entry = await tx.costEntry.findUnique(query); assert.ok(entry); return entry; },
  }, ticketLine: {
    async findUnique({ where }) {
      const row = state.lines.find((line) => line.id === where.id);
      return row ? { ...row, quantity: new Prisma.Decimal(row.quantity), unitCost: new Prisma.Decimal(row.unitCost), totalCost: new Prisma.Decimal(row.totalCost) } : null;
    },
    async createMany({ data }) { calls.push(['lines']); state.lines.push(...structuredClone(data)); },
  } };
  const facts = refs.map((ref) => ({ ...ref, ticketId, jobId, customerId, scope: 'Component repair',
    occurredAt: '2025-07-01T11:00:00Z',
    description: ref.type === 'PART' ? 'Frozen inverter part' : 'Approved service labour',
    quantity: '1.000', unitCost: ref.type === 'PART' ? '14000.00' : '600.00', unitPrice: ref.type === 'PART' ? '16000.00' : '800.00',
    ...(ref.type === 'PART' ? { ticketLineId: randomUUID(), productId } : {}) }));
  const writer = new CostWriterService();
  const sources = { async read(received, id, items) {
    assert.strictEqual(received, tx); assert.equal(id, ticketId); calls.push(['sources']);
    // Emulate D3's consumption post inside the SAME transaction, before returning facts.
    for (const fact of facts.filter((row) => row.type === 'PART' && items.some((item) => item.sourceId === row.sourceId))) {
      const total = new Prisma.Decimal(fact.quantity).mul(fact.unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
      if (!state.lines.some((line) => line.id === fact.ticketLineId)) state.lines.push({ id: fact.ticketLineId,
        ticketId: fact.ticketId, productId: fact.productId, lineType: 'PART', description: fact.description, quantity: fact.quantity,
        unitCost: fact.unitCost, totalCost: total, billableToCustomer: !covered });
      await writer.postCost(tx, { uniqueSourceId: `STOCK_MOVEMENT:${fact.sourceId}`, costType: 'REPAIR_PARTS', jobId: fact.jobId, amount: total, description: fact.description, occurredAt: fact.occurredAt });
    }
    return facts.filter((row) => items.some((item) => item.type === row.type && item.sourceId === row.sourceId));
  } };
  const invoices = { async ensureServiceInvoice(received, input) {
    assert.strictEqual(received, tx); calls.push(['invoice', input]);
    const invoice = { invoiceId: randomUUID(), ...structuredClone(input) }; state.invoices.push(invoice);
    return { invoiceId: invoice.invoiceId, subtotal: input.subtotal };
  } };
  const service = new RepairBillingService(writer, sources, invoices);
  return { tx, service, facts, sources, invoices, calls, writer, get state() { return state; },
    // Rollback double proves propagation/composition, NOT real PostgreSQL isolation.
    async run(items = refs) {
      const before = structuredClone(state);
      try { return await service.executeRepairBilling(tx, ticketId, items); }
      catch (error) { state = before; throw error; }
    } };
}

test('covered repair reduces original job contribution by actual costs and adds no receivable', async () => {
  const f = setup();
  const report = () => new ReportingService({ async readJob() {
    return { jobId, isCompleted: true, unfinishedSteps: [], invoices: [{ amount: '55000' }], payments: [{ amount: '55000' }],
      costs: [{ costType: 'MATERIAL_DISPATCH', amount: '40000' }, { costType: 'INSTALLATION_LABOUR', amount: '2400' }, ...f.state.costs] };
  } }).getJobProfitability(jobId);
  assert.equal((await report()).contribution, '12600.00');
  const result = await f.run();
  assert.equal(result.internalCost, '14600.00'); assert.equal(result.customerCharge, '0.00'); assert.equal(result.invoiceId, null);
  assert.equal(f.state.invoices.length, 0); assert.equal(f.calls.some(([name]) => name === 'invoice'), false);
  assert.deepEqual(f.state.costs.map((row) => row.costType).sort(), ['REPAIR_PARTS', 'SERVICE_LABOUR']);
  assert.ok(f.state.costs.every((row) => row.jobId === jobId));
  assert.ok(result.lines.every((line) => line.billableToCustomer === false && line.totalPrice === '0.00'));
  const after = await report(); assert.equal(after.contribution, '-2000.00'); assert.equal(after.outstanding, '0.00');
  assert.equal(f.state.ticket.status, 'IN_PROGRESS'); assert.equal(f.state.ticket.version, 3);
  assert.equal(f.state.lines.length, 2); assert.ok(f.state.ticket.billingSnapshot);
});

test('all uncovered outcomes post actual costs and call D2 once with separate selling prices', async () => {
  for (const status of ['EXPIRED', 'VOID', 'NOT_STARTED', 'OUT_OF_SCOPE', 'NO_WARRANTY']) {
    const f = setup(false), snapshot = f.state.ticket.assessmentSnapshot; snapshot.coverageStatus = status;
    if (status === 'NO_WARRANTY') for (const key of ['policyName', 'policyRevision', 'scope', 'startDate', 'expiryDate']) snapshot[key] = null;
    const result = await f.run();
    assert.equal(result.customerCharge, '16800.00'); assert.equal(result.internalCost, '14600.00'); assert.ok(result.invoiceId);
    assert.equal(f.state.invoices.length, 1); assert.equal(f.state.costs.length, 2);
    const invoice = f.state.invoices[0]; assert.equal(invoice.uniqueSourceId, `TICKET:${ticketId}:REPAIR`);
    assert.equal(invoice.jobId, jobId); assert.equal(invoice.customerId, customerId); assert.equal(invoice.subtotal, '16800.00');
    assert.ok(invoice.lines.every((line) => !Object.hasOwn(line, 'unitCost')));
    assert.deepEqual(await f.run([...refs].reverse()), result); assert.equal(f.state.invoices.length, 1);
  }
});

test('saved result replays after closure and rate changes, conflicting source sets cannot rebill', async () => {
  const f = setup(), first = await f.run(); const count = f.calls.length;
  f.state.ticket.status = 'CLOSED'; f.facts[0].unitCost = '1.00';
  f.sources.read = async () => { throw new Error('Replay must not reread sources'); };
  assert.deepEqual(await f.run(refs.map((ref) => ({ ...ref, sourceId: ref.sourceId.toUpperCase() }))), first);
  assert.equal(f.calls.length, count + 1); assert.equal(f.state.lines.length, 2); assert.equal(f.state.costs.length, 2);
  await assert.rejects(f.run([refs[0]]), code(409, 'REPAIR_BILLING_CONFLICT'));
  await assert.rejects(f.run([...refs, { type: 'LABOUR', sourceId: randomUUID() }]), code(409, 'REPAIR_BILLING_CONFLICT'));
});

test('exact per-line half-up rounding, zero selling rates and max precision', async () => {
  const f = setup(false); f.facts.splice(0, 1); Object.assign(f.facts[0], { quantity: '0.005', unitCost: '1.00', unitPrice: '3.00' });
  const result = await f.run([refs[1]]);
  assert.equal(result.internalCost, '0.01'); assert.equal(result.customerCharge, '0.02');
  const zero = setup(false); zero.facts.splice(0, 1); Object.assign(zero.facts[0], { quantity: '1', unitCost: '999999999999.99', unitPrice: '0.00' });
  const large = await zero.run([refs[1]]); assert.equal(large.internalCost, '999999999999.99'); assert.equal(large.customerCharge, '0.00');
  // Uncovered zero-price work still has an official invoice, per D2's contract.
  assert.ok(large.invoiceId);
});

test('strict refs reject client prices, coverage, invalid quantities and duplicate sources before DB reads', async () => {
  const f = setup();
  for (const invalid of [null, [], {}, [{ ...refs[0], unitPrice: '0' }], [{ ...refs[0], billableToCustomer: false }],
    [{ ...refs[0], ticketLineId: randomUUID() }],
    [{ type: 'OTHER', sourceId: partId }], [{ type: 'PART', sourceId: 'bad' }], [refs[0], refs[0]],
    Array.from({ length: 201 }, () => ({ type: 'PART', sourceId: randomUUID() }))]) {
    await assert.rejects(f.run(invalid), code(400, 'INVALID_INPUT'));
  }
  await assert.rejects(f.service.executeRepairBilling(f.tx, 'bad', refs), code(400, 'INVALID_INPUT'));
  assert.deepEqual(f.calls, []);
});

test('unassessed, resolved, malformed or mismatched assessments cannot post', async () => {
  for (const status of ['OPEN', 'AWAITING_CUSTOMER_CONFIRMATION', 'CLOSED']) {
    const f = setup(); f.state.ticket.status = status;
    await assert.rejects(f.run(), code(409, 'INVALID_TICKET_TRANSITION')); assert.equal(f.state.costs.length, 0);
  }
  for (const assessment of [null, {}, { ...setup().state.ticket.assessmentSnapshot, unitId: randomUUID() }]) {
    const f = setup(); f.state.ticket.assessmentSnapshot = assessment;
    await assert.rejects(f.run(), code(409, 'ASSESSMENT_REQUIRED')); assert.equal(f.state.ticket.version, 2);
  }
  const missing = setup(); missing.tx.serviceTicket.findUnique = async () => null;
  await assert.rejects(missing.run(), code(404, 'TICKET_NOT_FOUND'));
});

test('source ownership/scope, persisted fact validation and amount overflow abort whole transaction', async () => {
  for (const [change, name, status] of [[{ ticketId: randomUUID() }, 'REPAIR_SOURCE_CONFLICT', 409],
    [{ jobId: randomUUID() }, 'REPAIR_SOURCE_CONFLICT', 409], [{ customerId: randomUUID() }, 'REPAIR_SOURCE_CONFLICT', 409],
    [{ scope: 'Unassessed labour' }, 'REPAIR_SCOPE_CONFLICT', 409], [{ quantity: '0' }, 'INVALID_REPAIR_SOURCE', 503],
    [{ unitCost: '-1' }, 'INVALID_REPAIR_SOURCE', 503], [{ unitPrice: '1.001' }, 'INVALID_REPAIR_SOURCE', 503],
    [{ quantity: '999999999.999', unitCost: '999999999999.99' }, 'REPAIR_AMOUNT_OVERFLOW', 409]]) {
    const f = setup(); Object.assign(f.facts[1], change); const before = structuredClone(f.state);
    await assert.rejects(f.run(), code(status, name)); assert.deepEqual(f.state, before);
  }
  const overflow = setup(); overflow.facts.forEach((fact) => { fact.unitCost = '999999999999.99'; });
  await assert.rejects(overflow.run(), code(409, 'REPAIR_AMOUNT_OVERFLOW')); assert.equal(overflow.state.costs.length, 0);
  for (const records of [null, [], [setup().facts[0], setup().facts[0]]]) {
    const f = setup(); f.sources.read = async () => records;
    await assert.rejects(f.run(), (error) => error instanceof ApiError);
    assert.equal(f.state.ticket.version, 2);
  }
});

test('parts reuse D3 ledger source, missing or conflicting cost rows abort without double expenses', async () => {
  const f = setup(); await f.run(); assert.equal(f.state.costs.length, 2);
  assert.ok(f.state.costs.some((cost) => cost.uniqueSourceId === `STOCK_MOVEMENT:${partId}`));
  for (const change of [{ jobId: randomUUID() }, { amount: '1.00' }]) {
    const conflict = setup(); conflict.state.costs.push({ uniqueSourceId: `TIME_ENTRY:${labourId}`, costType: 'SERVICE_LABOUR', jobId, amount: '600.00', ...change });
    const before = structuredClone(conflict.state);
    await assert.rejects(conflict.run(), code(409, 'IDEMPOTENCY_CONFLICT')); assert.deepEqual(conflict.state, before);
  }
  const missing = setup(); missing.sources.read = async () => missing.facts;
  await assert.rejects(missing.run(), code(409, 'REPAIR_PART_COST_REQUIRED')); assert.equal(missing.state.costs.length, 0);
});

test('billing uses warranty scope normalization and preserves source occurrence times', async () => {
  const f = setup();
  f.state.ticket.assessmentSnapshot.requestedScope = '  COMPONENT REPAIR  ';
  f.facts[0].scope = 'component repair';
  f.facts[1].scope = '  Component Repair  ';
  f.facts[1].occurredAt = '2025-06-30T12:00:00+05:30';
  const result = await f.run();
  assert.equal(result.customerCharge, '0.00');
  for (const fact of f.facts) {
    const cost = f.state.costs.find(row => row.uniqueSourceId.endsWith(fact.sourceId));
    assert.equal(cost.occurredAt.getTime(), new Date(fact.occurredAt).getTime());
  }
});

test('invoice failure, invalid adapter results and late snapshot failure roll back all effects', async () => {
  for (const mode of ['failure', 'malformed', 'wrong-subtotal', 'late-save']) {
    const f = setup(false), before = structuredClone(f.state), failure = new Error('Injected failure');
    if (mode === 'failure') f.invoices.ensureServiceInvoice = async () => { throw failure; };
    if (mode === 'malformed') f.invoices.ensureServiceInvoice = async () => ({ invoiceId: 'bad', subtotal: '16800' });
    if (mode === 'wrong-subtotal') f.invoices.ensureServiceInvoice = async () => ({ invoiceId: randomUUID(), subtotal: '1' });
    if (mode === 'late-save') f.tx.serviceTicket.update = async () => { throw failure; };
    await assert.rejects(f.run(), mode === 'failure' || mode === 'late-save' ? (error) => error === failure : code(503, 'INVALID_SERVICE_INVOICE'));
    assert.deepEqual(f.state, before);
  }
});

test('CAS protects concurrent billing and lifecycle transitions; database conflicts propagate', async () => {
  const f = setup();
  const results = await Promise.allSettled([f.service.executeRepairBilling(f.tx, ticketId, refs), f.service.executeRepairBilling(f.tx, ticketId, refs)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.ok(code(409, 'STALE_VERSION')(results.find((result) => result.status === 'rejected').reason));
  assert.equal(f.state.costs.length, 2); assert.equal(f.state.lines.length, 2);
  const lifecycle = setup(); lifecycle.tx.serviceTicket.updateMany = async () => ({ count: 0 });
  await assert.rejects(lifecycle.run(), code(409, 'STALE_VERSION')); assert.equal(lifecycle.calls.some(([name]) => name === 'sources'), false);
  for (const dbCode of ['P2034', 'P2021', 'P2022']) {
    const broken = setup(), failure = Object.assign(new Error('DB'), { code: dbCode });
    broken.tx.serviceTicket.findUnique = async () => { throw failure; };
    await assert.rejects(broken.run(), dbCode === 'P2034' ? (error) => error === failure : code(503, 'SERVICE_SCHEMA_UNAVAILABLE'));
  }
});

test('allocation PART line is required, validated and reused; missing or inconsistent linkage aborts', async () => {
  for (const patch of [null, { ticketId: randomUUID() }, { productId: randomUUID() }, { lineType: 'LABOUR' }, { quantity: '2.000' },
    { unitCost: '1.00' }, { totalCost: '1.00' }, { billableToCustomer: true }]) {
    const f = setup(), read = f.sources.read, before = structuredClone(f.state);
    f.sources.read = async (...args) => {
      const facts = await read(...args);
      if (patch === null) f.state.lines.length = 0; else Object.assign(f.state.lines[0], patch);
      return facts;
    };
    await assert.rejects(f.run(), code(409, 'REPAIR_LINE_CONFLICT')); assert.deepEqual(f.state, before);
  }
  for (const change of [(facts) => { delete facts[0].ticketLineId; },
    (facts) => { delete facts[0].productId; },
    (facts) => { facts[1].ticketLineId = randomUUID(); },
    (facts) => { facts[1].productId = randomUUID(); }]) {
    const f = setup(), before = structuredClone(f.state); change(f.facts);
    await assert.rejects(f.run(), code(503, 'INVALID_REPAIR_SOURCE')); assert.deepEqual(f.state, before);
  }
  const duplicate = setup();
  duplicate.facts.push({ ...duplicate.facts[0], sourceId: randomUUID() });
  const before = structuredClone(duplicate.state);
  await assert.rejects(duplicate.run(duplicate.facts.map(({ type, sourceId }) => ({ type, sourceId }))), code(409, 'REPAIR_LINE_CONFLICT'));
  assert.deepEqual(duplicate.state, before);
});

test('PART-only billing keeps its existing line and legacy snapshots still replay', async () => {
  const f = setup(); f.facts.splice(1, 1);
  const first = await f.run([refs[0]]);
  assert.equal(f.state.lines.length, 1); assert.equal(f.state.lines[0].id, f.facts[0].ticketLineId);
  assert.equal(f.calls.some(([name]) => name === 'lines'), false);
  // The added result field is optional when reading historical committed results.
  delete f.state.ticket.billingSnapshot.result.lines[0].ticketLineId;
  const legacy = structuredClone(f.state.ticket.billingSnapshot.result);
  assert.deepEqual(await f.run([refs[0]]), legacy); assert.equal(f.state.lines.length, 1);
  assert.equal(first.internalCost, '14000.00');
});

test('corrupt saved billing fails closed; unavailable production adapters do not fabricate results', async () => {
  for (const corrupt of [{}, { revision: 1 }]) {
    const f = setup(); f.state.ticket.billingSnapshot = corrupt;
    await assert.rejects(f.run(), code(503, 'INVALID_REPAIR_BILLING_RECORD'));
  }
  const f = setup(); const result = await f.run(); f.state.ticket.billingSnapshot.result.jobId = randomUUID();
  await assert.rejects(f.run(), code(503, 'INVALID_REPAIR_BILLING_RECORD')); assert.equal(result.internalCost, '14600.00');
  await assert.rejects(new UnavailableRepairSourceReader().read(), code(503, 'REPAIR_SOURCES_UNAVAILABLE'));
  await assert.rejects(new UnavailableServiceInvoiceWriter().ensureServiceInvoice(), code(503, 'SERVICE_INVOICE_UNAVAILABLE'));
  process.env.SESSION_SECRET ??= 'test-only-session-secret-at-least-32-characters';
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
  const { NestFactory } = require('@nestjs/core'); const { AppModule } = require('../dist/app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try { assert.ok(app.get(RepairBillingService) instanceof RepairBillingService); } finally { await app.close(); }
});
