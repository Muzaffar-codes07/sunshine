// Real PostgreSQL tests for the staff directory used by assignment pickers. Only runs against TEST_DATABASE_URL
// naming a disposable "test" database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('Disposable TEST_DATABASE_URL required');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'staff-directory-tests-only-secret-2026';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
process.env.SESSION_COOKIE_SECURE = 'false';

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
const { PrismaService } = require('../dist/platform/prisma.service');
const { hashPassword } = require('../dist/auth/passwords');
const { staffDirectoryResponseSchema } = require('@sunshine/contracts');

let app, base, prisma;
const password = 'staff-directory-test-password';
const origin = 'http://127.0.0.1:3001';
const user = async (role, extra = {}) => prisma.user.create({ data: {
  email: `${randomUUID()}@test.local`, displayName: `${role} ${randomUUID().slice(0, 8)}`, role, passwordHash: await hashPassword(password), ...extra,
} });

before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  base = `${await app.getUrl()}/api/v1`;
  prisma = app.get(PrismaService);
});

after(async () => {
  await app?.close();
});

async function login(account) {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email: account.email, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}
const get = (path, cookie) => fetch(`${base}${path}`, { headers: { cookie } });

test('sales lists active staff by role with names only; inactive staff are hidden', async () => {
  const [sales, tech, retired] = [await user('SALES'), await user('TECHNICIAN'), await user('TECHNICIAN', { active: false })];
  const response = await get('/staff?role=TECHNICIAN', await login(sales));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(staffDirectoryResponseSchema.safeParse(body).success);
  const ids = body.data.items.map((item) => item.id);
  assert.ok(ids.includes(tech.id));
  assert.ok(!ids.includes(retired.id), 'inactive technician is not offered');
  assert.ok(body.data.items.every((item) => item.role === 'TECHNICIAN'));
  assert.deepEqual(Object.keys(body.data.items[0]).sort(), ['displayName', 'id', 'role'], 'no email or password data');
});

test('only sales and admin can read the directory; unknown filters are refused', async () => {
  const [admin, tech, warehouse] = [await user('ADMIN'), await user('TECHNICIAN'), await user('WAREHOUSE')];
  assert.equal((await get('/staff', await login(admin))).status, 200);
  assert.equal((await get('/staff', await login(tech))).status, 403);
  assert.equal((await get('/staff', await login(warehouse))).status, 403);
  assert.equal((await fetch(`${base}/staff`)).status, 401);
  const adminCookie = await login(admin);
  assert.equal((await get('/staff?role=OWNER', adminCookie)).status, 400);
  assert.equal((await get('/staff?email=x', adminCookie)).status, 400);
});
