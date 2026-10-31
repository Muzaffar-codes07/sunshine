// Real PostgreSQL check that the constraint mapping reads the errors Prisma actually raises. Same isolation rule
// as enquiries.db.test.mjs: only runs against TEST_DATABASE_URL naming a disposable "test" database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) {
  throw new Error('Set TEST_DATABASE_URL to a disposable database whose name contains "test"; refusing to write to another database.');
}
process.env.DATABASE_URL = testUrl;

const { PrismaService } = require('../dist/platform/prisma.service');
const { constraintError } = require('../dist/platform/constraint-errors');

let prisma;
let customer;

const caught = async (promise) => {
  try { await promise; } catch (error) { return error; }
  assert.fail('expected the database to refuse the write');
};
// Random, not time-based: two customers made in the same millisecond must not collide on the unique phone.
const phone = () => `9${String(randomInt(1e9)).padStart(9, '0')}`;

before(async () => {
  prisma = new PrismaService();
  customer = await prisma.customer.create({ data: { name: 'Mapping Test', phone: phone(), addressLine: '1 Rule Road', city: 'Kochi', pincode: '682001' } });
});

after(async () => {
  await prisma?.$disconnect();
});

test('a duplicate phone through the client maps to CUSTOMER_PHONE_TAKEN', async () => {
  const error = await caught(prisma.customer.create({ data: { ...customer, id: undefined } }));
  assert.equal(error.code, 'P2002');
  const mapped = constraintError(error);
  assert.equal(mapped.getStatus(), 409);
  assert.equal(mapped.code, 'CUSTOMER_PHONE_TAKEN');
});

test('a CHECK through the client, in a transaction and through raw SQL maps to the same field error', async () => {
  const errors = [
    await caught(prisma.customer.update({ where: { id: customer.id }, data: { pincode: '000' } })),
    await caught(prisma.$transaction((tx) => tx.customer.update({ where: { id: customer.id }, data: { pincode: '000' } }))),
    await caught(prisma.$executeRaw`UPDATE customers SET pincode = '000' WHERE id = ${customer.id}::uuid`),
  ];
  assert.deepEqual(errors.map((error) => error.code), ['P2039', 'P2039', 'P2010']);
  for (const error of errors) {
    const mapped = constraintError(error);
    assert.equal(mapped.getStatus(), 400);
    assert.deepEqual(mapped.fieldErrors, { pincode: ['Enter a 6-digit PIN code'] });
  }
});

test('a missing linked record maps to a safe 409', async () => {
  const error = await caught(prisma.enquiry.create({ data: {
    customerId: randomUUID(), source: 'PHONE', requestedCapacityKw: 3,
    contactName: 'x', siteAddressLine: 'a', siteCity: 'b', sitePincode: '682001',
  } }));
  assert.equal(error.code, 'P2003');
  assert.equal(constraintError(error).code, 'LINKED_RECORD_CONFLICT');
});
