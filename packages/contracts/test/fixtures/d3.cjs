// Development/test examples only. No production API imports these values.
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = '2026-10-01T10:00:00.000Z';
const receipt = { reference: 'D3-DEMO-RECEIPT-1', locationId: id(8), receivedAt: at, lines: [
  { productId: id(1), quantity: '2.000', unitCost: '14000.00', serials: [' INV-A ', 'INV-B'] },
] };
const typedScan = { id: id(2), unitId: id(3), actorId: id(4), rawValue: ' INV-A ',
  normalizedSerial: 'INV-A', method: 'TYPED', recordedAt: at, countsForDispatch: false };
const completion = { expectedVersion: 1, startedAt: at, finishedAt: '2026-10-01T14:00:00.000Z',
  installedCapacityKw: 3, photoFileIds: [id(5)], signatureFileId: id(6), signerName: 'Sample Homeowner',
  completedChecks: ['MOUNTING', 'PANELS', 'WIRING', 'EARTHING', 'POWER_GENERATION'],
  timeRecords: [{ technicianId: id(7), startedAt: at, finishedAt: '2026-10-01T14:00:00.000Z' }] };
module.exports = { id, at, receipt, typedScan, completion,
  // These require future service tests with an explicit clock/context; parsing alone cannot enforce them.
  deliveryServiceCases: [
    { name: 'before dispatch', request: { expectedVersion: 1, deliveredAt: '2026-10-01T09:00:00.000Z' },
      context: { dispatchedAt: at, now: '2026-10-01T12:00:00.000Z' }, expected: 'REJECT' },
    { name: 'future delivery', request: { expectedVersion: 1, deliveredAt: '2026-10-01T13:00:00.000Z' },
      context: { dispatchedAt: at, now: '2026-10-01T12:00:00.000Z' }, expected: 'REJECT' },
  ],
};
