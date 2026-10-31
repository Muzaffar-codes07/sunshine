// Explicit disposable PostgreSQL database only. Apply migrations and build before running test:db.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) throw new Error('Set TEST_DATABASE_URL to an explicitly disposable test database');
process.env.DATABASE_URL = url;
process.env.SESSION_SECRET = 'auth-tests-only-session-secret-never-for-real-staff';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
process.env.SESSION_COOKIE_SECURE = 'false';
const { NestFactory } = require('@nestjs/core');
const { Controller, Get, Req, Module, UseGuards } = require('@nestjs/common');
const { AppModule } = require('../dist/app.module');
const { AuthModule } = require('../dist/auth/auth.module');
const { AuthGuard } = require('../dist/auth/auth.guard');
const { RolesGuard } = require('../dist/auth/roles.guard');
const { Roles } = require('../dist/auth/roles.decorator');
const { PrismaService } = require('../dist/platform/prisma.service');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');

class ProbeController { sales(request) { return { data: { role: request.user.role } }; } }
Controller('auth-test')(ProbeController);
const descriptor = Object.getOwnPropertyDescriptor(ProbeController.prototype, 'sales');
Get('sales')(ProbeController.prototype, 'sales', descriptor);
UseGuards(AuthGuard, RolesGuard)(ProbeController.prototype, 'sales', descriptor);
Roles('ADMIN', 'SALES')(ProbeController.prototype, 'sales', descriptor);
Req()(ProbeController.prototype, 'sales', 0);
class TestModule {}
Module({ imports: [AppModule, AuthModule], controllers: [ProbeController] })(TestModule);

let app, base, prisma, salesCookie;
const password = 'local-test-password-2026';
const origin = 'http://127.0.0.1:3001';
async function start() {
  app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  base = `${await app.getUrl()}/api/v1`;
  prisma = app.get(PrismaService);
}
function post(path, body, cookie, extra = {}) {
  return fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}), ...extra }, body: JSON.stringify(body) });
}
async function me(cookie) { return fetch(`${base}/auth/me`, { headers: cookie ? { cookie } : {} }); }
function sid(cookie) { return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)).slice(2).split('.')[0]; }

before(async () => {
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, '../dist/auth/seed-staff.js')], {
    env: { ...process.env, DEMO_DATABASE_DISPOSABLE: 'true', DEMO_STAFF_PASSWORD: password }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(password));
  await start();
});
after(async () => { await app?.close(); });

test('seed creates one hashed local account per staff role and refuses implicit seeding', async () => {
  const users = await prisma.user.findMany({ where: { email: { in: ['admin', 'sales', 'warehouse', 'technician', 'support'].map((role) => role + '@sunshine.test') } } });
  assert.equal(users.length, 5);
  assert.equal(new Set(users.map((user) => user.passwordHash)).size, 5);
  assert.deepEqual(new Set(users.map((user) => user.role)), new Set(['ADMIN', 'SALES', 'WAREHOUSE', 'TECHNICIAN', 'SUPPORT']));
  assert.ok(users.every((user) => user.passwordHash.startsWith('scrypt$') && !user.passwordHash.includes(password)));
  const refused = spawnSync(process.execPath, [resolve(import.meta.dirname, '../dist/auth/seed-staff.js')], {
    env: { ...process.env, DEMO_DATABASE_DISPOSABLE: 'false' }, encoding: 'utf8',
  });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /Refusing seed/);
});

test('anonymous session lookup is 401 and login rejects invalid credentials without leaking identity', async () => {
  assert.equal((await me()).status, 401);
  const failed = await post('/auth/login', { email: 'missing@sunshine.test', password });
  assert.equal(failed.status, 401);
  assert.equal((await failed.json()).error.message, 'Email or password is incorrect');
});

test('login rejects missing/null/foreign origins even with spoofed same-origin Fetch Metadata', async () => {
  for (const supplied of [undefined, 'null', 'https://evil.example', 'http://127.0.0.1:3002']) {
    const headers = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
    if (supplied !== undefined) headers.origin = supplied;
    const response = await fetch(`${base}/auth/login`, { method: 'POST', headers, body: JSON.stringify({ email: 'sales@sunshine.test', password }) });
    assert.equal(response.status, 403);
  }
});

test('staff login persists a private cookie session and returns only public staff fields', async () => {
  const response = await post('/auth/login', { email: 'sales@sunshine.test', password });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=Strict/i);
  salesCookie = setCookie.split(';')[0];
  const identity = (await response.json()).data;
  assert.equal(identity.role, 'SALES'); assert.equal(identity.passwordHash, undefined);
  assert.equal((await me(salesCookie)).status, 200);
  const stored = await prisma.session.findUniqueOrThrow({ where: { sid: sid(salesCookie) } });
  assert.equal(stored.sess.staffUserId, identity.id);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('session survives a real application restart and role/active changes are rechecked', async () => {
  await app.close(); await start();
  assert.equal((await me(salesCookie)).status, 200);
  const staff = await prisma.user.findUniqueOrThrow({ where: { email: 'sales@sunshine.test' } });
  assert.equal((await fetch(`${base}/auth-test/sales`, { headers: { cookie: salesCookie } })).status, 200);
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'SUPPORT' } });
  assert.equal((await fetch(`${base}/auth-test/sales`, { headers: { cookie: salesCookie } })).status, 403);
  await prisma.user.update({ where: { id: staff.id }, data: { active: false } });
  assert.equal((await me(salesCookie)).status, 401);
  await prisma.user.update({ where: { id: staff.id }, data: { role: 'SALES', active: true } });
});

test('technicians cannot reach SALES/ADMIN routes and login rotates an existing session', async () => {
  const tech = await post('/auth/login', { email: 'technician@sunshine.test', password });
  assert.equal(tech.status, 200);
  const techCookie = tech.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${base}/auth-test/sales`, { headers: { cookie: techCookie } })).status, 403);
  const oldCookie = salesCookie;
  const rotated = await post('/auth/login', { email: 'sales@sunshine.test', password }, oldCookie);
  assert.equal(rotated.status, 200);
  salesCookie = rotated.headers.get('set-cookie').split(';')[0];
  assert.notEqual(salesCookie, oldCookie);
  assert.equal((await me(oldCookie)).status, 401);
  assert.equal((await me(salesCookie)).status, 200);
});

test('cookie-authenticated public-form mutation still needs an exact trusted origin', async () => {
  const response = await fetch(`${base}/enquiries`, { method: 'POST', headers: { cookie: salesCookie, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 403);
});

test('logout destroys the persistent session and rejects cookie replay', async () => {
  const sessionId = sid(salesCookie);
  const response = await post('/auth/logout', {}, salesCookie);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i);
  assert.equal(await prisma.session.findUnique({ where: { sid: sessionId } }), null);
  assert.equal((await me(salesCookie)).status, 401);
});
