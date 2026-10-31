require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NestFactory } = require('@nestjs/core');
const { Module, Injectable, Inject } = require('@nestjs/common');
const { Prisma } = require('../dist/generated/prisma/client');
const { CostWriterService } = require('../dist/finance/cost-writer.service');
const { FinanceModule } = require('../dist/finance/finance.module');
const { PlatformModule } = require('../dist/platform/platform.module');
const { ApiError } = require('../dist/platform/api-error');
const { randomUUID } = require('node:crypto');
const code = (name) => (error) => error instanceof ApiError && error.getStatus() === 409 && error.code === name;

const input = (overrides = {}) => ({
  uniqueSourceId: 'TIME_ENTRY:43db413a-42a9-4b77-89b1-c18c1c16a1d6',
  jobId: 'a1a28f10-c4b6-40cc-a379-b72d42dc8fb7',
  costType: 'SERVICE_LABOUR',
  amount: '600.25',
  description: 'Covered repair labour',
  occurredAt: '2026-10-30T12:00:00.000Z',
  ...overrides,
});

// Only exposes the supplied transaction's insert/read operations. No root
// client or independent transaction is available. This double models uniqueness,
// not PostgreSQL concurrency or isolation; those require the queued migration.
function ledgerTransaction() {
  const rows = new Map();
  let writes = 0;
  const key = ({ uniqueSourceId, costType }) => JSON.stringify([uniqueSourceId, costType]);
  const tx = {
    costEntry: {
      async createMany({ data, skipDuplicates }) {
        writes += 1;
        assert.equal(skipDuplicates, true, 'duplicates must not abort the caller transaction');
        let count = 0;
        for (const item of data) {
          const source = key(item);
          if (rows.has(source)) continue;
          const postedAt = new Date('2026-10-31T10:00:00.000Z');
          rows.set(source, Object.freeze({
            ...item, id: randomUUID(), amount: new Prisma.Decimal(item.amount),
            postedAt, createdAt: postedAt,
          }));
          count += 1;
        }
        return { count };
      },
      async findUniqueOrThrow({ where }) {
        const row = rows.get(key(where.uniqueSourceId_costType));
        assert.ok(row, 'the returned entry must exist in the supplied transaction');
        return row;
      },
      async findUnique({ where }) {
        return [...rows.values()].find(row => row.id === where.id) ?? null;
      },
    },
  };
  return { tx, rows, writes: () => writes };
}

test('posting twice returns the original entry and counts the cost only once', async () => {
  const ledger = ledgerTransaction();
  const service = new CostWriterService();
  const first = await service.postCost(ledger.tx, input());
  const second = await service.postCost(ledger.tx, input());
  assert.strictEqual(second, first);
  assert.equal(ledger.rows.size, 1);
  assert.equal(first.amount.toFixed(2), '600.25');
  assert.equal(first.jobId, input().jobId);
  assert.equal(first.description, input().description);
});

test('retries compare semantic decimals and instants, rejecting changed immutable facts', async () => {
  const ledger = ledgerTransaction();
  const service = new CostWriterService();
  const first = await service.postCost(ledger.tx, input({ amount: '600.2' }));
  const second = await service.postCost(ledger.tx, input({ amount: '600.20',
    jobId: input().jobId.toUpperCase(), occurredAt: '2026-10-30T17:30:00+05:30',
  }));
  assert.strictEqual(second, first);
  for (const change of [{ amount: '900.00' }, { jobId: randomUUID() },
    { description: 'Changed retry' }, { occurredAt: '2026-10-30T12:00:00.001Z' }]) {
    await assert.rejects(service.postCost(ledger.tx, input({ amount: '600.20', ...change })), code('IDEMPOTENCY_CONFLICT'));
  }
  assert.equal(first.amount.toFixed(2), '600.20');
  assert.equal(ledger.rows.size, 1);
});

test('distinct source IDs or cost types remain separate compound-key entries', async () => {
  const ledger = ledgerTransaction();
  const service = new CostWriterService();
  for (const cost of [input(), input({ uniqueSourceId: 'TIME_ENTRY:another' }), input({ costType: 'INSTALLATION_LABOUR' })]) {
    await service.postCost(ledger.tx, cost);
  }
  assert.equal(ledger.rows.size, 3);
});

test('decimal money retains cents at the numeric(14,2) limit and permits zero costs', async () => {
  const service = new CostWriterService();
  for (const amount of ['999999999999.99', '0.01', '0.00']) {
    const ledger = ledgerTransaction();
    const row = await service.postCost(ledger.tx, input({ amount }));
    assert.equal(row.amount.toFixed(2), amount);
  }
});

test('invalid posting inputs fail before touching the ledger', async () => {
  const ledger = ledgerTransaction();
  const service = new CostWriterService();
  for (const override of [
    { amount: 600.25 }, { amount: '-1.00' }, { amount: '1.001' },
    { amount: '1000000000000.00' }, { jobId: 'bad-id' },
    { costType: 'TICKET_TOTAL' }, { uniqueSourceId: ' ' }, { description: ' ' },
    { occurredAt: undefined }, { occurredAt: '2026-10-30T12:00:00' },
    { occurredAt: '2026-10-30T12:00:00.0001Z' },
  ]) {
    await assert.rejects(service.postCost(ledger.tx, input(override)), { name: 'ZodError' });
  }
  assert.equal(ledger.writes(), 0);
  assert.equal(ledger.rows.size, 0);
});

test('one full reversal has its own source, keeps the original and replays without another expense', async () => {
  const ledger = ledgerTransaction(), service = new CostWriterService();
  const original = await service.postCost(ledger.tx, input());
  const reversal = input({ uniqueSourceId: `REVERSAL:${original.id}`, reversalOfId: original.id,
    amount: '-600.25', description: 'Reverse incorrect labour', occurredAt: '2026-10-31T09:00:00Z' });
  const saved = await service.postCost(ledger.tx, reversal);
  assert.strictEqual(await service.postCost(ledger.tx, reversal), saved);
  assert.equal(saved.reversalOfId, original.id);
  assert.equal([...ledger.rows.values()].reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)).toFixed(2), '0.00');
  assert.equal(original.amount.toFixed(2), '600.25');
  for (const change of [{ amount: '-1' }, { jobId: randomUUID() }, { costType: 'REPAIR_PARTS' },
    { occurredAt: '2026-10-29T12:00:00Z' }, { reversalOfId: randomUUID(), uniqueSourceId: 'missing' }]) {
    const command = { ...reversal, ...change };
    command.uniqueSourceId = `REVERSAL:${command.reversalOfId}`;
    await assert.rejects(service.postCost(ledger.tx, command), code('INVALID_COST_REVERSAL'));
  }
  await assert.rejects(service.postCost(ledger.tx, { ...reversal, description: 'Different retry' }), code('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(service.postCost(ledger.tx, input({ uniqueSourceId: `REVERSAL:${saved.id}`,
    reversalOfId: saved.id, amount: '0.00' })), code('INVALID_COST_REVERSAL'));
  assert.equal(ledger.rows.size, 2);
});

test('zero cost can be reversed once without negative zero', async () => {
  const ledger = ledgerTransaction(), service = new CostWriterService();
  const original = await service.postCost(ledger.tx, input({ amount: '0.00' }));
  const reversed = await service.postCost(ledger.tx, input({ amount: '0.00', reversalOfId: original.id,
    uniqueSourceId: `REVERSAL:${original.id}` }));
  assert.equal(reversed.amount.toFixed(2), '0.00');
});

test('source and description whitespace is normalized before deduplication', async () => {
  const ledger = ledgerTransaction();
  const service = new CostWriterService();
  const first = await service.postCost(ledger.tx, input({
    uniqueSourceId: ` ${input().uniqueSourceId} `, description: ' Covered repair labour ',
  }));
  const second = await service.postCost(ledger.tx, input());
  assert.strictEqual(second, first);
  assert.equal(first.uniqueSourceId, input().uniqueSourceId);
  assert.equal(first.description, input().description);
});

test('database failures propagate unchanged so the caller can roll back or retry', async () => {
  const service = new CostWriterService();
  for (const code of ['P2034', 'P2003', 'P2002']) {
    const error = Object.assign(new Error('Database failure'), { code });
    let read = false;
    const tx = { costEntry: {
      async createMany() { throw error; },
      async findUniqueOrThrow() { read = true; },
    } };
    await assert.rejects(service.postCost(tx, input()), (caught) => caught === error);
    assert.equal(read, false);
  }
  const error = new Error('Lookup failed');
  const tx = { costEntry: {
    async createMany() { return { count: 0 }; },
    async findUniqueOrThrow() { throw error; },
  } };
  await assert.rejects(service.postCost(tx, input()), (caught) => caught === error);
});

test('a consuming Nest module injects the cost writer with shared platform and no database query', async () => {
  class Consumer {
    constructor(writer) { this.writer = writer; }
  }
  Injectable()(Consumer);
  Inject(CostWriterService)(Consumer, undefined, 0);
  class ConsumerModule {}
  Module({ imports: [PlatformModule, FinanceModule], providers: [Consumer] })(ConsumerModule);
  const app = await NestFactory.createApplicationContext(ConsumerModule, { logger: false, abortOnError: false });
  try {
    assert.ok(app.get(Consumer).writer instanceof CostWriterService);
    assert.strictEqual(app.get(Consumer).writer, app.get(CostWriterService));
  } finally {
    await app.close();
  }
});
