import assert from 'node:assert/strict';
import test from 'node:test';
import { attentionItems, barsFor, crewRows, documentRows, monthGrid, formatDay, formatInr, hasClash, isLate, linePath, performance, pickSpotlight, projectHref, rangeFor, shiftAnchor, statusFilters, teamFacts } from '../src/features/dashboard/dashboard-model.ts';

const NOW = new Date(2026, 10, 4, 12, 0);
const at = (day, hour) => new Date(2026, 10, day, hour).toISOString();
const job = (id, overrides = {}) => ({
  id, orderId: `order-${id}`, orderDisplayNumber: `ORD-${id}`, customerId: 'c', status: 'SCHEDULED', version: 1, contactName: `Customer ${id}`, siteAddress: 'Site',
  soldCapacityKw: 1, systemType: 'ON_GRID', crew: [{ id: 't1', displayName: 'Asha Tech' }], technicianIds: ['t1'], scheduledStart: at(4, 9), scheduledFinish: at(4, 13),
  startedAt: null, finishedAt: null, installedCapacityKw: null, photoFileIds: [], signatureFileId: null, signerName: null, completedChecks: [], timeRecords: [], ...overrides,
});

test('a day shows 8 AM to 6 PM, and stretches only when a job needs it', () => {
  const normal = rangeFor('day', NOW, [job('a')]);
  assert.equal(normal.ticks[0].label, '8 AM'); assert.equal(normal.ticks.at(-1).label, '6 PM');
  const early = rangeFor('day', NOW, [job('a', { scheduledStart: at(4, 5), scheduledFinish: at(4, 20) })]);
  assert.equal(early.ticks[0].label, '4 AM'); assert.equal(early.ticks.at(-1).label, '8 PM');
  assert.equal(rangeFor('day', NOW, [job('other', { scheduledStart: at(9, 1), scheduledFinish: at(9, 23) })]).ticks[0].label, '8 AM', 'other days are ignored');
});

test('weeks start on Monday, months cover the whole month, and paging moves by the period', () => {
  const week = rangeFor('week', NOW, []);
  assert.equal(new Date(week.start).getDay(), 1); assert.equal(week.ticks.length, 7); assert.equal(week.ticks[0].label, 'Mon 2');
  const month = rangeFor('month', NOW, []);
  assert.equal(new Date(month.start).getDate(), 1); assert.equal(new Date(month.end).getMonth(), 11);
  assert.equal(shiftAnchor('day', NOW, 1).getDate(), 5); assert.equal(shiftAnchor('week', NOW, -1).getDate(), 28); assert.equal(shiftAnchor('month', NOW, 1).getMonth(), 11);
});

test('bars stay inside the range, leave out other periods, and stay wide enough to click', () => {
  const range = rangeFor('day', NOW, []);
  const bars = barsFor([job('later', { scheduledStart: at(4, 16), scheduledFinish: at(5, 3) }), job('a'), job('none', { scheduledStart: null, scheduledFinish: null }), job('off', { scheduledStart: at(8, 9), scheduledFinish: at(8, 12) })], range, NOW.getTime());
  assert.deepEqual(bars.map((bar) => bar.job.id), ['a', 'later'], 'sorted by start, and only this day');
  for (const bar of bars) { assert.ok(bar.left >= 0 && bar.left + bar.width <= 100.0001); assert.ok(bar.width >= 7); }
  assert.ok(Math.abs(bars[0].left - 10) < 0.001 && Math.abs(bars[0].width - 40) < 0.001, '9 AM to 1 PM on an 8 to 6 axis');
});

test('week and month views show whole days, wide enough to read', () => {
  const week = rangeFor('week', NOW, []), [bar] = barsFor([job('a')], week, NOW.getTime(), 'week');
  assert.ok(Math.abs(bar.left - 2 / 7 * 100) < 0.001, 'Wednesday starts two days in');
  assert.ok(Math.abs(bar.width - 100 / 7) < 0.3, 'one whole day');
  const [multi] = barsFor([job('b', { scheduledStart: at(3, 9), scheduledFinish: at(5, 9) })], week, NOW.getTime(), 'week');
  assert.ok(Math.abs(multi.width - 300 / 7) < 0.001, 'three days touched');
  const month = rangeFor('month', NOW, []), [small] = barsFor([job('c', { scheduledStart: at(30, 9), scheduledFinish: at(30, 12) })], month, NOW.getTime(), 'month');
  assert.ok(small.width >= 14 && small.left + small.width <= 100.0001, 'stays readable and inside the month');
});

test('late and clashing jobs are flagged, and finished work is never either', () => {
  const late = job('late', { scheduledStart: at(3, 9), scheduledFinish: at(3, 12) });
  assert.equal(isLate(late, NOW.getTime()), true);
  assert.equal(isLate({ ...late, status: 'COMPLETED' }, NOW.getTime()), false);
  const a = job('a'), b = job('b', { scheduledStart: at(4, 12), scheduledFinish: at(4, 15) }), other = job('c', { technicianIds: ['t2'] }), after = job('d', { scheduledStart: at(4, 13), scheduledFinish: at(4, 15) });
  assert.equal(hasClash(a, [a, b]), true, 'same technician, overlapping');
  assert.equal(hasClash(a, [a, other]), false, 'different technician');
  assert.equal(hasClash(a, [a, after]), false, 'back-to-back is fine');
  assert.equal(hasClash(a, [a, { ...b, status: 'COMPLETED' }]), false);
});

test('the spotlight prefers work on site, then late, then next due, and a finished job only when nothing is open', () => {
  const now = NOW.getTime(), done = job('done', { status: 'COMPLETED', finishedAt: at(1, 9) }), next = job('next', { scheduledStart: at(6, 9), scheduledFinish: at(6, 12) }), soon = job('soon');
  const late = job('late', { scheduledStart: at(3, 9), scheduledFinish: at(3, 12) }), site = job('site', { status: 'IN_PROGRESS', scheduledStart: at(8, 9), scheduledFinish: at(8, 12) });
  assert.equal(pickSpotlight([done, next, soon, late, site], now).id, 'site');
  assert.equal(pickSpotlight([done, next, soon, late], now).id, 'late');
  assert.equal(pickSpotlight([done, next, soon], now).id, 'soon');
  assert.equal(pickSpotlight([done], now).id, 'done');
  assert.equal(pickSpotlight([], now), null);
});

test('performance counts what the jobs say, by month and by week', () => {
  const facts = performance([job('a'), job('b', { status: 'IN_PROGRESS', startedAt: at(4, 9) }), job('c', { status: 'COMPLETED', startedAt: at(3, 9), finishedAt: at(3, 12) }), job('d', { status: 'COMPLETED', startedAt: new Date(2026, 9, 20).toISOString(), finishedAt: new Date(2026, 9, 20, 5).toISOString() })], NOW);
  assert.equal(facts.active, 2); assert.equal(facts.completed, 2); assert.equal(facts.doneThisMonth, 1); assert.equal(facts.doneLastMonth, 1);
  assert.equal(facts.completedByWeek.at(-1), 1, 'this week'); assert.equal(facts.completedByWeek.reduce((a, b) => a + b), 2);
  assert.equal(facts.startedByWeek.at(-1), 2);
});

test('team facts separate today, on site and jobs that still need planning', () => {
  const facts = teamFacts([job('today'), job('site', { status: 'IN_PROGRESS', technicianIds: ['t2'], crew: [{ id: 't2', displayName: 'Ravi Tech' }] }), job('bare', { technicianIds: [], crew: [], scheduledStart: null, scheduledFinish: null })], NOW);
  assert.deepEqual(facts.onSite, ['Ravi Tech']); assert.deepEqual(facts.assignedToday.sort(), ['Asha Tech', 'Ravi Tech']);
  assert.equal(facts.noCrew.length, 1); assert.equal(facts.noDate.length, 1); assert.equal(facts.days.length, 7); assert.equal(facts.days[0].count, 2);
});

test('every link goes to a screen that role can open', () => {
  const target = { id: 'j', orderId: 'o' };
  assert.equal(projectHref(target, 'ADMIN'), '/workspace/field-service/jobs/j'); assert.equal(projectHref(target, 'TECHNICIAN'), '/workspace/field-service/jobs/j');
  assert.equal(projectHref(target, 'WAREHOUSE'), '/workspace/warehouse/orders/o'); assert.equal(projectHref(target, 'SALES'), '/workspace/orders/o');
  const done = job('d', { status: 'COMPLETED', finishedAt: at(3, 9) }), open = job('o');
  assert.deepEqual(documentRows([open], 'WAREHOUSE'), [], 'nothing is delivered yet, so no warranty cover is offered');
  assert.equal(documentRows([done], 'WAREHOUSE')[0].href, '/workspace/warehouse/orders/order-d');
  assert.equal(documentRows([done], 'SALES')[0].href, '/workspace/orders/order-d');
  assert.equal(documentRows([open], 'TECHNICIAN')[0].href, '/workspace/field-service/jobs/o');
  const approval = { id: 's', name: 'Survey approval', detail: 'Asha', status: 'Waiting', href: '/x' };
  assert.equal(documentRows([done, open], 'ADMIN', [approval])[0].id, 's', 'approvals come first');
  assert.equal(documentRows([done, open, job('p'), job('q')], 'ADMIN').length, 4, 'the card stays short');
});

test('attention lists only what someone can act on', () => {
  const bare = job('bare', { technicianIds: [], crew: [], scheduledStart: null, scheduledFinish: null }), nocrew = job('nocrew', { technicianIds: [], crew: [] }), late = job('late', { scheduledStart: at(3, 9), scheduledFinish: at(3, 12) }), done = job('done', { status: 'COMPLETED', scheduledStart: at(3, 9), scheduledFinish: at(3, 12) });
  assert.deepEqual(attentionItems([bare, nocrew, late, done], 'ADMIN', NOW).map((item) => item.id), ['date-bare', 'crew-nocrew', 'late-late']);
  assert.deepEqual(attentionItems([bare, late], 'WAREHOUSE', NOW).map((item) => item.id), ['late-late']);
  assert.deepEqual(attentionItems([job('today'), late], 'TECHNICIAN', NOW).map((item) => item.id), ['today-today']);
});

test('status filters show live counts, and hide a status with no jobs', () => {
  const options = statusFilters([job('a'), job('b'), job('c', { status: 'COMPLETED' })]);
  assert.deepEqual(options.map((option) => [option.id, option.count]), [['ALL', 3], ['SCHEDULED', 2], ['COMPLETED', 1]]);
  assert.deepEqual(statusFilters([]).map((option) => option.id), ['ALL']);
});

test('formatting helpers', () => {
  assert.equal(formatDay('2046-11-01'), '1 Nov 2046');
  assert.equal(formatInr('55000.00'), '₹55,000'); assert.equal(formatInr('1234.50'), '₹1,234.50');
  assert.equal(linePath([1], 10, 10), ''); assert.match(linePath([0, 2, 1], 100, 20), /^M0\.0 16\.0 C/);
});

test('each technician is on site, booked or free according to their own open jobs', () => {
  const crew = (id) => ({ crew: [{ id, displayName: id }], technicianIds: [id] });
  const people = [{ id: 'free', displayName: 'Zed' }, { id: 'booked', displayName: 'Bea' }, { id: 'site', displayName: 'Cal' }, { id: 'later', displayName: 'Ana' }];
  const rows = crewRows(people, [
    job('a', { ...crew('site'), status: 'IN_PROGRESS', scheduledStart: at(4, 9), scheduledFinish: at(4, 15) }),
    job('g', { ...crew('free'), status: 'IN_PROGRESS', scheduledStart: at(1, 9), scheduledFinish: at(1, 15) }),
    job('b', { ...crew('booked'), scheduledStart: at(4, 14), scheduledFinish: at(4, 16) }),
    job('c', { ...crew('booked'), scheduledStart: at(6, 9), scheduledFinish: at(6, 12) }),
    job('d', { ...crew('booked'), scheduledStart: at(5, 9), scheduledFinish: at(5, 12) }),
    job('e', { ...crew('later'), scheduledStart: at(7, 9), scheduledFinish: at(7, 12) }),
    job('f', { ...crew('free'), status: 'COMPLETED', scheduledStart: at(4, 9), scheduledFinish: at(4, 11) }),
  ], NOW);
  assert.deepEqual(rows.map((row) => [row.member.displayName, row.state, row.current?.id, row.next?.id, row.open]), [
    ['Cal', 'ON_SITE', 'a', undefined, 1],
    ['Bea', 'ASSIGNED', 'b', 'd', 3],
    ['Ana', 'FREE', undefined, 'e', 1],
    ['Zed', 'FREE', undefined, undefined, 1],
  ]);
});

test('the calendar shows whole Monday-first weeks covering the month', () => {
  const november = monthGrid(new Date(2026, 10, 18));
  assert.equal(november.length, 42);
  assert.deepEqual([november[0].getMonth(), november[0].getDate(), november[0].getDay()], [9, 26, 1]);
  assert.deepEqual([november.at(-1).getMonth(), november.at(-1).getDate(), november.at(-1).getDay()], [11, 6, 0]);
  const february = monthGrid(new Date(2027, 1, 1));
  assert.equal(february.length, 28);
  assert.deepEqual([february[0].getDate(), february.at(-1).getDate()], [1, 28]);
});
