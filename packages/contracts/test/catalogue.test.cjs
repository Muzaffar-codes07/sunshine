const { test } = require('node:test');
const assert = require('node:assert/strict');
const { productViewSchema, packageDetailSchema, productListQuerySchema, packageListQuerySchema } = require('../dist');
const id = (n) => 'c0010000-0000-4000-8000-' + String(n).padStart(12, '0');
const manufacturer = { id: id(1), name: 'Fixture manufacturer' };
const product = (n, category) => ({ id: id(n), sku: 'FIXTURE-' + n, name: 'Fixture component', kind: 'HARDWARE', category,
  trackingMode: 'SERIALIZED', unitOfMeasure: 'PCS', manufacturerId: manufacturer.id, manufacturer, unitSalePrice: '0.10', active: true });
const service = { ...product(100, 'INSTALLATION'), kind: 'SERVICE', trackingMode: 'NONE', unitOfMeasure: 'JOB', manufacturerId: null, manufacturer: null };
const kit = () => ({ id: id(200), code: 'FIXTURE-ON-1-R1', name: 'Fixture complete kit', capacityKw: 1, systemType: 'ON_GRID', revision: 1, active: true,
  hardwarePrice: '0.10', installationPrice: '0.20', totalPrice: '0.30', installationProductId: service.id, installationProduct: service,
  items: ['PANEL','INVERTER','CHARGE_CONTROLLER','MOUNTING','WIRING_BOX','SWITCHGEAR','CABLE','EARTHING','CONNECTOR']
    .map((category, i) => ({ id: id(300 + i), position: i + 1, quantity: '1.000', productId: id(10 + i), product: product(10 + i, category) })) });
test('catalogue products enforce physical tracking and real manufacturer identity', () => {
  const row = product(10, 'PANEL');
  assert.ok(productViewSchema.safeParse(row).success);
  assert.ok(productViewSchema.safeParse(service).success);
  for (const patch of [{ manufacturerId: null }, { manufacturer: { ...manufacturer, id: id(2) } }, { trackingMode: 'NONE' }, { unitOfMeasure: 'M' }, { unitSalePrice: 0.1 }, { unitSalePrice: '1.001' }]) {
    assert.equal(productViewSchema.safeParse({ ...row, ...patch }).success, false);
  }
});
test('catalogue queries are bounded and reject unexpected filters', () => {
  assert.deepEqual(productListQuerySchema.parse({ sku: ' fixture-10 ' }), { sku: 'FIXTURE-10', page: 1, pageSize: 25 });
  assert.equal(packageListQuerySchema.parse({ capacityKw: '5' }).capacityKw, 5);
  for (const query of [{ capacityKw: '' }, { capacityKw: '6' }, { capacityKw: '1.5' }, { pageSize: '101' }, { unknown: true }]) {
    assert.equal(packageListQuerySchema.safeParse(query).success, false);
  }
});
test('complete On-Grid and Off-Grid kits validate with exact decimal money', () => {
  const row = kit();
  assert.ok(packageDetailSchema.safeParse(row).success);
  row.systemType = 'OFF_GRID';
  assert.equal(packageDetailSchema.safeParse(row).success, false);
  row.items.push({ id: id(350), position: 10, quantity: '1.000', productId: id(50), product: product(50, 'BATTERY') });
  assert.ok(packageDetailSchema.safeParse(row).success);
  row.systemType = 'ON_GRID';
  assert.equal(packageDetailSchema.safeParse(row).success, false);
});
test('partial, stale, duplicate, fractional serialized or inconsistent kits fail closed', () => {
  for (const change of [
    row => row.items.pop(),
    row => row.items.push(row.items[0]),
    row => row.items[0].quantity = '0.500',
    row => row.items[0].product.active = false,
    row => row.installationProductId = id(999),
    row => row.totalPrice = '0.31',
    row => row.hardwarePrice = 'NaN',
  ]) { const row = kit(); change(row); assert.equal(packageDetailSchema.safeParse(row).success, false); }
  const historical = kit(); historical.active = false; historical.items[0].product.active = false;
  assert.ok(packageDetailSchema.safeParse(historical).success);
});
