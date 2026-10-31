const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  WarrantyStatus, TicketStatus, CostType,
  warrantyStatusSchema, ticketStatusSchema, costTypeSchema,
  warrantyAssessmentResultSchema, ticketLineSchema, customerConfirmationSchema,
  createCostEntryInputSchema, dateRangeFilterSchema,
  jobProfitabilitySchema, paySummarySchema,
  warrantyPolicySchema, subsidyMilestoneSchema, signedMoneySchema,
} = require('../dist');

const id = 'b3f02476-10ba-43dd-aa92-b3129796c148';

test('domain enums expose the requested wire values', () => {
  assert.deepEqual(warrantyStatusSchema.options, ['ACTIVE', 'EXPIRED', 'VOID']);
  assert.deepEqual(ticketStatusSchema.options, [
    'OPEN', 'ASSESSED', 'IN_PROGRESS', 'AWAITING_CUSTOMER_CONFIRMATION', 'CLOSED',
  ]);
  assert.deepEqual(costTypeSchema.options, [
    'MATERIAL_DISPATCH', 'INSTALLATION_LABOUR', 'SERVICE_LABOUR', 'REPAIR_PARTS',
  ]);
  assert.equal(WarrantyStatus.ACTIVE, 'ACTIVE');
  assert.equal(TicketStatus.AWAITING_CUSTOMER_CONFIRMATION, 'AWAITING_CUSTOMER_CONFIRMATION');
  assert.equal(ticketStatusSchema.safeParse('AWAITING_CONFIRMATION').success, false);
  assert.equal(CostType.SERVICE_LABOUR, 'SERVICE_LABOUR');
});

test('warranty dates are valid ordered calendar dates and covered work is free', () => {
  const assessment = {
    unitId: id, serial: 'INV-001', policyName: 'Component cover',
    startDate: '2024-02-29', expiryDate: '2026-02-28',
    asOfDate: '2025-08-29', policyRevision: 'v1', scope: 'Component replacement',
    coverageStatus: 'COVERED', chargeStatus: 'FREE',
    isCovered: true, reason: 'Within saved component policy', customerCharge: '0.00',
  };
  assert.equal(warrantyAssessmentResultSchema.safeParse(assessment).success, true);
  for (const change of [
    { startDate: '2025-02-29' }, { expiryDate: assessment.startDate },
    { expiryDate: '2023-12-31' }, { customerCharge: '1.00' }, { reason: '  ' },
  ]) {
    assert.equal(warrantyAssessmentResultSchema.safeParse({ ...assessment, ...change }).success, false);
  }
  assert.equal(warrantyAssessmentResultSchema.safeParse({
    ...assessment, isCovered: false, coverageStatus: 'EXPIRED',
    chargeStatus: 'PENDING_ASSESSMENT', customerCharge: null,
  }).success, true);
  assert.equal(warrantyAssessmentResultSchema.safeParse({
    ...assessment, coverageStatus: 'NO_WARRANTY', isCovered: false,
    chargeStatus: 'PENDING_ASSESSMENT', customerCharge: null,
    policyName: null, policyRevision: null, scope: null, startDate: null, expiryDate: null,
  }).success, true);
  for (const change of [
    { isCovered: false }, { startDate: null }, { policyRevision: null },
    { customerCharge: null }, { chargeStatus: 'PENDING_ASSESSMENT' }, { asOfDate: '2025-02-29' },
  ]) assert.equal(warrantyAssessmentResultSchema.safeParse({ ...assessment, ...change }).success, false);
});

test('cost input preserves decimal money without coercion or excess precision', () => {
  const cost = {
    uniqueSourceId: `TIME_ENTRY:${id}`, jobId: id, amount: '600.00',
    costType: 'SERVICE_LABOUR', description: 'Replacement labour',
  };
  assert.equal(createCostEntryInputSchema.parse(cost).amount, '600.00');
  for (const amount of [600, '-1.00', '1.001', '1e3', 'NaN', '1000000000000.00', '']) {
    assert.equal(createCostEntryInputSchema.safeParse({ ...cost, amount }).success, false);
  }
  assert.equal(createCostEntryInputSchema.safeParse({ ...cost, amount: '999999999999.99' }).success, true);
  assert.equal(createCostEntryInputSchema.safeParse({ ...cost, uniqueSourceId: ' ' }).success, false);
  assert.equal(createCostEntryInputSchema.safeParse({ ...cost, jobId: 'job-1' }).success, false);
});

test('ticket lines accept fractional labour and reject invalid quantities', () => {
  const line = {
    type: 'LABOUR', description: 'Repair labour', quantity: '1.5',
    unitCost: '300.00', totalCost: '450.00', billableToCustomer: false,
  };
  assert.equal(ticketLineSchema.safeParse(line).success, true);
  assert.equal(ticketLineSchema.safeParse({ ...line, type: 'PART', quantity: '1' }).success, true);
  for (const quantity of ['0.001', '999999999.999']) {
    assert.equal(ticketLineSchema.safeParse({ ...line, quantity }).success, true);
  }
  for (const quantity of [0, 1.5, -1, Infinity, NaN, '0', '0.000', '-1', '1.0001', '1000000000', '1e3']) {
    assert.equal(ticketLineSchema.safeParse({ ...line, quantity }).success, false);
  }
  assert.equal(ticketLineSchema.safeParse({ ...line, description: ' ' }).success, false);
  assert.equal(ticketLineSchema.safeParse({ ...line, billableToCustomer: undefined }).success, false);
});

test('confirmation requires name, supported channel and timezone-aware timestamp', () => {
  const confirmation = {
    confirmerName: 'Customer', channel: 'PHONE', confirmedAt: '2026-10-31T17:00:00+05:30',
  };
  assert.equal(customerConfirmationSchema.safeParse(confirmation).success, true);
  assert.equal(customerConfirmationSchema.safeParse({ ...confirmation, confirmedAt: '2026-10-31T11:30:00Z' }).success, true);
  for (const change of [
    { confirmerName: ' ' }, { channel: 'EMAIL' }, { confirmedAt: undefined },
    { confirmedAt: '2026-10-31T17:00:00' },
  ]) {
    assert.equal(customerConfirmationSchema.safeParse({ ...confirmation, ...change }).success, false);
  }
});

test('report filters preserve half-open IST dates across calendar boundaries', () => {
  for (const range of [
    { startDate: '2024-02-29', endDate: '2024-03-01' },
    { startDate: '2026-12-31', endDate: '2027-01-01' },
  ]) {
    assert.deepEqual(dateRangeFilterSchema.parse(range), range);
  }
  for (const range of [
    { startDate: '2025-02-29', endDate: '2025-03-01' },
    { startDate: '2026-10-31', endDate: '2026-10-31' },
    { startDate: '2026-11-01', endDate: '2026-10-31' },
    { startDate: '2026-10-31T00:00:00Z', endDate: '2026-11-01' },
  ]) {
    assert.equal(dateRangeFilterSchema.safeParse(range).success, false);
  }
});

test('reports represent a loss, unpaid revenue and frozen-rate aggregate pay', () => {
  const profitability = {
    jobId: id, isCompleted: true, invoicedRevenue: '55000.00', cashReceived: '55000.00',
    outstanding: '0.00', actualCost: '57000.00', contribution: '-2000.00',
  };
  assert.deepEqual(jobProfitabilitySchema.parse(profitability), profitability);
  assert.equal(jobProfitabilitySchema.safeParse({
    ...profitability, isCompleted: false, cashReceived: '0', outstanding: '55000.00',
  }).success, true);
  const pay = { technicianId: id, technicianName: 'Technician', totalHours: '3.5', totalPay: '1100.00' };
  assert.deepEqual(paySummarySchema.parse(pay), pay);
  assert.equal(paySummarySchema.safeParse({ ...pay, totalHours: '0.000' }).success, true);
  for (const totalHours of [-1, 3.5, '-1', '1.0001', '1000000000', '0.30000000000000004']) {
    assert.equal(paySummarySchema.safeParse({ ...pay, totalHours }).success, false);
  }
  assert.equal(paySummarySchema.safeParse({ ...pay, totalPay: 1100 }).success, false);
});

test('policy snapshots require revision, scope and a positive calendar duration', () => {
  const policy = { policyName: 'Inverter cover', revision: 'v1', scope: 'Component replacement', durationMonths: 24 };
  assert.deepEqual(warrantyPolicySchema.parse(policy), policy);
  for (const change of [
    { revision: ' ' }, { scope: '' }, { durationMonths: 0 },
    { durationMonths: 1.5 }, { durationMonths: '24' },
  ]) {
    assert.equal(warrantyPolicySchema.safeParse({ ...policy, ...change }).success, false);
  }
});

test('subsidy projection supports pending evidence and compares event instants', () => {
  const milestone = {
    id, jobId: id, stage: 'Application', status: 'PENDING',
    submissionDate: null, approvalDate: null, amount: '0.00', evidenceFileId: null,
  };
  assert.deepEqual(subsidyMilestoneSchema.parse(milestone), milestone);
  const submitted = {
    ...milestone, submissionDate: '2026-10-31T17:00:00+05:30',
    approvalDate: '2026-10-31T12:00:00Z', evidenceFileId: id,
  };
  assert.equal(subsidyMilestoneSchema.safeParse(submitted).success, true);
  for (const change of [
    { approvalDate: '2026-10-31T11:00:00Z' }, { amount: 1000 },
    { evidenceFileId: 'file-1' }, { stage: ' ' }, { status: '' },
    { submissionDate: '2026-10-31T17:00:00' },
  ]) {
    assert.equal(subsidyMilestoneSchema.safeParse({ ...submitted, ...change }).success, false);
  }
});

test('signed money preserves losses and rejects negative zero spellings', () => {
  for (const amount of ['-0', '-0.0', '-0.00']) {
    assert.equal(signedMoneySchema.safeParse(amount).success, false);
  }
  for (const amount of ['0', '0.00', '-0.01', '-2000.00']) {
    assert.equal(signedMoneySchema.parse(amount), amount);
  }
});
