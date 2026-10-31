const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { apiErrorSchema } = require('@sunshine/contracts');
const { CONSTRAINT_RULES, constraintError, readConstraintViolation } = require('../dist/platform/constraint-errors');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
const { refusal } = require('../dist/platform/api-error');

// Shapes copied from real Prisma 7.10.1 + adapter-pg errors on PostgreSQL 17 (see platform-errors.db.test.mjs).
const row = 'Failing row contains (9aef22fa, Probe, 9876543210, null, a, b, 000).';
const prismaError = (code, cause) => Object.assign(new Error('Prisma error'), { code, meta: { driverAdapterError: { name: 'DriverAdapterError', cause } } });
const unique = (index) => prismaError('P2002', {
  originalCode: '23505', originalMessage: `duplicate key value violates unique constraint "${index}"`,
  kind: 'UniqueConstraintViolation', constraint: { index }, table: 'customers',
});
const check = (name, code = 'P2039') => prismaError(code, {
  originalCode: '23514', originalMessage: `new row for relation "customers" violates check constraint "${name}"`,
  kind: 'postgres', code: '23514', detail: row,
});
const foreignKey = prismaError('P2003', {
  originalCode: '23503', originalMessage: 'insert or update on table "enquiries" violates foreign key constraint "enquiries_customerId_fkey"',
  kind: 'ForeignKeyConstraintViolation', constraint: { index: 'enquiries_customerId_fkey' },
});
const exclusion = prismaError('P2010', {
  originalCode: '23P01', originalMessage: 'conflicting key value violates exclusion constraint "crew_no_overlap"', kind: 'postgres', detail: row,
});

test('reads SQLSTATE and constraint name from client, raw-SQL and foreign-key errors', () => {
  assert.deepEqual(readConstraintViolation(unique('customers_phone_key')), { kind: 'unique', constraint: 'customers_phone_key' });
  assert.deepEqual(readConstraintViolation(check('customers_pincode_format')), { kind: 'check', constraint: 'customers_pincode_format' });
  assert.deepEqual(readConstraintViolation(check('customers_pincode_format', 'P2010')), { kind: 'check', constraint: 'customers_pincode_format' });
  assert.deepEqual(readConstraintViolation(foreignKey), { kind: 'foreign_key', constraint: 'enquiries_customerId_fkey' });
  assert.deepEqual(readConstraintViolation(exclusion), { kind: 'exclusion', constraint: 'crew_no_overlap' });
  for (const other of [new Error('boom'), null, undefined, { code: 'P2025', meta: {} }, prismaError('P2010', { originalCode: '42P01' })]) {
    assert.equal(readConstraintViolation(other), null);
  }
});

test('a field CHECK becomes a 400 on that field; a registered unique key becomes a 409 refusal', () => {
  const field = constraintError(check('customers_pincode_format'));
  assert.equal(field.getStatus(), 400);
  assert.equal(field.code, 'INVALID_INPUT');
  assert.deepEqual(field.fieldErrors, { pincode: ['Enter a 6-digit PIN code'] });

  const taken = constraintError(unique('customers_phone_key'));
  assert.equal(taken.getStatus(), 409);
  assert.equal(taken.code, 'CUSTOMER_PHONE_TAKEN');
  assert.deepEqual(taken.reasons.map((reason) => [reason.code, reason.source]), [['CUSTOMER_PHONE_TAKEN', 'SALES']]);
  assert.equal(constraintError(new Error('not a database refusal')), null);
});

test('unregistered constraints still get a safe 409 by kind, never a 500', () => {
  assert.deepEqual(
    [unique('someone_elses_key'), foreignKey, exclusion, check('unlisted_rule')].map((error) => [constraintError(error).getStatus(), constraintError(error).code]),
    [[409, 'DUPLICATE_RECORD'], [409, 'LINKED_RECORD_CONFLICT'], [409, 'OVERLAPPING_RECORD'], [409, 'RULE_VIOLATION']],
  );
});

test('several refusal reasons are reported together as NOT_READY', () => {
  const reasons = [
    { code: 'PAYMENT_MISSING', reason: 'No advance recorded.', source: 'PAYMENT', nextAction: 'Record the advance payment.' },
    { code: 'REQUIRED_SCAN_MISSING', reason: 'Two panels are not scanned.', source: 'DISPATCH', nextAction: 'Scan the remaining panels.' },
  ];
  const error = refusal(...reasons);
  assert.equal(error.getStatus(), 409);
  assert.equal(error.code, 'NOT_READY');
  assert.deepEqual(error.reasons, reasons);
  assert.equal(refusal(reasons[0]).code, 'PAYMENT_MISSING');
});

function render(exception) {
  let status;
  let body;
  const response = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
  const filter = new ApiExceptionFilter();
  filter.logger = { warn() {}, error() {} };
  filter.catch(exception, { switchToHttp: () => ({ getResponse: () => response }) });
  return { status, body };
}

test('the filter renders mapped refusals in the shared envelope without the failing row', () => {
  const { status, body } = render(unique('customers_phone_key'));
  assert.equal(status, 409);
  assert.ok(apiErrorSchema.safeParse(body).success);
  assert.equal(body.error.reasons[0].nextAction, 'Open the existing customer instead of creating a new one.');

  const checked = render(check('customers_phone_format'));
  assert.equal(checked.status, 400);
  assert.ok(apiErrorSchema.safeParse(checked.body).success);
  assert.equal(checked.body.error.reasons, undefined, 'field errors carry no refusal reasons');
  for (const rendered of [body, checked.body, render(exclusion).body]) {
    assert.doesNotMatch(JSON.stringify(rendered), /9876543210|Failing row|violates/);
  }
});

test('every D2 rule in the constraint manifest has a mapping, and every mapping names a real rule or key', () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, '../../../prisma/required-constraints.json'), 'utf8'));
  const listed = new Set(manifest.required.map((rule) => rule.name));
  // Triggers, views and functions aren't constraint names. What a trigger raises gets RULE_VIOLATION unless it's mapped.
  const named = new Set(['check', 'exclusion', 'unique_partial_index']);
  for (const rule of manifest.required.filter((item) => item.owner === 'D2' && named.has(item.kind))) {
    assert.ok(CONSTRAINT_RULES[rule.name], `${rule.name} needs an entry in CONSTRAINT_RULES`);
  }
  for (const name of Object.keys(CONSTRAINT_RULES)) {
    assert.ok(listed.has(name) || /_(key|fkey)$/.test(name), `${name} is neither in the manifest nor a Prisma key`);
  }
});
