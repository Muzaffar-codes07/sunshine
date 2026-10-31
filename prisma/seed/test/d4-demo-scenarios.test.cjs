const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { buildD4Scenarios, shiftCalendarMonths, seedD4Scenarios } =
  require('../../../dist/seed/prisma/seed/d4-demo-scenarios');

const now = new Date('2026-10-31T10:00:00Z');
const hasCode = code => error => error.code === code;

// A transactional state double, not evidence of PostgreSQL constraints/isolation.
function fixture() {
  let state = { customer: new Map(), warranty: new Map(), serviceTicket: new Map(), installation: new Map() };
  const calls = [];
  let failSecond = false;
  let changeInstallation = value => value;
  const prisma = { async $transaction(work, options) {
    calls.push(['transaction', options]);
    const staged = structuredClone(state);
    const tx = { async $queryRaw(strings) {
      assert.match(strings.join(''), /pg_advisory_xact_lock\(71404, 51\)/);
      calls.push(['lock', tx]);
      return [{ lock: '' }];
    } };
    for (const table of ['customer', 'warranty', 'serviceTicket']) {
      tx[table] = { async upsert({ where, create, update }) {
        calls.push([table, tx]);
        assert.deepEqual(update, {}, 'seed must never reset history');
        const key = Object.keys(where)[0];
        let found = [...staged[table].values()].find(row => row[key] === where[key]);
        if (!found) {
          if ([...staged[table].values()].some(row => row.id === create.id ||
            (table === 'customer' && row.phone === create.phone) ||
            (table === 'serviceTicket' && row.ticketNumber === create.ticketNumber))) {
            throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
          }
          found = structuredClone({ ...create, version: 1 });
          staged[table].set(found.id, found);
        }
        return structuredClone(found);
      } };
    }
    tx.installations = staged.installation;
    const result = await work(tx);
    state = staged;
    return result;
  } };
  const writer = { async ensureInstallation(tx, input) {
    calls.push(['installation', tx]);
    if (failSecond && input.key === 'verma-expired') throw new Error('late upstream failure');
    if (!tx.installations.has(input.key)) {
      const { proposedInstalledOn, ...identity } = input;
      tx.installations.set(input.key, { ...identity, installedOn: proposedInstalledOn,
        delivered: true, installationCompleted: true });
    }
    return changeInstallation(structuredClone(tx.installations.get(input.key)));
  } };
  return { prisma, writer, calls, get state() { return state; },
    fail() { failSecond = true; }, alter(fn) { changeInstallation = fn; } };
}

test('two synthetic scenarios use IST calendar-relative ages and fixed serials/IDs', () => {
  const [covered, expired] = buildD4Scenarios(now);
  assert.equal(covered.customer.name, 'Anita Sharma');
  assert.equal(covered.capacityKw, 3);
  assert.equal(covered.systemType, 'ON_GRID');
  assert.equal(covered.serial, 'INV-ACTIVE-2025-01');
  assert.equal(covered.installedOn, '2025-04-30');
  assert.equal(covered.expiryDate, '2027-04-30');
  assert.match(covered.faultDescription, /ERR-04: Ground fault/);
  assert.equal(expired.customer.name, 'Rajesh Verma');
  assert.equal(expired.capacityKw, 5);
  assert.equal(expired.component, 'BATTERY');
  assert.equal(expired.serial, 'BAT-EXPIRED-2024-09');
  assert.equal(expired.installedOn, '2024-06-30');
  assert.equal(expired.expiryDate, '2026-06-30');
  const ids = [covered, expired].flatMap(row => [row.customer.id, row.jobId, row.unitId, row.warrantyId, row.ticketId]);
  assert.equal(new Set(ids).size, 10);
  for (const id of ids) assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(buildD4Scenarios(new Date('2026-10-30T18:29:59Z'))[0].installedOn, '2025-04-30');
  assert.equal(buildD4Scenarios(new Date('2026-10-31T18:30:00Z'))[0].installedOn, '2025-05-01');
  assert.equal(buildD4Scenarios(new Date('2026-11-30T18:29:59.999Z'))[0].installedOn, '2025-05-30');
  assert.equal(buildD4Scenarios(new Date('2026-11-30T18:30:00.000Z'))[0].installedOn, '2025-06-01');
});

test('month arithmetic clamps leap days/month ends and rejects invalid dates', () => {
  assert.equal(shiftCalendarMonths('2024-02-29', 24), '2026-02-28');
  assert.equal(shiftCalendarMonths('2024-08-31', -18), '2023-02-28');
  assert.equal(shiftCalendarMonths('2025-08-31', -18), '2024-02-29');
  assert.throws(() => shiftCalendarMonths('2025-02-29', 24), hasCode('D4_SEED_INVALID_DATE'));
  assert.throws(() => buildD4Scenarios(new Date('invalid')), hasCode('D4_SEED_INVALID_DATE'));
});

test('calendar month offsets preserve four-digit years and reject invalid offsets or range overflow', () => {
  // Date.UTC treats years 0..99 as 1900..1999. Calendar arithmetic must not.
  assert.equal(shiftCalendarMonths('0099-12-31', 1), '0100-01-31');
  assert.equal(shiftCalendarMonths('0100-01-31', -1), '0099-12-31');
  assert.equal(shiftCalendarMonths('0000-01-31', 1), '0000-02-29');
  assert.equal(shiftCalendarMonths('0000-02-29', 24), '0002-02-28');
  assert.equal(shiftCalendarMonths('9999-12-31', 0), '9999-12-31');
  for (const [date, offset] of [
    ['0000-01-01', -1], ['9999-12-31', 1], ['2026-10-31', 0.5],
    ['2026-10-31', NaN], ['2026-10-31', Infinity], ['2026-10-31', Number.MAX_SAFE_INTEGER],
  ]) assert.throws(() => shiftCalendarMonths(date, offset), hasCode('D4_SEED_INVALID_DATE'));
});

test('missing upstream integration fails before transactions or any writes', async () => {
  const f = fixture();
  await assert.rejects(seedD4Scenarios(f.prisma, { now }), hasCode('D4_SEED_INTEGRATION_REQUIRED'));
  assert.deepEqual(f.calls, []);
  assert.equal(f.state.customer.size, 0);
});

test('fresh seed uses one transaction, correct ownership, OPEN tickets and 24-month component policies', async () => {
  const f = fixture();
  const scenarios = await seedD4Scenarios(f.prisma, { installations: f.writer, now });
  assert.equal(f.state.customer.size, 2);
  assert.equal(f.state.warranty.size, 2);
  assert.equal(f.state.serviceTicket.size, 2);
  assert.equal(f.state.installation.size, 2);
  assert.equal(f.calls[1][0], 'lock');
  const tx = f.calls[1][1];
  for (const call of f.calls.slice(2)) assert.equal(call[1], tx);
  assert.equal(f.calls[0][1].isolationLevel, 'Serializable');
  for (const scenario of scenarios) {
    const warranty = f.state.warranty.get(scenario.warrantyId);
    const ticket = f.state.serviceTicket.get(scenario.ticketId);
    assert.equal(warranty.unitId, scenario.unitId);
    assert.equal(warranty.durationMonths, 24);
    assert.equal(warranty.active, true);
    assert.equal(warranty.scope, 'Component replacement');
    assert.equal(warranty.startDate.toISOString(), `${scenario.installedOn}T00:00:00.000Z`);
    assert.equal(warranty.expiryDate.toISOString(), `${scenario.expiryDate}T00:00:00.000Z`);
    assert.equal(ticket.unitId, scenario.unitId);
    assert.equal(ticket.jobId, scenario.jobId);
    assert.equal(ticket.customerId, scenario.customer.id);
    assert.equal(ticket.status, 'OPEN');
    assert.equal(ticket.assessmentSnapshot, undefined);
    assert.equal(ticket.billingSnapshot, undefined);
  }
});

test('reruns a month later preserve original dates, voids, ticket progress, billing and confirmation', async () => {
  const f = fixture();
  const original = await seedD4Scenarios(f.prisma, { installations: f.writer, now });
  const ticket = f.state.serviceTicket.get(original[0].ticketId);
  Object.assign(ticket, { status: 'CLOSED', version: 8, confirmedBy: 'Anita Sharma',
    assessmentSnapshot: { saved: true }, billingSnapshot: { invoiceId: 'frozen' },
    replacementSnapshot: { frozen: true }, resolutionDetails: 'Repaired' });
  f.state.warranty.get(original[0].warrantyId).active = false;
  const before = structuredClone(f.state);
  const rerun = await seedD4Scenarios(f.prisma, { installations: f.writer, now: new Date('2026-11-30T10:00:00Z') });
  assert.deepEqual(rerun, original);
  assert.deepEqual(f.state, before);
});

test('late second-scenario failure rolls back both scenarios and propagates the original error', async () => {
  const f = fixture();
  f.fail();
  await assert.rejects(seedD4Scenarios(f.prisma, { installations: f.writer, now }), /late upstream failure/);
  for (const table of Object.values(f.state)) assert.equal(table.size, 0);
});

test('phone/ticket-number collisions reject rather than hijack other records', async () => {
  for (const table of ['customer', 'serviceTicket']) {
    const f = fixture();
    const scenario = buildD4Scenarios(now)[0];
    f.state[table].set('unrelated', table === 'customer' ?
      { ...scenario.customer, id: 'unrelated' } : { id: 'unrelated', ticketNumber: scenario.ticketNumber });
    const before = structuredClone(f.state);
    await assert.rejects(seedD4Scenarios(f.prisma, { installations: f.writer, now }), hasCode('P2002'));
    assert.deepEqual(f.state, before);
  }
});

test('wrong upstream ownership, serial, delivery/completion or invalid/future date rolls back', async () => {
  for (const override of [
    { customerId: 'wrong' }, { jobId: 'wrong' }, { unitId: 'wrong' }, { serial: 'wrong' },
    { capacityKw: 99 }, { component: 'BATTERY' }, { systemType: 'OFF_GRID' },
    { delivered: false }, { installationCompleted: false },
    { installedOn: '2027-01-01' }, { installedOn: '2025-02-29' },
  ]) {
    const f = fixture();
    f.alter(value => ({ ...value, ...override }));
    await assert.rejects(seedD4Scenarios(f.prisma, { installations: f.writer, now }),
      error => ['D4_SEED_CONFLICT', 'D4_SEED_INVALID_DATE'].includes(error.code));
    assert.equal(f.state.customer.size, 0);
  }
});

test('conflicting persisted policy, ticket owner or customer identity does not overwrite history', async () => {
  for (const [table, change] of [
    ['warranty', { expiryDate: new Date('2030-01-01T00:00:00Z') }],
    ['warranty', { scope: 'Labour' }], ['serviceTicket', { customerId: 'wrong' }],
    ['customer', { name: 'Different person' }],
  ]) {
    const f = fixture();
    await seedD4Scenarios(f.prisma, { installations: f.writer, now });
    Object.assign([...f.state[table].values()][0], change);
    const before = structuredClone(f.state);
    await assert.rejects(seedD4Scenarios(f.prisma, { installations: f.writer, now }), hasCode('D4_SEED_CONFLICT'));
    assert.deepEqual(f.state, before);
  }
});

test('CLI preview is connection-free; ordinary seed exits nonzero with explicit integration gate', () => {
  const script = resolve(__dirname, '../../../dist/seed/prisma/seed.js');
  const env = { ...process.env, DATABASE_URL: 'postgresql://private-user:private-secret@invalid.invalid/private' };
  const preview = spawnSync(process.execPath, [script, '--preview'], { encoding: 'utf8', env });
  assert.equal(preview.status, 0, preview.stderr);
  // dotenv may print a loading banner, but the final payload must be valid JSON.
  const data = JSON.parse(preview.stdout.slice(preview.stdout.indexOf('{')));
  assert.equal(data.preview, true);
  assert.equal(data.persisted, false);
  assert.equal(data.scenarios.length, 2);
  for (const args of [[], ['--unknown']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env });
    assert.equal(result.status, 1);
    assert.match(result.stderr, args.length ? /D4_SEED_INVALID_ARGUMENT/ : /D4_SEED_INTEGRATION_REQUIRED/);
    assert.doesNotMatch(result.stdout + result.stderr, /private-user|private-secret|invalid\.invalid/);
  }
});

test('Prisma seed hook forwards preview through npm without attempting persisted seeding', () => {
  const cli = resolve(__dirname, '../../../node_modules/prisma/build/index.js');
  const result = spawnSync(process.execPath, [cli, 'db', 'seed', '--', '--preview'], {
    encoding: 'utf8', cwd: resolve(__dirname, '../../..'), timeout: 60_000,
    env: { ...process.env, DATABASE_URL: 'postgresql://private-user:private-secret@invalid.invalid/private' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"persisted": false/);
  assert.match(result.stdout, /INV-ACTIVE-2025-01/);
  assert.match(result.stdout, /BAT-EXPIRED-2024-09/);
  assert.doesNotMatch(result.stdout + result.stderr, /private-user|private-secret|invalid\.invalid/);
});
