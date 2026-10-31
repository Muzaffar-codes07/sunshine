const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  enquirySourceSchema, enquiryStatusSchema, systemTypeSchema,
  publicEnquiryRequestSchema, publicEnquiryResponseSchema,
} = require('../dist');

function enquiry(overrides = {}) {
  return {
    name: '  Asha Rao  ', phone: '9876543210',
    addressLine: '  12 Sunshine Road  ', city: '  Hyderabad  ', pincode: '500001',
    requestedCapacityKw: '3', ...overrides,
  };
}

function rejectsField(field, value) {
  const result = publicEnquiryRequestSchema.safeParse(enquiry({ [field]: value }));
  assert.equal(result.success, false, `${field} should be rejected`);
  const issues = result.error.issues.filter((issue) => issue.path[0] === field);
  assert.ok(issues.length > 0, `${field} needs a field-level error`);
  assert.ok(issues.every((issue) => issue.message.length > 10), 'errors must be readable');
}

test('public enquiry accepts a valid payload, trims text, coerces capacity and supplies defaults', () => {
  const parsed = publicEnquiryRequestSchema.parse(enquiry({ message: '  Roof survey please  ' }));
  assert.equal(parsed.name, 'Asha Rao');
  assert.equal(parsed.addressLine, '12 Sunshine Road');
  assert.equal(parsed.city, 'Hyderabad');
  assert.equal(parsed.message, 'Roof survey please');
  assert.equal(parsed.requestedCapacityKw, 3);
  assert.equal(parsed.subsidyInterest, false);
  assert.equal(parsed.email, undefined);
  assert.equal(parsed.systemType, undefined);
});

test('Indian mobile normalization accepts +91, trunk prefix, spaces and dashes', () => {
  for (const phone of ['+91 98765 43210', '09876543210', '98765-43210', ' 9876543210 ']) {
    assert.equal(publicEnquiryRequestSchema.parse(enquiry({ phone })).phone, '9876543210');
  }
});

test('email is optional and blank values become absent', () => {
  for (const email of [undefined, '', '   ']) {
    assert.equal(publicEnquiryRequestSchema.parse(enquiry({ email })).email, undefined);
  }
  assert.equal(publicEnquiryRequestSchema.parse(enquiry({ email: '  asha@example.com  ' })).email, 'asha@example.com');
});

test('capacity bounds, optional system type and explicit subsidy choice are accepted', () => {
  for (const requestedCapacityKw of [1, '5']) {
    const parsed = publicEnquiryRequestSchema.parse(enquiry({ requestedCapacityKw, systemType: 'OFF_GRID', subsidyInterest: true }));
    assert.equal(parsed.requestedCapacityKw, Number(requestedCapacityKw));
    assert.equal(parsed.systemType, 'OFF_GRID');
    assert.equal(parsed.subsidyInterest, true);
  }
});

const invalidFields = {
  name: ['', 'A', 'a'.repeat(121), 42],
  phone: ['1234567890', '987654321', '+1 9876543210', '+9109876543210', '919876543210', 9876543210],
  email: ['not-an-email', `${'a'.repeat(243)}@example.com`, null],
  addressLine: ['1234', 'a'.repeat(301), null],
  city: ['A', 'a'.repeat(81), false],
  pincode: ['012345', '50000', '5000010', '50000a', 500001],
  requestedCapacityKw: [0, 6, 1.5, 'three', '', null, true, [2]],
  systemType: ['HYBRID', '', null],
  subsidyInterest: ['true', 1, null],
  message: ['a'.repeat(1001), 7, null],
};
for (const [field, values] of Object.entries(invalidFields)) {
  test(`public enquiry rejects invalid ${field} with readable field errors`, () => {
    for (const value of values) rejectsField(field, value);
  });
}

test('required fields cannot be omitted', () => {
  for (const field of ['name', 'phone', 'addressLine', 'city', 'pincode', 'requestedCapacityKw']) {
    const input = enquiry();
    delete input[field];
    const result = publicEnquiryRequestSchema.safeParse(input);
    assert.equal(result.success, false, `${field} is required`);
    assert.ok(result.error.issues.some((issue) => issue.path[0] === field));
  }
});

test('public enquiry rejects unknown and server-owned keys', () => {
  for (const extra of [{ unexpected: true }, { source: 'PHONE' }, { status: 'QUALIFIED' }, { id: 'forged' }]) {
    const result = publicEnquiryRequestSchema.safeParse(enquiry(extra));
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some((issue) => issue.code === 'unrecognized_keys'));
    assert.equal(result.error.issues[0].message, 'Only send the fields allowed on the enquiry form');
  }
});

test('exported enums match the API and migration values', () => {
  for (const source of ['WEB', 'PHONE', 'WHATSAPP']) assert.equal(enquirySourceSchema.parse(source), source);
  for (const status of ['NEW', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED', 'ARCHIVED']) assert.equal(enquiryStatusSchema.parse(status), status);
  for (const system of ['ON_GRID', 'OFF_GRID']) assert.equal(systemTypeSchema.parse(system), system);
  assert.equal(enquirySourceSchema.safeParse('EMAIL').success, false);
  assert.equal(enquiryStatusSchema.safeParse('DELETED').success, false);
});

test('response requires a generated UUID, NEW status and ISO creation time', () => {
  const data = { id: 'b3f02476-10ba-43dd-aa92-b3129796c148', status: 'NEW', createdAt: '2026-10-31T10:00:00.000Z' };
  assert.deepEqual(publicEnquiryResponseSchema.parse({ data }), { data });
  for (const overrides of [{ id: 'bad-id' }, { status: 'QUALIFIED' }, { createdAt: 'yesterday' }]) {
    assert.equal(publicEnquiryResponseSchema.safeParse({ data: { ...data, ...overrides } }).success, false);
  }
});
