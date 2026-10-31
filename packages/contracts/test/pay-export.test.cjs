const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reportExportQuerySchema, technicianPayReportSchema, technicianPaySummarySchema } = require('../dist');
const technicianId = 'c3f02476-10ba-43dd-aa92-b3129796c148';

test('CSV query accepts only supported scoped report filters and defaults periods', () => {
  for (const report of ['overview', 'pay']) {
    assert.deepEqual(reportExportQuerySchema.parse({ report }), { report, period: 'today' });
    assert.equal(reportExportQuerySchema.safeParse({ report, period: 'month' }).success, true);
  }
  assert.equal(reportExportQuerySchema.safeParse({ report: 'profitability', jobId: technicianId }).success, true);
  for (const value of [{}, { report: 'all' }, { report: ['pay', 'overview'] }, { report: 'profitability' },
    { report: 'profitability', jobId: 'bad' }, { report: 'pay', jobId: technicianId },
    { report: 'pay', period: 'year' }, { report: 'pay', period: ['week', 'month'] },
    { report: 'overview', asOf: '2030-01-01' }, { report: 'profitability', jobId: technicianId, period: 'month' }]) {
    assert.equal(reportExportQuerySchema.safeParse(value).success, false, JSON.stringify(value));
  }
});

test('pay aggregate contracts retain exact precision beyond a single stored row', () => {
  const summary = { technicianId, technicianName: 'Technician', totalHours: '1999999999.998', totalPay: '1999999999997980000000.00' };
  assert.deepEqual(technicianPaySummarySchema.parse(summary), summary);
  for (const override of [{ totalHours: '-1.000' }, { totalHours: '1.0001' }, { totalHours: 1 },
    { totalPay: '-0.00' }, { totalPay: '-1.00' }, { totalPay: '1.001' }, { technicianName: ' ' }]) {
    assert.equal(technicianPaySummarySchema.safeParse({ ...summary, ...override }).success, false);
  }
  const report = { period: 'today', timezone: 'Asia/Kolkata', startDate: '2026-10-31', endDate: '2026-11-01',
    startUtc: '2026-10-30T18:30:00.000Z', endUtc: '2026-10-31T18:30:00.000Z', asOf: '2026-10-31T12:00:00.000Z',
    technicians: [], totalHours: '0.000', totalPay: '0.00' };
  assert.deepEqual(technicianPayReportSchema.parse(report), report);
  assert.equal(technicianPayReportSchema.safeParse({ ...report, totalPay: '-1.00' }).success, false);
});
