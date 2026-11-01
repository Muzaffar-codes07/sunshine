// Cross-service acceptance at test-only adapter boundaries. This suite does not
// prove PostgreSQL isolation, physical stock eligibility, or production auth.
const { createRequire } = require('node:module') as typeof import('node:module');
const { resolve } = require('node:path') as typeof import('node:path');
const apiRequire = createRequire(resolve(__dirname, '../apps/api/package.json'));
apiRequire('reflect-metadata');
const { test } = require('node:test') as typeof import('node:test');
const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
const { Prisma } = require('../apps/api/dist/generated/prisma/client') as typeof import('../apps/api/src/generated/prisma/client');
const { ServiceService } = require('../apps/api/dist/service/service.service') as typeof import('../apps/api/src/service/service.service');
const { WarrantyService } = require('../apps/api/dist/warranty/warranty.service') as typeof import('../apps/api/src/warranty/warranty.service');
const { RepairBillingService } = require('../apps/api/dist/service/repair-billing.service') as typeof import('../apps/api/src/service/repair-billing.service');
const { ReplacementService } = require('../apps/api/dist/service/replacement.service') as typeof import('../apps/api/src/service/replacement.service');
const { CostWriterService } = require('../apps/api/dist/finance/cost-writer.service') as typeof import('../apps/api/src/finance/cost-writer.service');
const { ReportingService } = require('../apps/api/dist/reporting/reporting.service') as typeof import('../apps/api/src/reporting/reporting.service');
const { ApiError } = require('../apps/api/dist/platform/api-error') as typeof import('../apps/api/src/platform/api-error');
import type { Prisma as PrismaTypes, CostEntry, TicketLine } from '../apps/api/src/generated/prisma/client';
import type { TicketRepository, TicketRow, NewTicket, TicketPatch } from '../apps/api/src/service/service.repository';
import type { SavedWarranty } from '../apps/api/src/warranty/warranty.repository';
import type { RepairSource } from '../apps/api/src/service/repair-billing.types';
import type { ServiceInvoiceInput } from '../apps/api/src/finance/service-invoice-writer';
import type { ReplacementStockWriter } from '../apps/api/src/service/replacement.types';

const scope = 'Component replacement including labour';
const coveredInstant = '2025-12-31T18:29:59.999Z';
const expiredInstant = '2025-12-31T18:30:00.000Z'; // 2026-01-01 00:00 IST, exclusive expiry
type CostQuery = { where: { uniqueSourceId_costType: { uniqueSourceId: string; costType: string } } };

function fixture() {
  const jobId = randomUUID(), customerId = randomUUID(), oldUnitId = randomUUID(), newUnitId = randomUUID();
  const rows = new Map<string, TicketRow>();
  const costs: CostEntry[] = [], lines: TicketLine[] = [], invoices: ServiceInvoiceInput[] = [];
  const warranties: (SavedWarranty & { durationMonths: number; version: number })[] = [{
    unitId: oldUnitId, startDate: new Date('2024-01-01'), expiryDate: new Date('2026-01-01'),
    policyName: 'Synthetic inverter', policyRevision: 'v1', scope, active: true, durationMonths: 24, version: 1,
  }];
  const equipment = { unit: { id: oldUnitId, serial: 'INV-INVARIANT-OLD', manufacturerId: randomUUID(), productId: randomUUID() },
    customer: { id: customerId, name: 'Synthetic customer' }, job: { id: jobId } };
  const units = { async findById() { return structuredClone(equipment); }, async findBySerial() { return [structuredClone(equipment)]; } };
  const warranty = new WarrantyService(units, { async findByUnitId(id) { return structuredClone(warranties.find(w => w.unitId === id) ?? null); } });
  const repository: TicketRepository = {
    async create(input: NewTicket) {
      const row: TicketRow = { ...input, id: randomUUID(), status: 'OPEN', version: 1,
        assessmentSnapshot: null, billingSnapshot: null, replacementSnapshot: null, replacedUnitId: null, newUnitId: null,
        sourceVerifiedAt: null, createdById: null, noWorkReason: null,
        resolutionDetails: null, resolvedAt: null, confirmedBy: null, confirmationChannel: null,
        confirmedAt: null, confirmationNotes: null, closedAt: null, createdAt: new Date(), updatedAt: new Date() };
      rows.set(row.id, row); return structuredClone(row);
    },
    async findById(id) { return structuredClone(rows.get(id) ?? null); },
    async list() { return { rows: [], total: 0 }; },
    async transition(current, patch: TicketPatch) {
      const row = rows.get(current.id)!;
      if (row.version !== current.version || row.status !== current.status) throw new ApiError(409, 'STALE_VERSION', 'Changed');
      Object.assign(row, structuredClone(patch), { version: row.version + 1, updatedAt: new Date() });
      return structuredClone(row);
    },
  };
  // Only the delegates needed by the real helpers are modeled. Casting this
  // narrow test adapter does not make it a real database transaction.
  const delegates = {
    serviceTicket: {
      async findUnique({ where }: { where: { id: string } }) { return repository.findById(where.id); },
      async updateMany({ where, data }: { where: Pick<TicketRow, 'id' | 'version' | 'status'>;
        data: { status: TicketRow['status']; version: { increment: number } } }) {
        const row = rows.get(where.id);
        if (!row || row.status !== where.status || row.version !== where.version) return { count: 0 };
        row.status = data.status; row.version += data.version.increment; return { count: 1 };
      },
      async update({ where, data }: { where: { id: string }; data: Partial<TicketRow> }) {
        const row = rows.get(where.id)!; Object.assign(row, structuredClone(data)); return structuredClone(row);
      },
    },
    costEntry: {
      async createMany({ data, skipDuplicates }: { data: PrismaTypes.CostEntryCreateManyInput[]; skipDuplicates: boolean }) {
        assert.equal(skipDuplicates, true);
        for (const entry of data) if (!costs.some(c => c.uniqueSourceId === entry.uniqueSourceId && c.costType === entry.costType)) {
          costs.push({ ...entry, id: randomUUID(), amount: new Prisma.Decimal(String(entry.amount)), occurredAt: new Date(entry.occurredAt),
            reversalOfId: entry.reversalOfId ?? null, postedAt: new Date(), createdAt: new Date() });
        }
      },
      async findUnique({ where }: CostQuery) {
        const key = where.uniqueSourceId_costType;
        return costs.find(c => c.uniqueSourceId === key.uniqueSourceId && c.costType === key.costType) ?? null;
      },
      async findUniqueOrThrow(query: CostQuery): Promise<CostEntry> {
        const row = await delegates.costEntry.findUnique(query); assert.ok(row); return row;
      },
    },
    ticketLine: {
      async findUnique({ where }: { where: { id: string } }) { return lines.find(l => l.id === where.id) ?? null; },
      async createMany({ data }: { data: PrismaTypes.TicketLineCreateManyInput[] }) {
        for (const line of data) lines.push({ phase:'ISSUED',version:1,productId:null,scope:null,createdById:null,cancelledById:null,cancellationReason:null, ...line, id: line.id ?? randomUUID(), createdAt: new Date(), billableToCustomer: line.billableToCustomer ?? false,
          unitPrice:line.unitPrice==null?null:new Prisma.Decimal(String(line.unitPrice)),
          cancelledAt:line.cancelledAt?new Date(line.cancelledAt):null,
          quantity: new Prisma.Decimal(String(line.quantity)), unitCost:line.unitCost==null?null:new Prisma.Decimal(String(line.unitCost)), totalCost:line.totalCost==null?null:new Prisma.Decimal(String(line.totalCost)) });
      },
    },
    warranty: {
      async findUnique({ where }: { where: { unitId: string } }) { return structuredClone(warranties.find(w => w.unitId === where.unitId) ?? null); },
      async updateMany({ where, data }: { where: { unitId: string; version: number }; data: { version: { increment: number } } }) {
        const row = warranties.find(w => w.unitId === where.unitId && w.version === where.version);
        if (!row) return { count: 0 }; row.version += data.version.increment; return { count: 1 };
      },
      async create({ data }: { data: Omit<(typeof warranties)[number], 'version'> }) {
        assert.ok(!warranties.some(w => w.unitId === data.unitId)); warranties.push({ ...data, version: 1 });
      },
    },
  };
  const tx = delegates as unknown as PrismaTypes.TransactionClient;
  const writer = new CostWriterService();
  const facts: RepairSource[] = [];
  const billing = new RepairBillingService(writer, { async read(received, ticketId, items) {
    assert.strictEqual(received, tx);
    return facts.filter(f => f.ticketId === ticketId && items.some(i => i.sourceId === f.sourceId && i.type === f.type));
  } }, { async ensureServiceInvoice(received, command) {
    assert.strictEqual(received, tx); invoices.push(structuredClone(command));
    return { invoiceId: randomUUID(), subtotal: command.subtotal };
  } });
  const service = new ServiceService(repository, warranty, units);
  async function assessed(instant = coveredInstant) {
    const ticket = (await service.createTicket({ unitId: oldUnitId, faultDescription: 'ERR-04: synthetic ground fault' })).data;
    return (await service.assessTicket(ticket.id, { version: ticket.version, asOfDate: instant, requestedScope: scope })).data;
  }
  async function consume(ticketId: string) {
    const covered = (await repository.findById(ticketId))!.assessmentSnapshot as { isCovered: boolean };
    const part: RepairSource = { type: 'PART', sourceId: randomUUID(), ticketLineId: randomUUID(), ticketId, jobId, customerId,
      scope, description: 'Consumed replacement inverter', quantity: '1.000', unitCost: '14000.00', unitPrice: '16000.00', occurredAt: coveredInstant };
    const labour: RepairSource = { ...part, type: 'LABOUR', sourceId: randomUUID(), ticketLineId: undefined,
      description: 'Approved service time', quantity: '2.000', unitCost: '300.00', unitPrice: '400.00' };
    facts.push(part, labour);
    await delegates.ticketLine.createMany({ data: [{ id: part.ticketLineId, ticketId, lineType: 'PART', description: part.description,
      quantity: part.quantity, unitCost: part.unitCost, totalCost: '14000.00', billableToCustomer: !covered.isCovered }] });
    await writer.postCost(tx, { uniqueSourceId: `STOCK_MOVEMENT:${part.sourceId}`, jobId, costType: 'REPAIR_PARTS', amount: '14000.00', description: part.description, occurredAt: part.occurredAt });
    return [part, labour].map(({ type, sourceId }) => ({ type, sourceId }));
  }
  return { jobId, customerId, oldUnitId, newUnitId, rows, costs, lines, invoices, warranties, writer, tx, billing, service, assessed, consume };
}

test('IST expiry boundary drives real assessment -> saved decision -> free/chargeable billing', async () => {
  for (const [instant, expectedStatus, charge] of [[coveredInstant, 'COVERED', '0.00'], [expiredInstant, 'EXPIRED', '16800.00']] as const) {
    const f = fixture(), ticket = await f.assessed(instant);
    assert.equal(ticket.assessmentSnapshot!.coverageStatus, expectedStatus);
    assert.equal(ticket.assessmentSnapshot!.asOfDate, expectedStatus === 'COVERED' ? '2025-12-31' : '2026-01-01');
    const savedDecision = structuredClone(ticket.assessmentSnapshot);
    const items = await f.consume(ticket.id);
    // Billing must honor the assessed event, even if today's policy has changed.
    f.warranties[0]!.active = !f.warranties[0]!.active;
    const result = await f.billing.executeRepairBilling(f.tx, ticket.id, items);
    assert.equal(result.customerCharge, charge); assert.equal(result.internalCost, '14600.00');
    assert.equal(f.invoices.length, expectedStatus === 'COVERED' ? 0 : 1);
    assert.equal(result.invoiceId === null, expectedStatus === 'COVERED');
    if (f.invoices[0]) {
      assert.equal(f.invoices[0].uniqueSourceId, `TICKET:${ticket.id}:REPAIR`);
      assert.equal(f.invoices[0].subtotal, charge); assert.equal(f.invoices[0].customerId, f.customerId);
    }
    assert.equal(f.costs.length, 2); assert.ok(f.costs.every(c => c.jobId === f.jobId));
    assert.equal(f.lines.length, 2);
    assert.equal(f.lines.reduce((sum, l) => { assert.ok(l.totalCost); return sum.plus(l.totalCost); }, new Prisma.Decimal(0)).toFixed(2), '14600.00');
    assert.deepEqual(f.rows.get(ticket.id)!.assessmentSnapshot, savedDecision);
    assert.deepEqual(await f.billing.executeRepairBilling(f.tx, ticket.id, [...items].reverse()), result);
    assert.equal(f.costs.length, 2); assert.equal(f.lines.length, 2);
    assert.equal(f.invoices.length, expectedStatus === 'COVERED' ? 0 : 1);
  }
});

test('duplicate cost source retains one posting and covered work reduces job contribution without a receivable', async () => {
  const f = fixture(), ticket = await f.assessed(), items = await f.consume(ticket.id);
  const post = { uniqueSourceId: 'TIME_ENTRY:invariant-installation', jobId: f.jobId, costType: 'INSTALLATION_LABOUR' as const,
    amount: '2400.00', description: 'Historical installation labour', occurredAt: '2024-01-01T12:00:00Z' };
  const first = await f.writer.postCost(f.tx, post), second = await f.writer.postCost(f.tx, post);
  assert.equal(second.id, first.id); assert.equal(f.costs.filter(c => c.uniqueSourceId === post.uniqueSourceId).length, 1);
  await f.writer.postCost(f.tx, { ...post, uniqueSourceId: 'STOCK_MOVEMENT:original-installation', costType: 'MATERIAL_DISPATCH', amount: '40000.00' });
  await f.billing.executeRepairBilling(f.tx, ticket.id, items);
  const reports = new ReportingService({ async readJob() {
    return { jobId: f.jobId, isCompleted: true, unfinishedSteps: [], invoices: [{ amount: '55000.00' }], payments: [{ amount: '55000.00' }],
      costs: f.costs.map(c => ({ costType: c.costType, amount: c.amount.toFixed(2) })) };
  }, async readOperations() { throw new Error('Unexpected operations read'); }, async readPeriod() { throw new Error('Unexpected period read'); }, async readSubsidies() { return []; }, async readTimeEntries() { return []; } });
  const report = await reports.getJobProfitability(f.jobId);
  assert.equal(report.actualCost, '57000.00'); assert.equal(report.contribution, '-2000.00');
  assert.equal(report.outstanding, '0.00'); assert.equal(report.invoicedRevenue, '55000.00');
  assert.equal(f.invoices.length, 0);
});

test('replacement after 18 months preserves original expiry, physical lineage and one final billing on replay', async () => {
  const f = fixture(), assessmentDate = '2025-07-01T12:00:00Z', ticket = await f.assessed(assessmentDate);
  const original = structuredClone(f.warranties[0]!);
  let stockCalls = 0;
  const stockState = { oldStatus: 'INSTALLED', newStatus: 'AVAILABLE', predecessor: null as string | null };
  const stock: ReplacementStockWriter = { async replace(received, command) {
    assert.strictEqual(received, f.tx); stockCalls++;
    assert.equal(command.oldUnitId, f.oldUnitId); assert.equal(command.newUnitId, f.newUnitId);
    assert.equal(command.jobId, f.jobId); assert.equal(command.customerId, f.customerId);
    stockState.oldStatus = 'QUARANTINED'; stockState.newStatus = 'RESERVED'; stockState.predecessor = f.oldUnitId;
    return { oldUnit: { id: f.oldUnitId, serial: 'INV-INVARIANT-OLD', status: 'QUARANTINED', jobId: f.jobId, customerId: f.customerId },
      newUnit: { id: f.newUnitId, serial: 'INV-INVARIANT-NEW', status: 'RESERVED', replacesUnitId: f.oldUnitId, jobId: f.jobId, customerId: f.customerId },
      repairItems: await f.consume(ticket.id) };
  } };
  const replacement = new ReplacementService(stock, f.billing);
  const command = { ticketId: ticket.id, oldUnitId: f.oldUnitId, newUnitId: f.newUnitId, assessmentDate };
  const result = await replacement.executeReplacement(f.tx, command);
  assert.equal(stockState.oldStatus, 'QUARANTINED'); assert.equal(stockState.newStatus, 'RESERVED');
  assert.equal(stockState.predecessor, f.oldUnitId);
  assert.equal(result.oldUnit.status, 'QUARANTINED'); assert.equal(result.newUnit.status, 'RESERVED');
  assert.equal(result.warranty.startDate, '2024-01-01'); assert.equal(result.warranty.expiryDate, '2026-01-01');
  const continued = f.warranties.find(w => w.unitId === f.newUnitId)!;
  for (const key of ['startDate', 'expiryDate', 'policyName', 'policyRevision', 'scope', 'durationMonths', 'active'] as const) {
    assert.deepEqual(continued[key], original[key]);
  }
  const row = f.rows.get(ticket.id)!;
  assert.equal(row.unitId, f.oldUnitId); assert.equal(row.replacedUnitId, f.oldUnitId); assert.equal(row.newUnitId, f.newUnitId);
  assert.equal(result.billing.internalCost, '14600.00'); assert.equal(result.billing.customerCharge, '0.00');
  assert.deepEqual(await replacement.executeReplacement(f.tx, command), result);
  assert.equal(stockCalls, 1); assert.equal(f.warranties.length, 2); assert.equal(f.costs.length, 2); assert.equal(f.lines.length, 2);
});

test('HTTP confirmation refuses each missing fact without mutation; valid confirmation alone closes', async () => {
  const { Module } = apiRequire('@nestjs/common');
  const { NestFactory } = apiRequire('@nestjs/core');
  const { ServiceController, ServiceTicketGuard } = require('../apps/api/dist/service/service.controller');
  const { ServiceTicketAccess } = require('../apps/api/dist/service/service-access');
  const { ApiExceptionFilter } = require('../apps/api/dist/platform/api-exception.filter');
  const { apiErrorSchema, serviceTicketResponseSchema } = require('@sunshine/contracts') as typeof import('@sunshine/contracts');
  const f = fixture(), ticket = await f.assessed();
  const billed = await f.billing.executeRepairBilling(f.tx, ticket.id, await f.consume(ticket.id));
  assert.equal(billed.customerCharge, '0.00');
  const resolved = (await f.service.resolveTicket(ticket.id, { version: f.rows.get(ticket.id)!.version, resolutionDetails: 'Replacement tested' })).data;
  class TestModule {}
  Module({ controllers: [ServiceController], providers: [ServiceTicketGuard,
    { provide: ServiceService, useValue: f.service },
    // Explicit test authorization; never installed into the production module.
    { provide: ServiceTicketAccess, useValue: { async assertCanManage() {} } },
  ] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  try {
    await app.listen(0, '127.0.0.1');
    const url = `${await app.getUrl()}/api/v1/tickets/${ticket.id}/confirm`;
    const post = (body: object) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    const good: Record<string, unknown> = { version: resolved.version, confirmerName: 'Synthetic customer', channel: 'PHONE', confirmedAt: new Date().toISOString() };
    const before = structuredClone(f.rows.get(ticket.id));
    for (const key of ['confirmerName', 'channel', 'confirmedAt']) {
      const bad = { ...good }; delete bad[key];
      const response = await post(bad); assert.equal(response.status, 400);
      const error = apiErrorSchema.parse(await response.json()); assert.equal(error.error.code, 'INVALID_INPUT');
      assert.deepEqual(f.rows.get(ticket.id), before);
    }
    const response = await post(good); assert.equal(response.status, 200);
    const closed = serviceTicketResponseSchema.parse(await response.json()).data;
    assert.equal(closed.status, 'CLOSED'); assert.equal(closed.confirmation!.confirmerName, good.confirmerName);
    assert.ok(closed.closedAt); assert.equal((await post(good)).status, 409);
    assert.equal(f.costs.length, 2); assert.equal(f.invoices.length, 0);
  } finally { await app.close(); }
});
