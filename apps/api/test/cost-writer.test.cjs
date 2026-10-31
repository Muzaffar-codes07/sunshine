require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NestFactory } = require('@nestjs/core');
const { Module, Injectable, Inject } = require('@nestjs/common');
const { Prisma } = require('../dist/generated/prisma/client');
const { CostWriterService } = require('../dist/finance/cost-writer.service');
const { FinanceModule } = require('../dist/finance/finance.module');

const input = (overrides = {}) => ({
  uniqueSourceId: 'TIME_ENTRY:43db413a-42a9-4b77-89b1-c18c1c16a1d6',
  jobId: 'a1a28f10-c4b6-40cc-a379-b72d42dc8fb7',
  costType: 'SERVICE_LABOUR',
  amount: '600.25',
  description: 'Covered repair labour',
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
            ...item, id: `cost-${rows.size + 1}`, amount: new Prisma.Decimal(item.amount),
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

test('a duplicate source never changes the original amount, job or description', async () => {
  const ledger = ledgerTransaction();
  const service = new CostWriterService();
  const first = await service.postCost(ledger.tx, input());
  const second = await service.postCost(ledger.tx, input({
    amount: '900.00', jobId: 'bcba12c5-7220-48b7-9cb5-91f82ca0df09', description: 'Changed retry',
  }));
  assert.strictEqual(second, first);
  assert.equal(second.amount.toFixed(2), '600.25');
  assert.equal(second.jobId, input().jobId);
  assert.equal(second.description, input().description);
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
  ]) {
    await assert.rejects(service.postCost(ledger.tx, input(override)), { name: 'ZodError' });
  }
  assert.equal(ledger.writes(), 0);
  assert.equal(ledger.rows.size, 0);
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

test('a consuming Nest module can inject the exported cost writer without a database client', async () => {
  class Consumer {
    constructor(writer) { this.writer = writer; }
  }
  Injectable()(Consumer);
  Inject(CostWriterService)(Consumer, undefined, 0);
  class ConsumerModule {}
  Module({ imports: [FinanceModule], providers: [Consumer] })(ConsumerModule);
  const app = await NestFactory.createApplicationContext(ConsumerModule, { logger: false });
  try {
    assert.ok(app.get(Consumer).writer instanceof CostWriterService);
    assert.strictEqual(app.get(Consumer).writer, app.get(CostWriterService));
  } finally {
    await app.close();
  }
});
