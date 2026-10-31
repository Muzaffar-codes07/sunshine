const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { ReportingService, reportWindow } = require('../dist/reporting/reporting.service');
const { CsvExporterService } = require('../dist/reporting/csv-exporter.service');
const { PrismaReportingReader } = require('../dist/reporting/reporting.repository');
const { ReportingAccess, UnavailableReportingAccess, UnavailableReportingSourceReader } = require('../dist/reporting/reporting-readers');
const { ApiError } = require('../dist/platform/api-error');
const jobId = 'b3f02476-10ba-43dd-aa92-b3129796c148';
const ownerId = 'c3f02476-10ba-43dd-aa92-b3129796c148';
const asOf = new Date('2026-10-31T12:00:00Z');
const amount = (value) => ({ amount: value });
const cost = (costType, value) => ({ costType, amount: value });
const coveredRepair = {
  jobId, isCompleted: true, unfinishedSteps: [], invoices: [amount('55000')], payments: [amount('55000')],
  costs: [cost('MATERIAL_DISPATCH', '40000'), cost('INSTALLATION_LABOUR', '2400'),
    cost('REPAIR_PARTS', '14000'), cost('SERVICE_LABOUR', '600')],
};
const code = (status, name) => (error) => error instanceof ApiError && error.getStatus() === status && error.code === name;
function serviceFor(snapshot = coveredRepair) {
  return new ReportingService({ async readJob(id, cutoff) {
    assert.equal(id, jobId); assert.equal(cutoff, asOf); return snapshot;
  } });
}

test('lifetime reports reconcile covered and chargeable repairs to original jobs', async () => {
  const report = await serviceFor().getJobProfitability(jobId, asOf);
  assert.deepEqual(report, { jobId, asOf: asOf.toISOString(), isCompleted: true, isProvisional: false,
    unfinishedSteps: [], invoicedRevenue: '55000.00', cashReceived: '55000.00', outstanding: '0.00',
    actualCost: '57000.00', contribution: '-2000.00', completedProfit: '-2000.00', marginPercentage: '-3.64',
    costBreakdown: { material: '40000.00', installationLabour: '2400.00', serviceLabour: '600.00', repairParts: '14000.00' },
  });
  const charged = await serviceFor({ ...coveredRepair, invoices: [amount('180000'), amount('4000')],
    payments: [amount('180000')], costs: [cost('MATERIAL_DISPATCH', '120000'), cost('INSTALLATION_LABOUR', '8000'),
      cost('REPAIR_PARTS', '1500'), cost('SERVICE_LABOUR', '500')],
  }).getJobProfitability(jobId, asOf);
  assert.equal(charged.invoicedRevenue, '184000.00'); assert.equal(charged.cashReceived, '180000.00');
  assert.equal(charged.outstanding, '4000.00'); assert.equal(charged.actualCost, '130000.00');
  assert.equal(charged.contribution, '54000.00'); assert.equal(charged.marginPercentage, '29.35');
});

test('unfinished jobs retain provisional contribution with zero completed profit and unfinished steps', async () => {
  const report = await serviceFor({ ...coveredRepair, isCompleted: false, unfinishedSteps: ['Homeowner signature'] })
    .getJobProfitability(jobId, asOf);
  assert.equal(report.isCompleted, false); assert.equal(report.isProvisional, true);
  assert.equal(report.completedProfit, '0.00'); assert.equal(report.contribution, '-2000.00');
  assert.deepEqual(report.unfinishedSteps, ['Homeowner signature']);
});

test('exact cents handle aggregate overflow, reversals, refunds, zero revenue and overpayments', async () => {
  const large = await serviceFor({ ...coveredRepair,
    invoices: [amount('999999999999.99'), amount('999999999999.99'), amount('-0.01')],
    payments: [amount('0.10'), amount('0.20'), amount('-0.01')],
    costs: [cost('SERVICE_LABOUR', '0.10'), cost('SERVICE_LABOUR', '0.20'), cost('SERVICE_LABOUR', '-0.01')],
  }).getJobProfitability(jobId, asOf);
  assert.equal(large.invoicedRevenue, '1999999999999.97'); assert.equal(large.cashReceived, '0.29');
  assert.equal(large.actualCost, '0.29'); assert.equal(large.contribution, '1999999999999.68');
  const zero = await serviceFor({ ...coveredRepair, invoices: [], payments: [amount('5')], costs: [] })
    .getJobProfitability(jobId, asOf);
  assert.equal(zero.marginPercentage, null); assert.equal(zero.outstanding, '0.00');
  for (const [costValue, expected] of [['31.96', '0.13'], ['32.04', '-0.13']]) {
    const rounded = await serviceFor({ ...coveredRepair, invoices: [amount('32')],
      costs: [cost('SERVICE_LABOUR', costValue)] }).getJobProfitability(jobId, asOf);
    assert.equal(rounded.marginPercentage, expected);
  }
});

test('invalid inputs and invalid completion snapshots fail without fabricated output', async () => {
  const service = new ReportingService({ async readJob() { throw new Error('must not read'); } });
  await assert.rejects(service.getJobProfitability('bad', asOf), code(400, 'INVALID_INPUT'));
  await assert.rejects(service.getJobProfitability(jobId, new Date('bad')), code(400, 'INVALID_INPUT'));
  await assert.rejects(service.getPeriodSummary('year', asOf), code(400, 'INVALID_INPUT'));
  await assert.rejects(service.getPeriodSummary(undefined, asOf), code(400, 'INVALID_INPUT'));
  await assert.rejects(serviceFor(null).getJobProfitability(jobId, asOf), code(404, 'JOB_NOT_FOUND'));
  for (const override of [{ jobId: ownerId }, { isCompleted: false }, { unfinishedSteps: ['Work'] },
    { costs: [cost('UNKNOWN', '2')] }, { invoices: [amount('0.001')] }]) {
    await assert.rejects(serviceFor({ ...coveredRepair, ...override }).getJobProfitability(jobId, asOf), code(503, 'INVALID_REPORT_RECORD'));
  }
});

test('malformed financial arrays return structured 503 errors for lifetime and period reports', async () => {
  for (const field of ['invoices', 'payments', 'costs']) {
    for (const invalid of [undefined, null, {}, 'not-an-array', 42]) {
      await assert.rejects(serviceFor({ ...coveredRepair, [field]: invalid }).getJobProfitability(jobId, asOf),
        code(503, 'INVALID_REPORT_RECORD'), `job ${field}: ${String(invalid)}`);
      const service = new ReportingService({ async readPeriod() {
        return { invoices: [], payments: [], costs: [], [field]: invalid };
      } });
      await assert.rejects(service.getPeriodSummary('today', asOf),
        code(503, 'INVALID_REPORT_RECORD'), `period ${field}: ${String(invalid)}`);
    }
  }
  const emptyJob = await serviceFor({ ...coveredRepair, invoices: [], payments: [], costs: [] }).getJobProfitability(jobId, asOf);
  assert.equal(emptyJob.actualCost, '0.00'); assert.equal(emptyJob.invoicedRevenue, '0.00');
  for (const invalid of [null, undefined]) {
    await assert.rejects(new ReportingService({ async readPeriod() { return invalid; } }).getPeriodSummary('today', asOf),
      code(503, 'INVALID_REPORT_RECORD'));
  }
});

test('IST day, Monday week and month ranges survive midnight, leap day, month and year rollover', () => {
  for (const [instant, period, start, end] of [
    ['2026-10-31T18:29:59.999Z', 'today', '2026-10-30T18:30:00.000Z', '2026-10-31T18:30:00.000Z'],
    ['2026-10-31T18:30:00Z', 'today', '2026-10-31T18:30:00.000Z', '2026-11-01T18:30:00.000Z'],
    ['2026-11-01T00:30:00+05:30', 'week', '2026-10-25T18:30:00.000Z', '2026-11-01T18:30:00.000Z'],
    ['2026-11-02T00:30:00+05:30', 'week', '2026-11-01T18:30:00.000Z', '2026-11-08T18:30:00.000Z'],
    ['2024-02-29T12:00:00Z', 'month', '2024-01-31T18:30:00.000Z', '2024-02-29T18:30:00.000Z'],
    ['2026-12-31T19:00:00Z', 'month', '2026-12-31T18:30:00.000Z', '2027-01-31T18:30:00.000Z'],
  ]) {
    const window = reportWindow(period, new Date(instant));
    assert.equal(window.start.toISOString(), start); assert.equal(window.end.toISOString(), end);
  }
});

test('period activity uses its own scope and does not mix lifetime figures into period profit', async () => {
  const service = new ReportingService({ async readPeriod(window) {
    assert.equal(window.start.toISOString(), '2026-10-30T18:30:00.000Z');
    assert.equal(window.end.toISOString(), '2026-10-31T18:30:00.000Z'); assert.equal(window.asOf, asOf);
    return { invoices: [amount('4000')], payments: [], costs: [cost('REPAIR_PARTS', '15500'), cost('SERVICE_LABOUR', '1100')] };
  } });
  const report = await service.getPeriodSummary('today', asOf);
  assert.equal(report.invoicedRevenue, '4000.00'); assert.equal(report.cashReceived, '0.00');
  assert.equal(report.actualCost, '16600.00'); assert.equal(report.timezone, 'Asia/Kolkata');
  assert.equal(report.startDate, '2026-10-31'); assert.equal(report.endDate, '2026-11-01');
  assert.equal(Object.hasOwn(report, 'contribution'), false); assert.equal(Object.hasOwn(report, 'completedProfit'), false);
});

function prismaHarness(source, rows = []) {
  const calls = [];
  const tx = { costEntry: { async findMany(query) { calls.push(query); return rows; } } };
  const prisma = { async $transaction(callback, options) {
    assert.equal(options.isolationLevel, 'RepeatableRead'); return callback(tx);
  } };
  return { reader: new PrismaReportingReader(prisma, source), tx, calls };
}
test('Prisma reader scopes costs to original job/cutoff and uses same transaction as source', async () => {
  let seenTx;
  const { reader, tx, calls } = prismaHarness({ async readJob(transaction, id, cutoff) {
    seenTx = transaction; assert.equal(id, jobId); assert.equal(cutoff, asOf); return coveredRepair;
  } }, [{ costType: 'REPAIR_PARTS', amount: { toFixed: () => '12.34' } }]);
  const snapshot = await reader.readJob(jobId, asOf);
  assert.equal(seenTx, tx);
  assert.deepEqual(calls[0], { where: { jobId, occurredAt: { lte: asOf }, postedAt: { lte: asOf } }, select: { amount: true, costType: true } });
  assert.deepEqual(snapshot.costs, [cost('REPAIR_PARTS', '12.34')]);
  const missing = prismaHarness({ async readJob() { return null; } });
  assert.equal(await missing.reader.readJob(jobId, asOf), null); assert.equal(missing.calls.length, 0);
});

test('period reports use occurrence boundaries and include late postings only when known at cutoff', async () => {
  const window = reportWindow('today', asOf);
  const events = [
    [new Date(window.start.getTime() - 1), asOf, '900'], [window.start, asOf, '0.10'], [asOf, asOf, '0.20'],
    [new Date(asOf.getTime() + 1), asOf, '800'], [window.end, window.end, '700'],
    [window.start, new Date(asOf.getTime() + 1), '600'],
  ];
  let tx;
  const reader = new PrismaReportingReader({ async $transaction(callback) {
    tx = { costEntry: { async findMany({ where: { occurredAt, postedAt } }) {
      assert.deepEqual(occurredAt, { gte: window.start, lt: window.end, lte: window.asOf });
      assert.deepEqual(postedAt, { lte: window.asOf });
      return events.filter(([date, recorded]) => date >= occurredAt.gte && date < occurredAt.lt && date <= occurredAt.lte && recorded <= postedAt.lte)
        .map(([, , value]) => ({ costType: 'SERVICE_LABOUR', amount: { toFixed: () => value } }));
    } } }; return callback(tx);
  } }, { async readPeriod(transaction, passed) {
    assert.equal(transaction, tx); assert.equal(passed, window); return { invoices: [], payments: [] };
  } });
  const report = await reader.readPeriod(window);
  assert.deepEqual(report.costs, [cost('SERVICE_LABOUR', '0.10'), cost('SERVICE_LABOUR', '0.20')]);
  // A posting recorded after this civil day appears in the earlier occurrence
  // period on a later query; it must never move into the posting day's period.
  window.asOf = new Date(window.end.getTime() + 1000);
  assert.deepEqual((await reader.readPeriod(window)).costs, [cost('SERVICE_LABOUR', '0.10'),
    cost('SERVICE_LABOUR', '0.20'), cost('SERVICE_LABOUR', '800'), cost('SERVICE_LABOUR', '600')]);
});

test('subsidies retain documents, assigned/unassigned owners and rejected records without creating cash', async () => {
  const statuses = ['PENDING', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'REJECTED'];
  const reader = new PrismaReportingReader({ async $transaction(callback) {
    return callback({ subsidyMilestone: { async findMany(query) {
      assert.deepEqual(query.select.responsibleOwner, { select: { id: true, displayName: true } });
      return statuses.map((status, index) => ({ id: jobId, jobId, stage: 'Evidence', status,
        submissionDate: null, approvalDate: null, amount: { toFixed: () => '100.10' }, evidenceFileId: null,
        pendingDocuments: index === 0 ? ['Identity proof'] : [],
        responsibleOwner: index === 0 ? { id: ownerId, displayName: 'Subsidy officer' } : null,
      }));
    } } });
  } }, {});
  const report = await new ReportingService(reader).getSubsidyMilestones();
  assert.deepEqual(report.groups.map((group) => group.status), ['PENDING_DOCS', 'SUBMITTED', 'APPROVED', 'DISBURSED', 'REJECTED']);
  for (const group of report.groups) { assert.equal(group.count, 1); assert.equal(group.totalAmount, '100.10'); }
  assert.deepEqual(report.groups[0].milestones[0].pendingDocuments, ['Identity proof']);
  assert.deepEqual(report.groups[0].milestones[0].responsibleOwner, { id: ownerId, name: 'Subsidy officer' });
  assert.equal(report.groups[1].milestones[0].responsibleOwner, null); assert.equal(Object.hasOwn(report, 'cashReceived'), false);
  const empty = await new ReportingService({ async readSubsidies() { return []; } }).getSubsidyMilestones();
  assert.equal(empty.groups.length, 5); assert.ok(empty.groups.every((group) => group.count === 0 && group.totalAmount === '0.00'));
});

test('missing schema and missing integrations fail explicitly; unrelated failures propagate', async () => {
  for (const failure of [{ code: 'P2021' }, { code: 'P2022' }, new Error('unrelated')]) {
    const reader = new PrismaReportingReader({ async $transaction() { throw failure; } }, {});
    await assert.rejects(reader.readSubsidies(), failure.code ? code(503, 'REPORTING_SCHEMA_UNAVAILABLE') : (error) => error === failure);
  }
  const source = new UnavailableReportingSourceReader();
  await assert.rejects(source.readJob({}, jobId, asOf), code(503, 'REPORTING_SOURCE_UNAVAILABLE'));
  await assert.rejects(source.readPeriod({}, reportWindow('today', asOf)), code(503, 'REPORTING_SOURCE_UNAVAILABLE'));
  await assert.rejects(new UnavailableReportingAccess().assertCanReadReports({}), code(503, 'REPORTING_AUTH_UNAVAILABLE'));
  await assert.rejects(new ReportingService({ async readSubsidies() {
    return [{ status: 'UNKNOWN', pendingDocuments: [] }];
  } }).getSubsidyMilestones(), code(503, 'INVALID_REPORT_RECORD'));
});

test('HTTP reports enforce authorization before queries, strict inputs and response envelopes', async () => {
  const { Module } = require('@nestjs/common');
  const { NestFactory } = require('@nestjs/core');
  const { ReportingController, ReportingGuard } = require('../dist/reporting/reporting.controller');
  const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
  let access = 'unavailable', reads = 0;
  const service = new ReportingService({
    async readJob() { reads++; return coveredRepair; },
    async readPeriod() { reads++; return { invoices: [], payments: [], costs: [] }; },
    async readSubsidies() { reads++; return []; },
  });
  class TestModule {}
  Module({ controllers: [ReportingController], providers: [ReportingGuard, CsvExporterService,
    { provide: ReportingService, useValue: service }, { provide: ReportingAccess, useValue: {
      async assertCanReadReports() {
        if (access === 'unavailable') return new UnavailableReportingAccess().assertCanReadReports({});
        if (access === 'anonymous') throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
        if (access === 'technician') throw new ApiError(403, 'FORBIDDEN', 'Director access required');
      },
    } }],
  })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  try {
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1/reports`;
    for (const [mode, status] of [['unavailable', 503], ['anonymous', 401], ['technician', 403]]) {
      access = mode;
      for (const path of ['profitability', 'overview', 'subsidies', 'pay-summary', 'export.csv?report=pay', 'export-csv?report=overview']) {
        const response = await fetch(`${base}/${path}`, { headers: { 'x-role': 'ADMIN' } });
        assert.equal(response.status, status); assert.ok((await response.json()).error.requestId);
      }
    }
    assert.equal(reads, 0); access = 'admin';
    for (const path of ['profitability', 'profitability?jobId=bad', `profitability?jobId=${jobId}&jobId=${ownerId}`,
      `profitability?jobId=${jobId}&asOf=2025-01-01`, 'overview?period=year', 'overview?period=week&period=month',
      'overview?startDate=2020-01-01', 'subsidies?ownerId=anything']) {
      const response = await fetch(`${base}/${path}`);
      assert.equal(response.status, 400, path); assert.equal((await response.json()).error.code, 'INVALID_INPUT');
    }
    assert.equal(reads, 0);
    for (const path of [`profitability?jobId=${jobId}`, 'overview', 'overview?period=week', 'overview?period=month', 'subsidies']) {
      const response = await fetch(`${base}/${path}`); assert.equal(response.status, 200, path);
      assert.ok((await response.json()).data);
    }
    assert.equal(reads, 5);
  } finally { await app.close(); }
});

test('production reports are registered and reject forged admin headers without querying database', async () => {
  process.env.SESSION_SECRET ??= 'test-only-session-secret-at-least-32-characters';
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../dist/app.module');
  const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  try {
    await app.listen(0, '127.0.0.1');
    for (const path of [`profitability?jobId=${jobId}`, 'overview?period=month', 'subsidies', 'pay-summary', 'export.csv?report=pay', 'export-csv?report=overview']) {
      const response = await fetch(`${await app.getUrl()}/api/v1/reports/${path}`, { headers: { 'x-role': 'ADMIN' } });
      assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'REPORTING_AUTH_UNAVAILABLE');
    }
  } finally { await app.close(); }
});
