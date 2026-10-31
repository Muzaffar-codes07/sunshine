const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTicketInputSchema, assessTicketInputSchema, resolveTicketInputSchema,
  confirmTicketInputSchema } = require('../dist');
const unitId = 'b3f02476-10ba-43dd-aa92-b3129796c148';

test('ticket commands reject workflow/link/price overrides and require bounded text/current version', () => {
  assert.deepEqual(createTicketInputSchema.parse({ unitId, faultDescription: ' Fault ' }), { unitId, faultDescription: 'Fault' });
  for (const field of ['customerId', 'jobId', 'status', 'assessmentSnapshot']) {
    assert.equal(createTicketInputSchema.safeParse({ unitId, faultDescription: 'Fault', [field]: 'forged' }).success, false);
  }
  const assess = { version: 1, asOfDate: '2025-07-01T00:00:00+05:30', requestedScope: 'Component repair' };
  assert.equal(assessTicketInputSchema.safeParse(assess).success, true);
  for (const patch of [{ version: 0 }, { version: 1.1 }, { version: '1' }, { version: 2147483647 },
    { asOfDate: '2025-07-01' }, { requestedScope: '' }, { requestedScope: null }, { customerCharge: '0.00' }]) {
    assert.equal(assessTicketInputSchema.safeParse({ ...assess, ...patch }).success, false);
  }
  assert.equal(resolveTicketInputSchema.safeParse({ version: 2, resolutionDetails: 'tested' }).success, true);
  assert.equal(resolveTicketInputSchema.safeParse({ version: 2, resolutionDetails: ' ' }).success, false);
});

test('closure contract requires all confirmation facts and accepts only supported channels/offset timestamps', () => {
  const input = { version: 3, confirmerName: 'Anita', channel: 'PHONE', confirmedAt: '2026-10-31T12:00:00+05:30' };
  for (const channel of ['PHONE', 'WHATSAPP', 'IN_PERSON']) assert.equal(confirmTicketInputSchema.safeParse({ ...input, channel }).success, true);
  for (const field of ['version', 'confirmerName', 'channel', 'confirmedAt']) {
    const missing = { ...input }; delete missing[field];
    assert.equal(confirmTicketInputSchema.safeParse(missing).success, false);
  }
  for (const patch of [{ confirmerName: ' ' }, { channel: 'EMAIL' }, { confirmedAt: '2026-10-31T12:00:00' },
    { closedAt: input.confirmedAt }, { status: 'CLOSED' }]) assert.equal(confirmTicketInputSchema.safeParse({ ...input, ...patch }).success, false);
});
