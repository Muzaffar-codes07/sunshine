// Explicit disposable PostgreSQL only. Build API/contracts first; run with TEST_DATABASE_URL.
// Uses the real API request helper and real React rendering. Browser interactions are cross-reviewed separately.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) throw Error('Disposable TEST_DATABASE_URL required');
process.env.DATABASE_URL = url;
process.env.SESSION_SECRET = 'orders-ui-tests-only-session-secret-2026';
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
const { catalogueDemoId } = apiRequire('./dist/catalog/demo-catalogue');
const contracts = apiRequire('@sunshine/contracts');
const React = webRequire('react');
const { renderToStaticMarkup } = webRequire('react-dom/server');
const { MemoryRouter } = webRequire('react-router-dom');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { createServer } = webRequire('vite');

test('Orders UI contracts, role views and lost-response replays work against the real API', async () => {
  let app, vite;
  const nativeFetch = globalThis.fetch, actors = {}, cookies = {}, origin = 'http://127.0.0.1:3001';
  const password = 'orders-ui-test-password-2026';
  let role = 'SALES', losePath = '', droppedResponse;
  const requests = [];
  try {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl(), prisma = app.get(PrismaService);
    await seedCatalogue(prisma);
    for (const value of ['SALES', 'ADMIN', 'TECHNICIAN', 'WAREHOUSE']) {
      const user = await prisma.user.create({ data: {
        email: randomUUID() + '@ui.test', displayName: value + ' UI tester', role: value, passwordHash: await hashPassword(password),
      } });
      actors[value] = { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
      const login = await nativeFetch(base + '/api/v1/auth/login', {
        method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password }),
      });
      assert.equal(login.status, 200);
      cookies[value] = login.headers.get('set-cookie').split(';')[0];
    }
    const customer = await prisma.customer.create({ data: {
      name: 'UI Customer', phone: '7' + String(randomInt(1e9)).padStart(9, '0'), addressLine: '2 UI Road', city: 'Pune', pincode: '411001',
    } });
    const enquiry = await prisma.enquiry.create({ data: {
      customerId: customer.id, source: 'PHONE', requestedCapacityKw: 1, status: 'QUALIFIED',
      contactName: 'UI Customer', siteAddressLine: '2 UI Road', siteCity: 'Pune', sitePincode: '411001',
    } });
    const survey = await prisma.survey.create({ data: {
      enquiryId: enquiry.id, revision: 1, status: 'APPROVED', version: 3,
      technicianId: actors.TECHNICIAN.id, scheduledFor: new Date(), roofDirection: 'S', roofTiltDeg: '18.5',
      cableDistanceM: '22.00', usableRoofAreaSqm: '30.00', submittedAt: new Date(), decidedAt: new Date(), decidedById: actors.SALES.id,
    } });
    vite = await createServer({ root: resolve(root, 'apps/web'), server: { middlewareMode: true }, appType: 'custom' });
    const api = await vite.ssrLoadModule('/src/lib/api.ts');
    const { QuotePanel } = await vite.ssrLoadModule('/src/features/orders/QuotePanel.tsx');
    const { OrderPage } = await vite.ssrLoadModule('/src/features/orders/OrderPage.tsx');
    globalThis.fetch = async (input, init = {}) => {
      const target = new URL(String(input), base), headers = new Headers(init.headers);
      headers.set('cookie', cookies[role]); headers.set('origin', origin);
      requests.push({ role, path: target.pathname, method: init.method ?? 'GET', key: headers.get('idempotency-key') });
      const response = await nativeFetch(target, { ...init, headers });
      if (losePath && target.pathname === losePath && response.ok) {
        losePath = ''; droppedResponse = await response.clone().json();
        throw new TypeError('simulated response lost after commit');
      }
      return response;
    };
    const render = (component, actor, data = []) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      client.setQueryData(['staff-session'], actor);
      for (const [key, value] of data) client.setQueryData(key, value);
      try {
        return renderToStaticMarkup(React.createElement(QueryClientProvider, { client },
          React.createElement(MemoryRouter, { initialEntries: ['/workspace/orders'] }, component)));
      } finally { client.clear(); }
    };
    const enquiryResponse = await api.apiGet('/enquiries/' + enquiry.id, contracts.enquiryDetailResponseSchema);
    const surveysResponse = await api.apiGet('/enquiries/' + enquiry.id + '/surveys', contracts.surveyListResponseSchema);
    const packagesResponse = await api.apiGet('/packages?pageSize=100', contracts.packageListResponseSchema);
    const quoteData = async (order = null) => [
      [['enquiry', enquiry.id], enquiryResponse],
      [['enquiry', enquiry.id, 'surveys'], surveysResponse],
      [['enquiry', enquiry.id, 'quotes', actors.SALES.id, 'SALES'], await api.apiGet('/enquiries/' + enquiry.id + '/quotes', contracts.quoteListResponseSchema)],
      [['quote-packages', actors.SALES.id, 'SALES'], packagesResponse],
      [['enquiry', enquiry.id, 'order', actors.SALES.id, 'SALES'], order],
    ];
    assert.match(render(React.createElement(QuotePanel, { enquiryId: enquiry.id }), actors.SALES, await quoteData()), /Create quote/);
    let quote = (await api.apiPost('/enquiries/' + enquiry.id + '/quotes', contracts.quoteResponseSchema, {
      surveyId: survey.id, packageId: catalogueDemoId(1001),
    })).data;
    assert.match(render(React.createElement(QuotePanel, { enquiryId: enquiry.id }), actors.SALES, await quoteData()), /Record quote sent/);
    quote = (await api.apiPost('/quotes/' + quote.id + '/send', contracts.quoteResponseSchema, { version: quote.version, channel: 'PRINT' })).data;
    assert.match(render(React.createElement(QuotePanel, { enquiryId: enquiry.id }), actors.SALES, await quoteData()), /Record acceptance/);
    quote = (await api.apiPost('/quotes/' + quote.id + '/accept', contracts.quoteResponseSchema, { version: quote.version, acceptedByName: 'UI Customer', channel: 'PHONE' })).data;
    assert.match(render(React.createElement(QuotePanel, { enquiryId: enquiry.id }), actors.SALES, await quoteData()), /Confirm order/);

    const confirmationKey = api.newIdempotencyKey(), command = { quoteId: quote.id };
    losePath = '/api/v1/orders';
    await assert.rejects(api.apiPost('/orders', contracts.orderResponseSchema, command, { idempotencyKey: confirmationKey }), e => e.code === 'NETWORK_ERROR');
    let order = (await api.apiPost('/orders', contracts.orderResponseSchema, command, { idempotencyKey: confirmationKey })).data;
    assert.deepEqual({ data: order }, droppedResponse);
    assert.equal(await prisma.order.count({ where: { quoteId: quote.id } }), 1);
    assert.equal(await prisma.invoice.count({ where: { orderId: order.id } }), 1);
    assert.equal(await prisma.job.count({ where: { orderId: order.id } }), 1);
    await assert.rejects(api.apiPost('/orders', contracts.orderResponseSchema, command, { idempotencyKey: api.newIdempotencyKey() }), e =>
      e.status === 409 && e.reasons[0]?.code === 'ORDER_ALREADY_CONFIRMED' && !!e.reasons[0]?.nextAction);
    const renderOrder = (actor, value = order) => render(React.createElement(OrderPage, { orderId: order.id }), actor, [
      [['order', order.id, 'finance', actor.id, actor.role], { data: value }],
    ]);
    assert.ok(!renderOrder(actors.SALES).includes('name="amountInr"'), 'sales has no payment form');
    assert.ok(renderOrder(actors.ADMIN).includes('name="amountInr"'), 'admin has the payment form');

    const receipt = { amountInr: '20000.00', method: 'BANK_TRANSFER', reference: 'UI-' + randomUUID(), receivedAt: new Date().toISOString() };
    await assert.rejects(api.apiPost('/invoices/' + order.invoice.id + '/payments', contracts.invoiceResponseSchema, receipt, { idempotencyKey: api.newIdempotencyKey() }), e => e.status === 403);
    role = 'ADMIN';
    const receiptKey = api.newIdempotencyKey();
    losePath = '/api/v1/invoices/' + order.invoice.id + '/payments';
    await assert.rejects(api.apiPost('/invoices/' + order.invoice.id + '/payments', contracts.invoiceResponseSchema, receipt, { idempotencyKey: receiptKey }), e => e.code === 'NETWORK_ERROR');
    const invoice = (await api.apiPost('/invoices/' + order.invoice.id + '/payments', contracts.invoiceResponseSchema, receipt, { idempotencyKey: receiptKey })).data;
    assert.deepEqual({ data: invoice }, droppedResponse);
    assert.equal(invoice.balance, '35000.00');
    assert.equal(await prisma.payment.count({ where: { invoiceId: invoice.id } }), 1);
    order = (await api.apiGet('/orders/' + order.id, contracts.orderResponseSchema)).data;
    assert.match(renderOrder(actors.ADMIN), /UI-/);
    role = 'WAREHOUSE';
    await assert.rejects(api.apiGet('/orders/' + order.id, contracts.orderResponseSchema), e => e.status === 403);
    const fulfilment = await api.apiGet('/orders/' + order.id + '/fulfilment', contracts.orderFulfilmentResponseSchema);
    const warehouse = render(React.createElement(OrderPage, { orderId: order.id }), actors.WAREHOUSE, [
      [['order', order.id, 'fulfilment', actors.WAREHOUSE.id, 'WAREHOUSE'], fulfilment],
    ]);
    assert.match(warehouse, /Order fulfilment/);
    assert.ok(!warehouse.includes('INV-') && !warehouse.includes(receipt.reference) && !warehouse.includes('name="amountInr"') && !warehouse.includes('55000.00'), 'warehouse render contains no finance');
    role = 'ADMIN';
    const final = (await api.apiPost('/invoices/' + invoice.id + '/payments', contracts.invoiceResponseSchema, {
      amountInr: '35000.00', method: 'CASH', reference: 'UI-FINAL-' + randomUUID(), receivedAt: new Date().toISOString(),
    }, { idempotencyKey: api.newIdempotencyKey() })).data;
    assert.equal(final.status, 'PAID');
    const summary = (await api.apiGet('/enquiries/' + enquiry.id + '/summary', contracts.projectSummaryResponseSchema)).data;
    assert.equal(summary.stage, 'PAID');
    const confirmationRequests = requests.filter(r => r.path === '/api/v1/orders' && r.key === confirmationKey);
    assert.equal(confirmationRequests.length, 2);
    const receiptRequests = requests.filter(r => r.path.endsWith('/payments') && r.key === receiptKey);
    assert.equal(receiptRequests.length, 2);
    console.log('PASS: real quote/order/payment flow, same-key lost-response replays, 409 next action, role-specific React views and PAID summary');
  } finally {
    globalThis.fetch = nativeFetch;
    await vite?.close();
    await app?.close();
  }
});
