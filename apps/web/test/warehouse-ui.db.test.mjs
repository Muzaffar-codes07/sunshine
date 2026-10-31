// Explicit disposable PostgreSQL only. Build API/contracts first; run with TEST_DATABASE_URL.
// Uses the real API request helper and real React rendering. Browser interactions were checked separately.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) throw Error('Disposable TEST_DATABASE_URL required');
process.env.DATABASE_URL = url;
process.env.SESSION_SECRET = 'warehouse-ui-tests-only-session-secret';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
process.env.SESSION_COOKIE_SECURE = 'false';
const root = resolve(import.meta.dirname, '../../..');
const apiRequire = createRequire(resolve(root, 'apps/api/package.json'));
const webRequire = createRequire(resolve(root, 'apps/web/package.json'));
const { NestFactory } = apiRequire('@nestjs/core');
const { AppModule } = apiRequire('./dist/app.module');
const { PrismaService } = apiRequire('./dist/platform/prisma.service');
const { ApiExceptionFilter } = apiRequire('./dist/platform/api-exception.filter');
const { hashPassword } = apiRequire('./dist/auth/passwords');
const { seedCatalogue } = apiRequire('./dist/catalog/seed-catalogue');
const contracts = apiRequire('@sunshine/contracts');
const React = webRequire('react');
const { renderToStaticMarkup } = webRequire('react-dom/server');
const { MemoryRouter } = webRequire('react-router-dom');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { createServer } = webRequire('vite');

test('warehouse screens follow roles, use plain messages and never receive twice after a lost response', async () => {
  let app, vite;
  const nativeFetch = globalThis.fetch, origin = 'http://127.0.0.1:3001', password = 'warehouse-ui-test-password-2026';
  let cookie = '', losePath = '';
  try {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(), prisma = app.get(PrismaService);
    await seedCatalogue(prisma);
    const user = await prisma.user.create({ data: { email: randomUUID() + '@ui.test', displayName: 'Warehouse UI tester', role: 'WAREHOUSE', passwordHash: await hashPassword(password) } });
    const login = await nativeFetch(base + '/api/v1/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
    assert.equal(login.status, 200); cookie = login.headers.get('set-cookie').split(';')[0];
    vite = await createServer({ root: resolve(root, 'apps/web'), server: { middlewareMode: true }, appType: 'custom' });
    const api = await vite.ssrLoadModule('/src/lib/api.ts');
    const queries = await vite.ssrLoadModule('/src/features/warehouse/queries.ts');
    const { WarehousePage } = await vite.ssrLoadModule('/src/features/warehouse/WarehousePage.tsx');
    const { OrderFulfilmentPage } = await vite.ssrLoadModule('/src/features/warehouse/OrderFulfilmentPage.tsx');
    globalThis.fetch = async (input, init = {}) => {
      const target = new URL(String(input), base), headers = new Headers(init.headers);
      headers.set('cookie', cookie); headers.set('origin', origin);
      const response = await nativeFetch(target, { ...init, headers });
      if (losePath && target.pathname === losePath && response.ok) { losePath = ''; throw new TypeError('simulated response lost after commit'); }
      return response;
    };
    const render = (component, role, data = []) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      client.setQueryData(['staff-session'], { id: user.id, email: user.email, displayName: 'UI', role });
      for (const [key, value] of data) client.setQueryData(key, value);
      try { return renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, {}, component))); }
      finally { client.clear(); }
    };

    for (const role of ['SALES', 'TECHNICIAN', 'SUPPORT']) {
      assert.match(render(React.createElement(WarehousePage), role), /Your role cannot use the warehouse workspace/);
      assert.match(render(React.createElement(OrderFulfilmentPage, { orderId: randomUUID() }), role), /Your role cannot use the warehouse workspace/);
    }
    assert.match(render(React.createElement(WarehousePage), 'WAREHOUSE'), /Receive stock/);
    assert.match(render(React.createElement(WarehousePage), 'ADMIN'), /Receive stock/);
    assert.match(render(React.createElement(OrderFulfilmentPage, { orderId: 'not-an-id' }), 'ADMIN'), /valid order link/);

    const checked = queries.checkInput(contracts.receiveStockRequestSchema, { reference: '', locationId: '', receivedAt: '', lines: [{ productId: '', quantity: '', unitCost: '' }] }, { reference: 'Enter the delivery reference.', productId: 'Choose a product.' });
    assert.equal(checked.problem.fields.reference, 'Enter the delivery reference.');
    assert.equal(checked.problem.fields.productId, 'Choose a product.', 'an error inside a line reaches its own field');
    assert.ok(checked.problem.fields.unitCost, 'a field without a plain message still shows the contract message');

    const refused = await api.apiPost(`/orders/${randomUUID()}/allocations`, contracts.allocationListResponseSchema, { expectedVersion: 1 }, { idempotencyKey: api.newIdempotencyKey() }).catch((error) => error);
    assert.equal(refused.status, 404);
    assert.deepEqual(queries.describeFailure(new api.ApiRequestError('x', 409, 'NOT_READY', {}, undefined, [
      { code: 'A', reason: 'First.', source: 'INVENTORY', nextAction: 'Do one.' }, { code: 'B', reason: 'Second.', source: 'INVENTORY', nextAction: 'Do two.' },
    ])).messages, ['First. Do one.', 'Second. Do two.'], 'every refusal reason is shown');

    const location = (await api.apiGet('/stock/locations', contracts.stockLocationListResponseSchema)).data.find((row) => row.kind === 'USABLE');
    const product = (await api.apiGet('/products?kind=HARDWARE&trackingMode=BULK&pageSize=1', contracts.productListResponseSchema)).data.items[0];
    const body = { reference: 'UI-' + randomUUID(), locationId: location.id, receivedAt: new Date().toISOString(), lines: [{ productId: product.id, quantity: '2', unitCost: '10.00' }] };
    const key = api.newIdempotencyKey();
    losePath = '/api/v1/stock/receipts';
    await assert.rejects(api.apiPost('/stock/receipts', contracts.stockReceiptResponseSchema, body, { idempotencyKey: key }), (error) => error.code === 'NETWORK_ERROR');
    const replay = await api.apiPost('/stock/receipts', contracts.stockReceiptResponseSchema, body, { idempotencyKey: key });
    assert.equal(replay.data.reference, body.reference);
    assert.equal(await prisma.stockDocument.count({ where: { reference: body.reference } }), 1);
    assert.equal((await prisma.stockMovement.findMany({ where: { documentLine: { document: { reference: body.reference } } } })).length, 1, 'a retried receipt moves stock once');
  } finally {
    globalThis.fetch = nativeFetch;
    await vite?.close(); await app?.close();
  }
});
