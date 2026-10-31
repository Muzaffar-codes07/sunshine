// Real PostgreSQL tests for the idempotent command store. Same isolation rule as enquiries.db.test.mjs:
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

const { PrismaService } = require('../dist/platform/prisma.service');
const { IdempotencyService } = require('../dist/platform/idempotency');

let prisma;
let commands;
let actor;
let otherActor;

const phone = () => `6${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 10)}`;
const user = () => prisma.user.create({ data: { email: `${randomUUID()}@test.local`, displayName: 'Cashier', passwordHash: 'x', role: 'SALES' } });

/** A stand-in business effect: creates one customer and returns the response body, counting how often it ran. */
function effect(counter, { delayMs = 0, fail = false } = {}) {
  return async (tx) => {
    counter.runs += 1;
    const customer = await tx.customer.create({ data: { name: 'Receipt Test', phone: counter.phone, addressLine: '1 Ledger Lane', city: 'Mysuru', pincode: '570001' } });
    if (delayMs) await tx.$executeRaw`SELECT pg_sleep(${delayMs / 1000})`;
    if (fail) throw new Error('business rule refused after writing');
    return { data: { id: customer.id, receivedAt: customer.createdAt.toISOString() } };
  };
}
const counter = () => ({ runs: 0, phone: phone() });
const customers = (c) => prisma.customer.count({ where: { phone: c.phone } });

before(async () => {
  prisma = new PrismaService();
  commands = new IdempotencyService(prisma);
  actor = await user();
  otherActor = await user();
});

after(async () => {
  await prisma?.$disconnect();
});

test('a retry with the same key and body replays the recorded result without acting again', async () => {
  const c = counter();
  const command = { actorId: actor.id, key: randomUUID(), action: 'PAYMENT_RECEIPT', payload: { invoiceId: 'inv-1', amountInr: '5000.00' } };
  const first = await commands.run(command, effect(c));
  const retry = await commands.run({ ...command, payload: { amountInr: '5000.00', invoiceId: 'inv-1' } }, effect(c));
  assert.deepEqual(retry, first, 'key order in the body does not matter');
  assert.equal(c.runs, 1);
  assert.equal(await customers(c), 1);
  const recorded = await prisma.command.findUniqueOrThrow({ where: { actorId_idempotencyKey: { actorId: actor.id, idempotencyKey: command.key } } });
  assert.deepEqual(recorded.result, first);
  assert.match(recorded.payloadHash, /^[0-9a-f]{64}$/);
});

test('the same key with a different body or action is refused', async () => {
  const c = counter();
  const command = { actorId: actor.id, key: randomUUID(), action: 'PAYMENT_RECEIPT', payload: { amountInr: '5000.00' } };
  await commands.run(command, effect(c));
  for (const changed of [{ ...command, payload: { amountInr: '9000.00' } }, { ...command, action: 'ORDER_CONFIRM' }]) {
    await assert.rejects(commands.run(changed, effect(c)), (error) => {
      assert.equal(error.getStatus(), 409);
      assert.equal(error.code, 'IDEMPOTENCY_CONFLICT');
      return true;
    });
  }
  assert.equal(c.runs, 1);
});

test('keys are scoped to the actor', async () => {
  const key = randomUUID();
  const a = counter();
  const b = counter();
  await commands.run({ actorId: actor.id, key, action: 'ORDER_CONFIRM', payload: {} }, effect(a));
  await commands.run({ actorId: otherActor.id, key, action: 'ORDER_CONFIRM', payload: {} }, effect(b));
  assert.deepEqual([a.runs, b.runs], [1, 1]);
});

test('a failed command leaves no claim and no effect, so the same key can run again', async () => {
  const c = counter();
  const command = { actorId: actor.id, key: randomUUID(), action: 'DISPATCH', payload: { jobId: 'job-1' } };
  await assert.rejects(commands.run(command, effect(c, { fail: true })), /refused after writing/);
  assert.equal(await customers(c), 0);
  assert.equal(await prisma.command.count({ where: { idempotencyKey: command.key } }), 0);
  await commands.run(command, effect(c));
  assert.equal(await customers(c), 1);
});

test('two simultaneous requests with one key act once and both get the same result', async () => {
  const c = counter();
  const command = { actorId: actor.id, key: randomUUID(), action: 'DELIVERY', payload: { jobId: 'job-2' } };
  const [one, two] = await Promise.all([
    commands.run(command, effect(c, { delayMs: 300 })),
    commands.run(command, effect(c, { delayMs: 300 })),
  ]);
  assert.deepEqual(one, two);
  assert.equal(c.runs, 1, 'the second request waited on the claimed key instead of running');
  assert.equal(await customers(c), 1);
});

test('the database refuses malformed keys, actions and hashes', async () => {
  const base = { actorId: actor.id, idempotencyKey: randomUUID(), action: 'ORDER_CONFIRM', payloadHash: 'a'.repeat(64) };
  for (const bad of [{ idempotencyKey: 'short' }, { action: 'order confirm' }, { payloadHash: 'not-a-hash' }]) {
    await assert.rejects(prisma.command.create({ data: { ...base, ...bad } }), JSON.stringify(bad));
  }
});
