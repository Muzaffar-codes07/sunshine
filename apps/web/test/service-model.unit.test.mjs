import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageLabel, nextTicketAction, warrantyPeriod } from '../src/features/service/service-model.ts';

test('maps server ticket states to the next visible command', () => {
  assert.equal(nextTicketAction('OPEN'), 'ASSESS');
  assert.equal(nextTicketAction('ASSESSED'), 'RESOLVE');
  assert.equal(nextTicketAction('IN_PROGRESS'), 'RESOLVE');
  assert.equal(nextTicketAction('AWAITING_CUSTOMER_CONFIRMATION'), 'CONFIRM');
  assert.equal(nextTicketAction('CLOSED'), 'DONE');
});

test('keeps customer charge separate from coverage explanation', () => {
  const covered = {
    unitId: '11111111-1111-4111-8111-111111111111', serial: 'INV-001', asOfDate: '2026-11-01',
    policyName: 'Demo', policyRevision: '1', scope: 'inverter', startDate: '2025-11-01', expiryDate: '2027-11-01',
    coverageStatus: 'COVERED', isCovered: true, reason: 'Inside saved policy dates', customerCharge: '0.00', chargeStatus: 'FREE',
    requestedScope: 'inverter', assessedAt: '2026-11-01T00:00:00.000Z',
  };
  assert.equal(coverageLabel(covered), 'Covered — customer charge ₹0.00');
  assert.equal(warrantyPeriod(covered), '2025-11-01 to 2027-11-01 (expiry excluded)');
  assert.equal(coverageLabel({ ...covered, coverageStatus: 'EXPIRED', isCovered: false, customerCharge: null, chargeStatus: 'PENDING_ASSESSMENT' }),
    'Not covered — charge pending assessment');
});
