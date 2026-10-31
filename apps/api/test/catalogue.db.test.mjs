// Explicit disposable test database only; never load the application .env.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw new Error('TEST_DATABASE_URL must name a disposable test database');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'catalogue-tests-only-session-secret';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
process.env.SESSION_COOKIE_SECURE = 'false';
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
const { PrismaService } = require('../dist/platform/prisma.service');
const { CatalogService } = require('../dist/catalog/catalog.service');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { catalogueDemoId: id } = require('../dist/catalog/demo-catalogue');
const { hashPassword } = require('../dist/auth/passwords');
const { packageDetailSchema } = require('@sunshine/contracts');
const { Client } = require('pg');
let app, prisma, catalog, base;
const cookies = {};
const password = 'catalogue-test-password-2026';
before(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1'); base = (await app.getUrl()) + '/api/v1';
  prisma = app.get(PrismaService); catalog = app.get(CatalogService);
  await seedCatalogue(prisma);
  for (const role of ['SALES','ADMIN','WAREHOUSE']) {
    const account = await prisma.user.create({ data: { email: randomUUID() + '@test.local', displayName: role + ' catalogue tester', role, passwordHash: await hashPassword(password) } });
    const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3001' }, body: JSON.stringify({ email: account.email, password }) });
    assert.equal(response.status, 200); cookies[role] = response.headers.get('set-cookie').split(';')[0];
  }
});
after(async () => { await app?.close(); });
const get = (route, role = 'SALES') => fetch(base + route, { headers: role ? { cookie: cookies[role] } : {} });
const rejectsWith = (promise, status, code) => assert.rejects(promise, error => {
  assert.equal(error.getStatus(), status); assert.equal(error.code, code); return true;
});
test('catalogue seed is repeatable and preserves existing revision prices and BOM identities', async () => {
  const items = await prisma.packageItem.findMany({ orderBy: { id: 'asc' } });
  await prisma.package.update({ where: { id: id(1001) }, data: { hardwarePrice: '50001.00' } });
  try {
    assert.deepEqual(await seedCatalogue(prisma), { manufacturers: 1, products: 32, packages: 10 });
    assert.equal(await prisma.product.count(), 32); assert.equal(await prisma.package.count(), 10);
    assert.equal(await prisma.packageItem.count(), 95);
    assert.deepEqual(await prisma.packageItem.findMany({ orderBy: { id: 'asc' } }), items);
    assert.equal((await catalog.getPackage(id(1001))).data.hardwarePrice, '50001.00');
  } finally { await prisma.package.update({ where: { id: id(1001) }, data: { hardwarePrice: '50000.00' } }); }
});
test('catalogue CLI refuses to seed without the explicit disposable flag', () => {
  const run = spawnSync(process.execPath, ['apps/api/dist/catalog/seed-catalogue.js'], {
    cwd: new URL('../../../', import.meta.url), env: { ...process.env, DEMO_DATABASE_DISPOSABLE: 'false' }, encoding: 'utf8',
  });
  assert.equal(run.status, 1); assert.match(run.stderr, /Refusing catalogue seed/);
});
test('all ten capacity and system templates contain the complete PDF BOM with separate installation', async () => {
  const list = (await catalog.listPackages({ page: 1, pageSize: 100 })).data;
  assert.equal(list.total, 10);
  assert.equal(new Set(list.items.map(row => row.capacityKw + ':' + row.systemType)).size, 10);
  for (const summary of list.items) {
    const kit = (await catalog.getPackage(summary.id)).data;
    assert.ok(packageDetailSchema.safeParse(kit).success);
    assert.equal(kit.items.length, kit.systemType === 'OFF_GRID' ? 10 : 9);
    assert.equal(kit.items.find(line => line.product.category === 'PANEL').quantity, (kit.capacityKw * 2).toFixed(3));
    assert.equal(kit.items.some(line => line.product.category === 'BATTERY'), kit.systemType === 'OFF_GRID');
    assert.equal(kit.installationProduct.kind, 'SERVICE');
    for (const line of kit.items) { assert.equal(line.product.manufacturerId, id(1)); assert.equal(line.product.manufacturer.id, id(1)); }
  }
  assert.equal((await catalog.getPackage(id(1001))).data.totalPrice, '55000.00');
  assert.equal((await catalog.getPackage(id(1003))).data.totalPrice, '180000.00');
});
test('catalogue endpoints permit warehouse product reads while protecting package reads and validating IDs/filters', async () => {
  assert.equal((await get('/packages', null)).status, 401);
  assert.equal((await get('/products', 'WAREHOUSE')).status, 200);
  assert.equal((await get('/products/' + id(100), 'WAREHOUSE')).status, 200);
  assert.equal((await get('/packages', 'WAREHOUSE')).status, 403);
  assert.equal((await get('/packages/' + id(1001), 'WAREHOUSE')).status, 403);
  assert.equal((await get('/products/c0010000-0000-1000-8000-000000000100')).status, 400);
  assert.equal((await get('/packages/c0010000-0000-1000-8000-000000001001')).status, 400);
  for (const role of ['SALES', 'ADMIN']) assert.equal((await get('/packages', role)).status, 200);
  const response = await get('/packages?capacityKw=3&systemType=ON_GRID');
  assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.data.total, 1); assert.equal(body.data.items[0].id, id(1003));
  const products = await (await get('/products?kind=HARDWARE&pageSize=2')).json();
  assert.equal(products.data.total, 31); assert.equal(products.data.items.length, 2);
  const sku = await (await get('/products?sku=demo-panel-500w')).json(); assert.equal(sku.data.items[0].id, id(100));
  for (const route of ['/packages?capacityKw=0', '/products?pageSize=101', '/packages?unknown=true', '/products/not-a-uuid']) assert.equal((await get(route)).status, 400);
  assert.equal((await get('/packages/' + randomUUID())).status, 404);
});
test('transaction-aware product facts observe caller writes and do not commit them', async () => {
  const productId = randomUUID();
  const rollback = new Error('intentional rollback');
  await assert.rejects(prisma.$transaction(async tx => {
    await tx.product.create({ data: { id: productId, sku: 'ROLLBACK-' + productId.toUpperCase(), name: 'Transaction-only product', kind: 'HARDWARE', category: 'OTHER', trackingMode: 'BULK', unitOfMeasure: 'PCS', manufacturerId: id(1), unitSalePrice: '0.10' } });
    assert.equal((await catalog.getProductFacts(tx, productId)).unitSalePrice, '0.10');
    assert.equal((await catalog.getPackageFacts(tx, id(1001))).items.length, 9);
    throw rollback;
  }), error => error === rollback);
  assert.equal(await prisma.product.findUnique({ where: { id: productId } }), null);
});
test('incomplete BOM or inactive current product is refused; historical inactive revision remains readable', async () => {
  const first = await prisma.packageItem.findFirst({ where: { packageId: id(1001), productId: id(100) } });
  await prisma.packageItem.delete({ where: { id: first.id } });
  try { await rejectsWith(catalog.getPackage(id(1001)), 503, 'CATALOGUE_DATA_INVALID'); }
  finally { await prisma.packageItem.create({ data: first }); }
  await prisma.product.update({ where: { id: id(100) }, data: { active: false } });
  try {
    await rejectsWith(catalog.getPackage(id(1001)), 503, 'CATALOGUE_DATA_INVALID');
    await prisma.package.update({ where: { id: id(1001) }, data: { active: false } });
    assert.equal((await catalog.getPackage(id(1001))).data.active, false);
    assert.equal((await catalog.listPackages({ page: 1, pageSize: 100 })).data.total, 9);
  } finally {
    await prisma.product.update({ where: { id: id(100) }, data: { active: true } });
    await prisma.package.update({ where: { id: id(1001) }, data: { active: true } });
  }
});
test('database rejects invalid catalogue facts and a second current revision; old revisions stay valid', async () => {
  const client = new Client({ connectionString: testUrl }); await client.connect();
  const fails = async (sql, values, constraint) => {
    await client.query('BEGIN');
    try { await assert.rejects(client.query(sql, values), error => { assert.equal(error.constraint, constraint); return true; }); }
    finally { await client.query('ROLLBACK'); }
  };
  try {
    await fails('UPDATE products SET "unitSalePrice"=$1 WHERE id=$2', ['-0.01',id(100)], 'products_price_nonnegative');
    await fails('UPDATE products SET "unitSalePrice"=$1 WHERE id=$2', ['NaN',id(100)], 'products_price_nonnegative');
    await fails('UPDATE products SET "manufacturerId"=NULL WHERE id=$1', [id(100)], 'products_tracking_consistent');
    await fails('UPDATE products SET "unitOfMeasure"=$1 WHERE id=$2', ['M',id(100)], 'products_serialized_uom');
    await fails('UPDATE packages SET "capacityKw"=0 WHERE id=$1', [id(1001)], 'packages_capacity_range');
    await fails('UPDATE packages SET revision=0 WHERE id=$1', [id(1001)], 'packages_revision_positive');
    await fails('UPDATE package_items SET quantity=0 WHERE "packageId"=$1', [id(1001)], 'package_items_quantity_positive');
    await fails('DELETE FROM products WHERE id=$1', [id(100)], 'package_items_productId_fkey');
  } finally { await client.end(); }
  const source = await prisma.package.findUnique({ where: { id: id(1001) } });
  const { id: oldId, createdAt, updatedAt, ...data } = source;
  const revision = { ...data, id: randomUUID(), code: 'TEST-ON-1-R2', revision: 2 };
  await assert.rejects(prisma.package.create({ data: revision }), error => error.code === 'P2002');
  await prisma.package.update({ where: { id: oldId }, data: { active: false } });
  try {
    await prisma.package.create({ data: revision });
    assert.equal((await catalog.getPackage(oldId)).data.revision, 1);
    assert.equal((await catalog.listPackages({ page: 1, pageSize: 100, capacityKw: 1, systemType: 'ON_GRID' })).data.items[0].revision, 2);
  } finally {
    await prisma.package.deleteMany({ where: { id: revision.id } });
    await prisma.package.update({ where: { id: oldId }, data: { active: true } });
  }
});
