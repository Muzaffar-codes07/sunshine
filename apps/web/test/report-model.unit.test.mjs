import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatMoney,
  overviewCsvUrl,
  payCsvUrl,
  profitabilityCsvUrl,
  subsidyNextAction,
} from '../src/features/reports/report-model.ts';

test('formats exact decimal strings without binary money arithmetic', () => {
  assert.equal(formatMoney('0.00'), '₹0.00');
  assert.equal(formatMoney('123456789012.34'), '₹123,456,789,012.34');
  assert.equal(formatMoney('-2000.00'), '-₹2,000.00');
});

test('builds bounded report CSV links', () => {
  assert.equal(overviewCsvUrl('week'), '/api/v1/reports/export.csv?report=overview&period=week');
  assert.equal(payCsvUrl('month'), '/api/v1/reports/export.csv?report=pay&period=month');
  assert.equal(profitabilityCsvUrl('11111111-1111-4111-8111-111111111111'),
    '/api/v1/reports/export.csv?report=profitability&jobId=11111111-1111-4111-8111-111111111111');
});

test('subsidy next action prefers missing evidence, then the responsible owner', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111', jobId: '22222222-2222-4222-8222-222222222222',
    stage: 'DISCOM review', status: 'PENDING_DOCS', submissionDate: null, approvalDate: null,
    amount: '1000.00', evidenceFileId: null,
  };
  assert.equal(subsidyNextAction({ ...base, pendingDocuments: ['meter photo'], responsibleOwner: { id: base.id, name: 'Asha' } }), 'Collect: meter photo');
  assert.equal(subsidyNextAction({ ...base, pendingDocuments: [], responsibleOwner: { id: base.id, name: 'Asha' } }), 'Follow up with Asha');
  assert.equal(subsidyNextAction({ ...base, pendingDocuments: [], responsibleOwner: null }), 'Assign a responsible owner');
  assert.equal(subsidyNextAction({ ...base, status: 'APPROVED', pendingDocuments: [], responsibleOwner: null }), 'Await recorded disbursement');
  assert.equal(subsidyNextAction({ ...base, status: 'DISBURSED', pendingDocuments: [], responsibleOwner: null }), 'Complete');
  assert.equal(subsidyNextAction({ ...base, status: 'REJECTED', pendingDocuments: [], responsibleOwner: null }), 'Review rejection and decide whether to resubmit');
});
