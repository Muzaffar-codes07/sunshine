import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const planDir = resolve(root, 'docs/planning');
const loadJson = async (name) => JSON.parse(await readFile(resolve(planDir, name), 'utf8'));
const plan = await loadJson('build-backlog.json');
const oracle = await loadJson('demo-seed-oracle.json');
assert.deepEqual(Object.keys(plan.owners).sort(), ['D1', 'D2', 'D3', 'D4']);
assert.equal(plan.elapsedHours, 24);

const tasks = new Map();
const hours = Object.fromEntries(Object.keys(plan.owners).map((owner) => [owner, 0]));
for (const task of plan.tasks) {
  assert.ok(!tasks.has(task.id), `Duplicate ticket ${task.id}`);
  assert.ok(task.owner in plan.owners, `Unknown owner ${task.id}`);
  assert.ok(Number.isFinite(task.focusedHours) && task.focusedHours > 0, `Invalid estimate ${task.id}`);
  assert.equal(task.status, 'planned', `Do not claim implementation through a planning edit: ${task.id}`);
  assert.ok(task.acceptance.length > 30, `Missing concrete acceptance ${task.id}`);
  if (task.id.startsWith('F')) assert.equal(task.owner, 'D1', 'Exactly one dedicated frontend owner');
  tasks.set(task.id, task);
  hours[task.owner] += task.focusedHours;
}
for (const [owner, estimate] of Object.entries(hours)) {
  assert.ok(estimate <= plan.focusedHoursCapPerDeveloper, `${owner} exceeds focused-hour budget`);
}
const visited = new Set();
const active = new Set();
function visit(id) {
  assert.ok(tasks.has(id), `Missing dependency ${id}`);
  assert.ok(!active.has(id), `Dependency cycle at ${id}`);
  if (visited.has(id)) return;
  active.add(id);
  tasks.get(id).dependsOn.forEach(visit);
  active.delete(id);
  visited.add(id);
}
tasks.forEach((_, id) => visit(id));
const required = new Set(Array.from({ length: 25 }, (_, i) => `R${i + 1}`));
const covered = new Set(plan.tasks.flatMap((task) => task.requirements));
assert.deepEqual([...covered].sort(), [...required].sort(), 'Backlog must cover R1–R25 without invented IDs');

// Validate a concrete one-task-per-owner schedule, including staggered breaks.
// This checks the estimates, not actual developer throughput.
const schedule = new Map();
for (const entry of plan.resourceSchedule) {
  assert.ok(tasks.has(entry.id) && !schedule.has(entry.id), `Bad schedule ticket ${entry.id}`);
  const task = tasks.get(entry.id);
  assert.equal(entry.owner, task.owner);
  assert.ok(entry.startHour >= 0 && entry.endHour > entry.startHour);
  const paused = plan.breaks[task.owner].reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, entry.endHour) - Math.max(a, entry.startHour)), 0);
  assert.ok(Math.abs(entry.endHour - entry.startHour - paused - task.focusedHours) < 1e-8, `Effort mismatch ${entry.id}`);
  schedule.set(entry.id, entry);
}
assert.equal(schedule.size, tasks.size);
for (const [owner, priority] of Object.entries(plan.ownerPriority)) {
  assert.deepEqual([...priority].sort(), plan.tasks.filter((task) => task.owner === owner).map((task) => task.id).sort());
  const entries = [...schedule.values()].filter((entry) => entry.owner === owner).sort((a, b) => a.startHour - b.startHour);
  for (let i = 1; i < entries.length; i++) assert.ok(entries[i].startHour >= entries[i - 1].endHour, `${owner} double-booked`);
}
for (const [id, entry] of schedule) {
  for (const dependency of tasks.get(id).dependsOn) assert.ok(entry.startHour >= schedule.get(dependency).endHour, `${id} starts before ${dependency}`);
}
const scheduledFinish = Math.max(...[...schedule.values()].map((entry) => entry.endHour));
assert.equal(scheduledFinish, plan.scheduledFinishHour);
assert.ok(scheduledFinish <= plan.releaseTargetHour, 'Schedule misses release target');
assert.equal(plan.releaseTargetHour + plan.recoveryBufferHours, plan.elapsedHours);
for (const gate of plan.gates) {
  for (const id of gate.tasks) {
    assert.ok(schedule.has(id), `Unknown gate ticket ${id}`);
    assert.ok(schedule.get(id).endHour <= gate.hour, `${gate.id} H${gate.hour} is earlier than ${id} H${schedule.get(id).endHour}`);
  }
}

// CSV parser handles quoted commas and escaped quotes, rather than splitting fields.
function parseCsv(source) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if (c === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  assert.equal(quoted, false, 'Unclosed CSV quote');
  return rows;
}
const rows = parseCsv(await readFile(resolve(planDir, 'requirements-traceability.csv'), 'utf8'));
const header = rows.shift();
assert.equal(rows.length, 25);
const rowIds = new Set();
for (const row of rows) {
  assert.equal(row.length, header.length, 'Malformed traceability CSV');
  const r = Object.fromEntries(header.map((key, i) => [key, row[i]]));
  assert.ok(required.has(r.requirement_id) && !rowIds.has(r.requirement_id), 'Missing/duplicate requirement');
  rowIds.add(r.requirement_id);
  assert.ok(['D2', 'D3', 'D4'].includes(r.backend_owner));
  assert.equal(r.frontend_owner, 'D1');
  assert.equal(r.implementation_status, 'PLANNED');
  const ids = r.tickets.split(' ');
  ids.forEach((id) => assert.ok(tasks.has(id), `Unknown traceability ticket ${id}`));
  assert.ok(ids.some((id) => tasks.get(id).owner === r.backend_owner), 'Requirement lacks ticket for accountable backend owner');
}

for (const job of oracle.jobs) {
  const materials = job.materialLines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  const install = job.installationLabour;
  const labour = install.technicians * install.hoursEach * install.hourlyCost;
  const repair = job.repair;
  const baseInvoice = job.packagePrice + job.installationPrice;
  const repairCost = repair.partsCost + repair.labourHours * repair.hourlyCost;
  const repairInvoice = repair.partsCharge + repair.labourCharge;
  const actual = {
    baseInvoice, materialCost: materials, installationLabour: labour,
    beforeContribution: baseInvoice - materials - labour,
    repairCost, repairInvoice,
    afterContribution: baseInvoice + repairInvoice - materials - labour - repairCost,
    invoicedTotal: baseInvoice + repairInvoice,
    receivedTotal: job.receipt + repair.paymentReceived,
    outstanding: baseInvoice + repairInvoice - job.receipt - repair.paymentReceived,
  };
  assert.deepEqual(actual, job.expected, `${job.id}: planning arithmetic does not reconcile`);
  if (job.componentCovered || job.activeServiceCover) assert.equal(repairInvoice, 0);
}
const totals = oracle.jobs.reduce((sum, job) => ({
  invoiced: sum.invoiced + job.expected.invoicedTotal,
  received: sum.received + job.expected.receivedTotal,
  outstanding: sum.outstanding + job.expected.outstanding,
  contribution: sum.contribution + job.expected.afterContribution,
}), { invoiced: 0, received: 0, outstanding: 0, contribution: 0 });
assert.deepEqual(totals, oracle.expectedPortfolio, 'D/E portfolio arithmetic');
assert.equal(totals.invoiced - totals.received, totals.outstanding);
const csvTotals = [0, 0, 0, 0, 0];
for (const row of oracle.expectedCsv.rows) {
  const job = oracle.jobs.find((entry) => entry.id === row[0]);
  const e = job.expected;
  assert.deepEqual(row.slice(1), [e.invoicedTotal, e.receivedTotal, e.outstanding, e.materialCost + e.installationLabour + e.repairCost, e.afterContribution]);
  row.slice(1).forEach((amount, i) => { csvTotals[i] += amount; });
}
assert.deepEqual(csvTotals, oracle.expectedCsv.totals);
for (const scenario of oracle.periodScenarios) {
  for (const range of [scenario.day, scenario.week, scenario.month]) {
    const lower = Date.parse(range.startUtc), upper = Date.parse(range.endUtc);
    assert.ok(lower < upper && lower <= Date.parse(scenario.anchor) && Date.parse(scenario.anchor) < upper);
    const included = scenario.events.filter((event) => lower <= Date.parse(event.occurredAt) && Date.parse(event.occurredAt) < upper && Date.parse(event.occurredAt) <= Date.parse(scenario.anchor));
    const sum = (kind) => included.filter((event) => event.kind === kind).reduce((n, event) => n + event.amount, 0);
    assert.deepEqual({ invoices: sum('invoice'), receipts: sum('receipt'), costs: sum('cost') }, range.expected);
  }
}
assert.equal(oracle.technicianPay.reduce((n, row) => n + row.hours * row.payRate, 0), oracle.expectedCurrentRepairPay);
console.log(`Plan verified: ${tasks.size} tickets; DAG and R1–R25; focused hours ${JSON.stringify(hours)}; one task/owner with breaks; candidate H${scheduledFinish}; job/portfolio/period/pay oracles reconcile.`);
console.log('This validates planning structure/arithmetic only; business implementation and live rehearsals remain unverified.');
