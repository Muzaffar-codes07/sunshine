const { test } = require('node:test');
const assert = require('node:assert/strict');
const { confirmOrderSchema, recordPaymentSchema } = require('../dist');

const fieldErrors = (result) => result.error.issues.map((issue) => issue.path[0]);
const receipt = { amountInr: '25000', method: 'UPI', reference: ' UTR123456 ', receivedAt: '2026-10-31T18:30:00+05:30' };

test('confirmation takes only the quote; totals and lines always come from the server', () => {
  assert.deepEqual(confirmOrderSchema.parse({ quoteId: 'b3f02476-10ba-43dd-aa92-b3129796c148' }), { quoteId: 'b3f02476-10ba-43dd-aa92-b3129796c148' });
  assert.equal(confirmOrderSchema.safeParse({ quoteId: 'b3f02476-10ba-43dd-aa92-b3129796c148', total: '1.00' }).success, false);
  assert.equal(confirmOrderSchema.safeParse({ quoteId: 'quote-1' }).success, false);
});

test('a receipt normalises money and reference, and rejects zero, negative, over-precise or blank values', () => {
  assert.deepEqual(recordPaymentSchema.parse(receipt), { ...receipt, amountInr: '25000.00', reference: 'UTR123456' });
  for (const [field, value] of [
    ['amountInr', '0'], ['amountInr', '-5'], ['amountInr', '10.005'], ['amountInr', ''], ['method', 'CARD'],
    ['reference', '   '], ['reference', 'x'.repeat(121)], ['receivedAt', 'yesterday'],
  ]) {
    const result = recordPaymentSchema.safeParse({ ...receipt, [field]: value });
    assert.equal(result.success, false, `${field}=${JSON.stringify(value)}`);
    assert.deepEqual(fieldErrors(result), [field]);
  }
  assert.equal(recordPaymentSchema.safeParse({ ...receipt, kind: 'FINAL' }).success, false, 'the server decides advance, partial or final');
});
