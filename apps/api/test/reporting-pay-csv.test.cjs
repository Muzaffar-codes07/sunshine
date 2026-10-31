const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { ReportingService, reportWindow } = require('../dist/reporting/reporting.service');
const { PrismaReportingReader } = require('../dist/reporting/reporting.repository');
const { CsvExporterService } = require('../dist/reporting/csv-exporter.service');
const { ReportingAccess, UnavailableReportingSourceReader } = require('../dist/reporting/reporting-readers');
const { ApiError } = require('../dist/platform/api-error');
const tech = 'c3f02476-10ba-43dd-aa92-b3129796c148';
const otherTech = 'd3f02476-10ba-43dd-aa92-b3129796c148';
const asOf = new Date('2026-10-31T12:00:00Z');
const entry = (index, override = {}) => ({
  id: `b3f02476-10ba-43dd-aa92-${String(index).padStart(12, '0')}`,
  technicianId: tech, technicianName: 'Technician', status: 'APPROVED', hours: '1.000', frozenHourlyRate: '100.00',
  occurredAt: new Date('2026-10-31T00:00:00Z'), approvedAt: asOf, ...override,
});
const serviceFor = (rows) => new ReportingService({ async readTimeEntries(window) {
  assert.equal(window.asOf, asOf); return rows;
} });
const code = (status, name) => (error) => error instanceof ApiError && error.getStatus() === status && error.code === name;

test('pay groups approved time by technician using frozen per-entry rates and per-entry half-up rounding', async () => {
  const service = serviceFor([
    entry(1, { hours: '1.250', frozenHourlyRate: '100.00' }),
    entry(2, { hours: '2.500', frozenHourlyRate: '200.00' }),
    entry(3, { hours: '0.005', frozenHourlyRate: '1.00' }),
    entry(4, { hours: '0.005', frozenHourlyRate: '1.00' }),
    entry(5, { technicianId: otherTech, technicianName: 'Other', hours: '0.001', frozenHourlyRate: '0.00' }),
    entry(6, { status: 'PENDING', approvedAt: null }), entry(7, { status: 'REJECTED', approvedAt: null }),
  ]);
  const report = await service.getTechnicianPaySummary('today', asOf);
  assert.deepEqual(report.technicians, [
    { technicianId: tech, technicianName: 'Technician', totalHours: '3.760', totalPay: '625.02' },
    { technicianId: otherTech, technicianName: 'Other', totalHours: '0.001', totalPay: '0.00' },
  ]);
  assert.equal(report.totalHours, '3.761'); assert.equal(report.totalPay, '625.02');
  assert.equal(report.timezone, 'Asia/Kolkata'); assert.equal(report.startUtc, '2026-10-30T18:30:00.000Z');
  assert.equal(Object.hasOwn(report, 'actualCost'), false); // no duplicate ledger expense
});

test('pay respects IST work window and server approval cutoff, with empty and large exact aggregates', async () => {
  const window = reportWindow('today', asOf);
  const rows = [entry(1, { occurredAt: new Date(window.start.getTime() - 1) }), entry(2, { occurredAt: window.start }),
    entry(3, { occurredAt: window.end, approvedAt: window.end }),
    entry(4, { occurredAt: new Date(asOf.getTime() + 1), approvedAt: new Date(asOf.getTime() + 1) }),
    entry(5, { approvedAt: new Date(asOf.getTime() + 1) }), entry(6, { occurredAt: asOf })];
  const report = await serviceFor(rows).getTechnicianPaySummary('today', asOf);
  assert.equal(report.totalPay, '200.00'); assert.equal(report.totalHours, '2.000');
  const empty = await serviceFor([]).getTechnicianPaySummary('week', asOf);
  assert.deepEqual(empty.technicians, []); assert.equal(empty.totalPay, '0.00'); assert.equal(empty.totalHours, '0.000');
  const large = await serviceFor([1, 2].map((i) => entry(i, { hours: '999999999.999', frozenHourlyRate: '999999999999.99' })))
    .getTechnicianPaySummary('month', asOf);
  assert.equal(large.totalHours, '1999999999.998'); assert.equal(large.totalPay, '1999999999997980000000.00');
});

test('invalid persisted time fails with structured errors and duplicate IDs never double pay', async () => {
  for (const invalid of [null, undefined, {}, [null], [entry(1, { hours: '0' })], [entry(1, { hours: 1 })],
    [entry(1, { frozenHourlyRate: '-1' })], [entry(1, { frozenHourlyRate: '1.001' })],
    [entry(1, { technicianName: ' ' })], [entry(1, { occurredAt: new Date('bad') })],
    [entry(1, { approvedAt: null })], [entry(1, { approvedAt: new Date('2020-01-01') })],
    [entry(1), entry(1)], [entry(1), entry(2, { technicianName: 'Different' })]]) {
    await assert.rejects(serviceFor(invalid).getTechnicianPaySummary('today', asOf), code(503, 'INVALID_REPORT_RECORD'));
  }
  const service = new ReportingService({ async readTimeEntries() { throw new Error('must not read'); } });
  await assert.rejects(service.getTechnicianPaySummary('year', asOf), code(400, 'INVALID_INPUT'));
  await assert.rejects(service.getTechnicianPaySummary('today', new Date('bad')), code(400, 'INVALID_INPUT'));
});

test('time reader uses same RepeatableRead transaction and unavailable source stays explicit', async () => {
  const window = reportWindow('month', asOf), tx = {};
  const reader = new PrismaReportingReader({ async $transaction(callback, options) {
    assert.equal(options.isolationLevel, 'RepeatableRead'); return callback(tx);
  } }, { async readTimeEntries(transaction, passed) { assert.equal(transaction, tx); assert.equal(passed, window); return [entry(1)]; } });
  assert.deepEqual(await reader.readTimeEntries(window), [entry(1)]);
  await assert.rejects(new UnavailableReportingSourceReader().readTimeEntries(tx, window), code(503, 'REPORTING_TIME_SOURCE_UNAVAILABLE'));
});

test('CSV uses RFC4180 quotes, CRLF, Unicode and multiline fields and neutralizes text formulas', () => {
  const csv = new CsvExporterService({});
  assert.equal(csv.exportRows(['name', 'amount'], [['A, "B"\r\nC ₹', { kind: 'number', value: '-1500.00' }]]),
    '"name","amount"\r\n"A, ""B""\r\nC ₹","-1500.00"\r\n');
  for (const text of ['=1+1', '+SUM(1,2)', '-cmd', '@SUM(A1)', '  =1', '\t=1', '\r+1', '\n@x', ' \tname', '\uFEFF=1', '-1500.00', '\u0000=1']) {
    assert.equal(csv.exportRows(['text'], [[text]]), `"text"\r\n"'${text}"\r\n`, JSON.stringify(text));
  }
  assert.equal(csv.exportRows(['text'], [['normal-name']]), '"text"\r\n"normal-name"\r\n');
  assert.equal(csv.exportRows(['text'], []), '"text"\r\n');
  assert.throws(() => csv.exportRows(['x'], [[{ kind: 'number', value: '-1+2' }]]), code(503, 'INVALID_REPORT_RECORD'));
  assert.throws(() => csv.exportRows(['x'], [['x', 'y']]), code(503, 'INVALID_REPORT_RECORD'));
});

test('profitability CSV keeps real negative losses numeric and sanitizes unfinished-step text', async () => {
  const report = await new ReportingService({ async readJob() { return {
    jobId: tech, isCompleted: false, unfinishedSteps: [' =HYPERLINK("x")'], invoices: [{ amount: '500' }],
    payments: [], costs: [{ costType: 'SERVICE_LABOUR', amount: '2000' }],
  }; } }).getJobProfitability(tech, asOf);
  const csv = new CsvExporterService({}).exportProfitabilityToCsv([report]);
  assert.ok(csv.includes('"-1500.00","0.00","-300.00"'));
  // The report contract trims leading whitespace, but the formula remains text.
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
  await assert.rejects(new CsvExporterService({}).exportReportsCsv({ report: 'pay', period: 'year' }), code(400, 'INVALID_INPUT'));
});

test('HTTP pay and CSV use ADMIN guard, strict filters, safe download headers and JSON error envelopes', async () => {
  const { Module } = require('@nestjs/common');
  const { NestFactory } = require('@nestjs/core');
  const { ReportingController, ReportingGuard } = require('../dist/reporting/reporting.controller');
  const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
  let mode = 'denied', reads = 0;
  const service = new ReportingService({
    async readTimeEntries(window) { reads++; if (mode === 'source-unavailable') throw new ApiError(503, 'REPORTING_TIME_SOURCE_UNAVAILABLE', 'No time source');
      return [entry(1, { technicianName: '=SUM(1,2)', occurredAt: window.start, approvedAt: window.asOf })]; },
    async readPeriod() { reads++; return { invoices: [], payments: [], costs: [] }; },
    async readJob(id) { reads++; return { jobId: id, isCompleted: true, unfinishedSteps: [], invoices: [], payments: [], costs: [] }; },
  });
  class TestModule {}
  Module({ controllers: [ReportingController], providers: [ReportingGuard, CsvExporterService,
    { provide: ReportingService, useValue: service }, { provide: ReportingAccess, useValue: {
      async assertCanReadReports() { if (mode === 'denied') throw new ApiError(403, 'FORBIDDEN', 'ADMIN required'); },
    } }],
  })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  try {
    await app.listen(0, '127.0.0.1'); const base = `${await app.getUrl()}/api/v1/reports`;
    for (const path of ['pay-summary', 'export.csv?report=pay', 'export-csv?report=overview']) {
      const response = await fetch(`${base}/${path}`, { headers: { 'x-role': 'ADMIN' } });
      assert.equal(response.status, 403); assert.ok((await response.json()).error.requestId);
    }
    assert.equal(reads, 0); mode = 'admin';
    for (const path of ['export.csv', 'export.csv?report=bad', 'export.csv?report=pay&jobId=x',
      'export.csv?report=profitability', 'export.csv?report=profitability&jobId=bad',
      'export.csv?report=pay&period=year', 'export.csv?report=pay&report=overview',
      'export.csv?report=pay&period=week&period=month', 'pay-summary?rate=1000', 'pay-summary?period=year',
      'export.csv?report=pay&asOf=2030-01-01']) {
      const response = await fetch(`${base}/${path}`); assert.equal(response.status, 400, path);
      assert.equal((await response.json()).error.code, 'INVALID_INPUT');
    }
    assert.equal(reads, 0);
    const pay = await fetch(`${base}/pay-summary?period=month`); assert.equal(pay.status, 200);
    assert.equal((await pay.json()).data.totalPay, '100.00');
    for (const path of ['export.csv?report=pay', 'export-csv?report=overview', `export.csv?report=profitability&jobId=${tech}`]) {
      const response = await fetch(`${base}/${path}`); assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), /^text\/csv; charset=utf-8/);
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="sunshine-report.csv"');
      assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      const body = await response.text(); assert.ok(body.endsWith('\r\n'));
      if (path.includes('report=pay')) assert.ok(body.includes('"\'=SUM(1,2)"'));
    }
    mode = 'source-unavailable';
    const failed = await fetch(`${base}/export.csv?report=pay`); assert.equal(failed.status, 503);
    assert.match(failed.headers.get('content-type'), /application\/json/);
    assert.equal((await failed.json()).error.code, 'REPORTING_TIME_SOURCE_UNAVAILABLE');
  } finally { await app.close(); }
});
