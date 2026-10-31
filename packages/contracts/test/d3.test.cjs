const { test } = require('node:test');
const assert = require('node:assert/strict');
const c = require('../dist');
const { id, at, receipt, typedScan, completion } = require('./fixtures/d3.cjs');

test('release command requires a version and explanation and rejects client-owned release facts', () => {
  assert.deepEqual(c.releaseOrderAllocationsRequestSchema.parse({ expectedVersion: 2, reason: '  Customer rescheduled  ' }), { expectedVersion: 2, reason: 'Customer rescheduled' });
  for (const input of [{ reason: 'Customer rescheduled' }, { expectedVersion: 0, reason: 'Customer rescheduled' },
    { expectedVersion: 1, reason: ' ' }, { expectedVersion: 1, reason: 'Customer rescheduled', releasedById: id(1) }]) {
    assert.equal(c.releaseOrderAllocationsRequestSchema.safeParse(input).success, false);
  }
});

test('unit traceability needs canonical source IDs and excludes released assignments', () => {
  const unit = { id: id(1), productId: id(2), manufacturerId: id(3), manufacturer: 'Example', serial: ' inv-a ',
    normalizedSerial: 'INV-A', status: 'AVAILABLE', locationId: id(4), receiptId: id(5), activeAssignment: null };
  assert.ok(c.unitDetailResponseSchema.safeParse({ data: unit }).success);
  for (const status of ['RESERVED', 'DISPATCHED', 'DELIVERED', 'INSTALLED']) {
    const activeAssignment = { allocationId: id(6), jobId: id(7), orderId: id(8), customerId: id(9), status };
    assert.ok(c.unitDetailResponseSchema.safeParse({ data: { ...unit, activeAssignment } }).success);
    assert.equal(c.unitDetailResponseSchema.safeParse({ data: { ...unit, activeAssignment: { ...activeAssignment, customerId: 'fake' } } }).success, false);
    assert.equal(c.unitDetailResponseSchema.safeParse({ data: { ...unit, activeAssignment: { ...activeAssignment, status: 'RELEASED' } } }).success, false);
  }
});

test('receipt preserves exact costs/quantities and original serial text', () => {
  const result = c.receiveStockRequestSchema.parse(receipt);
  assert.equal(result.lines[0].unitCost, '14000.00');
  assert.equal(result.lines[0].quantity, '2.000');
  assert.equal(result.lines[0].serials[0], ' INV-A ');
  assert.equal(c.normalizeEquipmentSerial(result.lines[0].serials[0]), 'INV-A');
});
test('receipt requires a canonical destination location UUID', () => {
  const { locationId, ...missingLocation } = receipt;
  assert.equal(c.receiveStockRequestSchema.parse(receipt).locationId, id(8));
  assert.equal(c.receiveStockRequestSchema.safeParse(missingLocation).success, false);
  assert.equal(c.receiveStockRequestSchema.safeParse({ ...receipt, locationId: 'Warehouse' }).success, false);
});
test('duplicate normalized serials across same-product receipt lines are rejected', () => {
  const line = { ...receipt.lines[0], quantity: '1', serials: [' inv-a '] };
  assert.equal(c.receiveStockRequestSchema.safeParse({ ...receipt, lines: [line, { ...line, serials: ['INV-A'] }] }).success, false);
  assert.equal(c.receiveStockRequestSchema.safeParse({ ...receipt, lines: [line, { ...line, productId: id(9) }] }).success, true);
});
test('serialized counts must match whole quantities, while bulk may be fractional', () => {
  for (const quantity of ['1', '1.500', '0', 'bad']) {
    assert.equal(c.stockReceiptLineSchema.safeParse({ ...receipt.lines[0], quantity }).success, false);
  }
  assert.equal(c.stockReceiptLineSchema.safeParse({ productId: id(1), quantity: '1.500', unitCost: '2.00' }).success, true);
});
test('receipt rejects negative/overprecision money and client-owned workflow fields', () => {
  for (const unitCost of ['-1', '1.001', '1000000000000', 14000]) {
    assert.equal(c.receiveStockRequestSchema.safeParse({ ...receipt, lines: [{ ...receipt.lines[0], unitCost }] }).success, false);
  }
  assert.equal(c.receiveStockRequestSchema.safeParse({ ...receipt, paid: true }).success, false);
});
test('allocation source is quote-line XOR ticket-line and physical units have quantity one', () => {
  assert.equal(c.allocationSourceSchema.safeParse({ kind: 'TICKET_LINE', ticketLineId: id(1) }).success, true);
  assert.equal(c.allocationSourceSchema.safeParse({ kind: 'QUOTE_LINE', quoteLineId: id(1), ticketLineId: id(2) }).success, false);
  assert.equal(c.allocationViewSchema.safeParse({ id: id(1), jobId: id(2), productId: id(3),
    source: { kind: 'TICKET_LINE', ticketLineId: id(4) }, unitId: id(5), quantity: '2', status: 'RESERVED' }).success, false);
  assert.equal(c.allocateOrderRequestSchema.safeParse({ expectedVersion: 1, paid: true, requirements: [] }).success, false);
});
test('unit choices and versions reject duplicates and stale-version placeholders', () => {
  assert.equal(c.allocateOrderRequestSchema.safeParse({ expectedVersion: 1, unitIds: [id(1), id(1)] }).success, false);
  assert.equal(c.dispatchRequestSchema.safeParse({ expectedVersion: 0 }).success, false);
  assert.equal(c.dispatchRequestSchema.safeParse({ expectedVersion: 1, customerId: id(2) }).success, false);
});
test('unit identity uses the catalogue manufacturer UUID and a display label', () => {
  const unit = { id: id(1), productId: id(2), manufacturerId: id(3), manufacturer: 'Solar Hardware Co',
    serial: ' INV-A ', normalizedSerial: 'INV-A', status: 'AVAILABLE' };
  assert.equal(c.unitViewSchema.parse(unit).manufacturerId, id(3));
  const { manufacturerId, ...missingManufacturer } = unit;
  assert.equal(c.unitViewSchema.safeParse(missingManufacturer).success, false);
  assert.equal(c.unitViewSchema.safeParse({ ...unit, manufacturerId: 'Solar Hardware Co' }).success, false);
});
test('typed scans can be represented but cannot count as required dispatch scans', () => {
  assert.equal(c.recordScanRequestSchema.parse({ rawValue: ' INV-A ', method: 'TYPED' }).rawValue, ' INV-A ');
  assert.equal(c.scanRecordSchema.parse(typedScan).countsForDispatch, false);
  assert.equal(c.scanRecordSchema.safeParse({ ...typedScan, countsForDispatch: true }).success, false);
  assert.equal(c.recordScanRequestSchema.safeParse({ rawValue: ' ', method: 'CAMERA' }).success, false);
  assert.equal(c.recordScanRequestSchema.safeParse({ rawValue: 'INV-A', method: 'SCANNER', countsForDispatch: true }).success, false);
});
test('stock summary preserves shortage instead of inventing zero availability', () => {
  assert.equal(c.stockSummarySchema.parse({ productId: id(1), onHand: '1', reserved: '2', free: '-1.000', asOf: at }).free, '-1.000');
  assert.equal(c.stockSummarySchema.safeParse({ productId: id(1), onHand: '1', reserved: '0', free: '-0', asOf: at }).success, false);
});
test('returns default to quarantine and replacement requires distinct units', () => {
  assert.equal(c.returnUnitRequestSchema.parse({ expectedVersion: 1, unitId: id(1), ticketLineId: id(2), reason: 'Faulty inverter' }).disposition, 'QUARANTINE');
  assert.equal(c.replacementStockRequestSchema.safeParse({ expectedVersion: 1, ticketLineId: id(2), oldUnitId: id(1), newUnitId: id(1) }).success, false);
});
test('schedule rejects duplicate crew members and backwards periods', () => {
  const schedule = { expectedVersion: 1, scheduledStart: at, scheduledFinish: completion.finishedAt, technicianIds: [id(7)] };
  assert.equal(c.scheduleJobRequestSchema.safeParse(schedule).success, true);
  assert.equal(c.scheduleJobRequestSchema.safeParse({ ...schedule, technicianIds: [id(7), id(7)] }).success, false);
  assert.equal(c.scheduleJobRequestSchema.safeParse({ ...schedule, scheduledFinish: at }).success, false);
});
test('completion requires photographs and separate signature with valid times and size', () => {
  assert.equal(c.completeInstallationRequestSchema.safeParse(completion).success, true);
  for (const patch of [{ photoFileIds: [] }, { signatureFileId: id(5) }, { finishedAt: at },
    { installedCapacityKw: 6 }, { installedCapacityKw: Infinity }, { signerName: '' }]) {
    assert.equal(c.completeInstallationRequestSchema.safeParse({ ...completion, ...patch }).success, false);
  }
  assert.equal(c.completeInstallationRequestSchema.safeParse({ ...completion, hourlyRate: '300' }).success, false);
});
test('time/checklist transport rejects negative durations, duplicate checks and client costs', () => {
  assert.equal(c.installationTimeRecordInputSchema.safeParse({ technicianId: id(7), startedAt: at, finishedAt: at }).success, false);
  assert.equal(c.completeInstallationRequestSchema.safeParse({ ...completion, completedChecks: ['EARTHING', 'EARTHING'] }).success, false);
  assert.equal(c.installationTimeRecordInputSchema.safeParse({ ...completion.timeRecords[0], cost: '1200' }).success, false);
});
test('timezone-aware field timestamps compare instants and reject naive local times', () => {
  assert.equal(c.installationTimeRecordInputSchema.safeParse({ technicianId: id(7),
    startedAt: '2026-10-01T14:00:00+05:30', finishedAt: '2026-10-01T09:00:00Z' }).success, true);
  assert.equal(c.startInstallationRequestSchema.safeParse({ expectedVersion: 1, startedAt: '2026-10-01T14:00:00' }).success, false);
  assert.equal(c.deliverDispatchRequestSchema.safeParse({ expectedVersion: 1, deliveredAt: '2026-10-01T15:30:00+05:30' }).success, true);
});
test('completion bounds labour to its interval and prevents overlapping pay per technician', () => {
  assert.equal(c.completeInstallationRequestSchema.safeParse({ ...completion, timeRecords: [{
    ...completion.timeRecords[0], startedAt: '2020-01-01T00:00:00Z', finishedAt: '2030-01-01T00:00:00Z',
  }] }).success, false);
  assert.equal(c.completeInstallationRequestSchema.safeParse({ ...completion,
    timeRecords: [completion.timeRecords[0], completion.timeRecords[0]],
  }).success, false);
  const first = { ...completion.timeRecords[0], finishedAt: '2026-10-01T12:00:00Z' };
  const second = { ...completion.timeRecords[0], startedAt: '2026-10-01T12:00:00Z' };
  assert.equal(c.completeInstallationRequestSchema.safeParse({ ...completion, timeRecords: [second, first] }).success, true);
  assert.equal(c.completeInstallationRequestSchema.safeParse({ ...completion, installedCapacityKw: 2.5 }).success, false);
});
test('general returns express unused serialized equipment and fractional bulk without a ticket', () => {
  const base = { expectedVersion: 1, source: { kind: 'ALLOCATION', allocationId: id(3) },
    unitId: null, quantity: '2.500', reason: 'Unused cable', disposition: 'RETURN_TO_STOCK' };
  assert.equal(c.returnStockRequestSchema.safeParse(base).success, true);
  assert.equal(c.returnStockRequestSchema.safeParse({ ...base, unitId: id(4), quantity: '1' }).success, true);
  assert.equal(c.returnStockRequestSchema.safeParse({ ...base, unitId: id(4) }).success, false);
  assert.equal(c.returnStockRequestSchema.safeParse({ ...base, source: { kind: 'TICKET_LINE', ticketLineId: id(2) } }).success, true);
  assert.equal(c.returnStockRequestSchema.safeParse({ ...base, source: { kind: 'ALLOCATION' } }).success, false);
});
test('zero receipt cost requires an explicit reason rather than a silent default', () => {
  const line = { productId: id(1), quantity: '1', unitCost: '0.00' };
  assert.equal(c.stockReceiptLineSchema.safeParse(line).success, false);
  assert.equal(c.stockReceiptLineSchema.safeParse({ ...line, zeroCostReason: 'Supplier-funded replacement' }).success, true);
});

test('transfer and count drafts reject duplicate products and a same-location move', () => {
  const productId = id(1);
  const fromLocationId = id(2);
  const toLocationId = id(3);
  const transfer = { reference: 'TR-1', fromLocationId, toLocationId, lines: [{ productId, quantity: '2' }] };
  assert.equal(c.createStockTransferRequestSchema.safeParse(transfer).success, true);
  assert.equal(c.createStockTransferRequestSchema.safeParse({ ...transfer, toLocationId: fromLocationId }).success, false);
  assert.equal(c.createStockTransferRequestSchema.safeParse({ ...transfer, lines: [transfer.lines[0], transfer.lines[0]] }).success, false);
  assert.equal(c.createStockTransferRequestSchema.safeParse({ ...transfer, lines: [{ productId, quantity: '2', serials: ['A'] }] }).success, false);
  assert.equal(c.createStockTransferRequestSchema.safeParse({ ...transfer, lines: [{ productId, quantity: '2', serials: ['ab', ' AB '] }] }).success, false);
  const count = { reference: 'CT-1', locationId: toLocationId, lines: [{ productId, countedQuantity: '0' }] };
  assert.equal(c.createStockCountRequestSchema.safeParse(count).success, true);
  assert.equal(c.createStockCountRequestSchema.safeParse({ ...count, lines: [count.lines[0], count.lines[0]] }).success, false);
  assert.equal(c.stockDocumentCommandRequestSchema.safeParse({}).success, false);
});

test('allocation requests lowercase unit IDs, so both spellings count as one unit', () => {
  const unit = 'abcdef00-0000-4000-8000-000000000001';
  assert.deepEqual(c.allocateOrderRequestSchema.parse({ expectedVersion: 1, unitIds: [unit.toUpperCase()] }).unitIds, [unit]);
  assert.equal(c.allocateOrderRequestSchema.safeParse({ expectedVersion: 1, unitIds: [unit, unit.toUpperCase()] }).success, false);
  assert.equal(c.allocateOrderRequestSchema.safeParse({}).success, false);
});
