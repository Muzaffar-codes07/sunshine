const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  enquiryListQuerySchema, qualifyEnquirySchema, assignEnquirySchema, archiveEnquirySchema, markEnquiryContactedSchema,
} = require('../dist');

const fieldErrors = (result) => result.error.issues.map((issue) => issue.path[0]);

test('list query applies paging defaults and coerces query-string numbers', () => {
  assert.deepEqual(enquiryListQuerySchema.parse({}), { page: 1, pageSize: 25 });
  assert.deepEqual(enquiryListQuerySchema.parse({ status: 'NEW', page: '2', pageSize: '50' }), { status: 'NEW', page: 2, pageSize: 50 });
  for (const bad of [{ pageSize: '101' }, { page: '0' }, { status: 'DELETED' }, { ownerId: 'me' }, { sort: 'name' }]) {
    assert.equal(enquiryListQuerySchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

test('qualification stores decimals as 2-place strings and rejects negative or over-precise values', () => {
  const parsed = qualifyEnquirySchema.parse({
    version: 1, shadowFreeRoofAreaSqm: '24.5', monthlyBillInr: 3200.29, gridConnectionSuitable: true, outcome: 'QUALIFIED',
  });
  assert.equal(parsed.shadowFreeRoofAreaSqm, '24.50');
  assert.equal(parsed.monthlyBillInr, '3200.29');
  for (const [field, value] of [['shadowFreeRoofAreaSqm', -1], ['monthlyBillInr', '12.345'], ['monthlyBillInr', 'lots'], ['gridConnectionSuitable', 'yes']]) {
    const result = qualifyEnquirySchema.safeParse({
      version: 1, shadowFreeRoofAreaSqm: 10, monthlyBillInr: 100, gridConnectionSuitable: true, outcome: 'QUALIFIED', [field]: value,
    });
    assert.equal(result.success, false, `${field}=${value}`);
    assert.ok(fieldErrors(result).includes(field));
  }
});

test('blank roof area or bill is rejected instead of becoming 0.00, while an explicit 0 is kept', () => {
  const base = { version: 1, shadowFreeRoofAreaSqm: 20, monthlyBillInr: 1500, gridConnectionSuitable: true, outcome: 'QUALIFIED' };
  for (const [field, value] of [['shadowFreeRoofAreaSqm', ''], ['shadowFreeRoofAreaSqm', '   '], ['monthlyBillInr', ''], ['monthlyBillInr', ' \t ']]) {
    const result = qualifyEnquirySchema.safeParse({ ...base, [field]: value });
    assert.equal(result.success, false, `${field}=${JSON.stringify(value)} must be rejected`);
    assert.ok(fieldErrors(result).includes(field));
  }
  const bothBlank = qualifyEnquirySchema.safeParse({ ...base, shadowFreeRoofAreaSqm: '', monthlyBillInr: '' });
  assert.equal(bothBlank.success, false);
  assert.deepEqual(fieldErrors(bothBlank).sort(), ['monthlyBillInr', 'shadowFreeRoofAreaSqm']);
  assert.equal(qualifyEnquirySchema.parse({ ...base, monthlyBillInr: 0 }).monthlyBillInr, '0.00');
  assert.equal(qualifyEnquirySchema.parse({ ...base, monthlyBillInr: '0' }).monthlyBillInr, '0.00');
});

test('disqualifying requires a reason', () => {
  const base = { version: 2, shadowFreeRoofAreaSqm: 4, monthlyBillInr: 800, gridConnectionSuitable: false, outcome: 'DISQUALIFIED' };
  const missing = qualifyEnquirySchema.safeParse(base);
  assert.equal(missing.success, false);
  assert.deepEqual(fieldErrors(missing), ['reason']);
  assert.equal(qualifyEnquirySchema.parse({ ...base, reason: 'Roof fully shaded by water tank' }).reason, 'Roof fully shaded by water tank');
});

test('assignment allows clearing owner and follow-up, and requires valid IDs and times', () => {
  assert.deepEqual(assignEnquirySchema.parse({ version: '3', ownerId: null, nextFollowUpAt: null }), { version: 3, ownerId: null, nextFollowUpAt: null });
  assert.ok(assignEnquirySchema.parse({ version: 1, ownerId: 'b3f02476-10ba-43dd-aa92-b3129796c148', nextFollowUpAt: '2026-11-01T10:30:00+05:30' }));
  assert.equal(assignEnquirySchema.safeParse({ version: 1, ownerId: 'nobody', nextFollowUpAt: null }).success, false);
  assert.equal(assignEnquirySchema.safeParse({ version: 1, ownerId: null, nextFollowUpAt: 'tomorrow' }).success, false);
});

test('every command needs a positive version and rejects unknown fields', () => {
  assert.equal(markEnquiryContactedSchema.safeParse({}).success, false);
  assert.equal(markEnquiryContactedSchema.safeParse({ version: 0 }).success, false);
  assert.equal(archiveEnquirySchema.safeParse({ version: 1, reason: 'Duplicate enquiry', status: 'NEW' }).success, false);
  assert.equal(archiveEnquirySchema.safeParse({ version: 1, reason: 'no' }).success, false);
});
