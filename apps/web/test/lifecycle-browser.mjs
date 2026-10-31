// Isolated persisted warehouse -> field acceptance. Requires built API/contracts, migrated
// TEST_DATABASE_URL ending in _test, and an externally installed Playwright package/browser.
// API setup creates explicit synthetic sales fixtures; business effects run through real services.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSalesOrderFromBrowser } from './sales-browser-flow.mjs';
const root = resolve(import.meta.dirname, '../../..');
const apiRequire = createRequire(resolve(root, 'apps/api/package.json'));
const webRequire = createRequire(resolve(root, 'apps/web/package.json'));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const db = process.env.TEST_DATABASE_URL;
if (!db || !new URL(db).pathname.endsWith('_test')) throw Error('Explicit disposable _test database required');
process.env.DATABASE_URL = db;
process.env.SESSION_SECRET = 'issue44-browser-only-test-session-secret';
process.env.SESSION_COOKIE_SECURE = 'false';
const origin = 'http://127.0.0.1:5145';
process.env.AUTH_TRUSTED_ORIGINS = origin;
const { NestFactory } = apiRequire('@nestjs/core');
const { AppModule } = apiRequire('./dist/app.module');
const { PrismaService } = apiRequire('./dist/platform/prisma.service');
const { ApiExceptionFilter } = apiRequire('./dist/platform/api-exception.filter');
const { AuthRuntime } = apiRequire('./dist/auth/auth.runtime');
const { hashPassword } = apiRequire('./dist/auth/passwords');
const { seedCatalogue } = apiRequire('./dist/catalog/seed-catalogue');
const { catalogueDemoId } = apiRequire('./dist/catalog/demo-catalogue');
const { SurveysService } = apiRequire('./dist/sales/surveys.service');
const { QuotesService } = apiRequire('./dist/quotes/quotes.service');
const { OrdersService } = apiRequire('./dist/orders/orders.service');
const { InvoicesService } = apiRequire('./dist/finance/invoices.service');
const { IdempotencyService } = apiRequire('./dist/platform/idempotency');
const { JobsService } = apiRequire('./dist/field/jobs.service');
const { StockLedgerService } = apiRequire('./dist/inventory/stock-ledger.service');
let app, vite, browser, activePage;
const results = [];
const contexts = [];
let lastTicket;
try {
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCsrfProtection({ trustedOrigins: app.get(AuthRuntime).origins });
  const useVite = process.env.BROWSER_VITE === 'true';
  await app.listen(useVite ? 0 : 5145, '127.0.0.1');
  const prisma = app.get(PrismaService);
  await seedCatalogue(prisma);
  if (useVite) vite = await webRequire('vite').createServer({ root: resolve(root, 'apps/web'), cacheDir: resolve(root, 'apps/web/node_modules/.vite-browser'), server: {
    host: '127.0.0.1', port: 5145, strictPort: true, proxy: { '/api': await app.getUrl() },
  } });
  await vite?.listen();
  browser = process.env.BROWSER_WS_FILE
    ? await chromium.connect(readFileSync(process.env.BROWSER_WS_FILE, 'utf8').trim())
    : await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
  const password = 'issue44-browser-only-password';
  const staff = {};
  for (const role of ['ADMIN', 'SALES', 'TECHNICIAN', 'WAREHOUSE', 'SUPPORT']) staff[role] = await prisma.user.create({ data: {
    email: `${randomUUID()}@issue44.test`, displayName: `${role} browser tester ${randomUUID().slice(0, 6)}`, role, passwordHash: await hashPassword(password),
  } });
  const identity = role => ({ id: staff[role].id, email: staff[role].email, role, displayName: staff[role].displayName });
  const context = await browser.newContext({ baseURL: origin, viewport: { width: 360, height: 800 } }); contexts.push(context);
  const login = await context.request.post('/api/v1/auth/login', { headers: { origin }, data: { email: staff.ADMIN.email, password } });
  assert.equal(login.status(), 200);
  const roleContexts = new Map([['ADMIN', context]]);
  const page = await context.newPage();
  activePage = page;
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('BROWSER ERROR', error.message); });
  async function rolePage(role) {
    let scoped = roleContexts.get(role);
    if (!scoped) {
      scoped = await browser.newContext({ baseURL: origin, viewport: { width: 360, height: 800 } }); contexts.push(scoped);
      const response = await scoped.request.post('/api/v1/auth/login', { headers: { origin }, data: { email: staff[role].email, password } }); assert.equal(response.status(), 200);
      roleContexts.set(role, scoped);
    }
    const scopedPage = await scoped.newPage(); scopedPage.on('pageerror', error => errors.push(error.message)); return scopedPage;
  }
  async function post(path, body) {
    const response = await context.request.post('/api/v1' + path, { headers: { origin, 'idempotency-key': randomUUID() }, data: body });
    const json = await response.json(); assert.ok(response.ok(), JSON.stringify(json)); return json.data;
  }
  for (let run = 1; run <= 3; run++) {
    // Transparent synthetic fixture: approved survey, accepted quote, paid order and physical stock.
    let order, customer;
    if (run === 1) ({ order, customer } = await createSalesOrderFromBrowser({ browser, adminPage: page, staff, password, prisma, origin, contexts, errors, registerContext: (role, scoped) => roleContexts.set(role, scoped) }));
    else {
    customer = await prisma.customer.create({ data: { name: `Browser Customer ${run}`, phone: `7${String(randomInt(1e9)).padStart(9, '0')}`, addressLine: '44 Solar Road', city: 'Nagpur', pincode: '440001' } });
    const enquiry = await prisma.enquiry.create({ data: { customerId: customer.id, source: 'PHONE', requestedCapacityKw: 3, status: 'QUALIFIED', contactName: customer.name, siteAddressLine: customer.addressLine, siteCity: customer.city, sitePincode: customer.pincode } });
    const surveys = app.get(SurveysService), quotes = app.get(QuotesService);
    const survey = (await surveys.schedule(enquiry.id, { technicianId: staff.TECHNICIAN.id, scheduledFor: new Date(Date.now() + 86400000).toISOString() })).data;
    await surveys.submit(survey.id, { version: 1, roofDirection: 'S', roofTiltDeg: '18.5', cableDistanceM: '22.00', usableRoofAreaSqm: '80.00' }, identity('TECHNICIAN'));
    await surveys.approve(survey.id, { version: 2 }, identity('SALES'));
    const quote = (await quotes.create(enquiry.id, { surveyId: survey.id, packageId: catalogueDemoId(1003) }, identity('SALES'))).data;
    await quotes.send(quote.id, { version: 1, channel: 'PRINT' }, identity('SALES'));
    await quotes.accept(quote.id, { version: 2, acceptedByName: customer.name, channel: 'IN_PERSON' }, identity('SALES'));
    order = (await app.get(OrdersService).confirm({ quoteId: quote.id }, randomUUID(), identity('SALES'))).data;
    const payment = { amountInr: order.invoice.total, method: 'UPI', reference: `UTR-${randomUUID().slice(0, 10)}`, receivedAt: new Date().toISOString() };
    await app.get(IdempotencyService).run({ actorId: staff.ADMIN.id, key: randomUUID(), action: 'PAYMENT_RECEIPT', payload: payment }, tx => app.get(InvoicesService).recordPayment(tx, order.invoice.id, payment, identity('ADMIN')));
    }
    const job = await prisma.job.findUniqueOrThrow({ where: { id: order.jobId } });
    if (run !== 1) await app.get(JobsService).schedule(job.id, { expectedVersion: job.version, scheduledStart: new Date(Date.now() + 86400000).toISOString(), scheduledFinish: new Date(Date.now() + 90000000).toISOString(), technicianIds: [staff.TECHNICIAN.id] }, identity('SALES'));
    const location = await prisma.stockLocation.findUniqueOrThrow({ where: { code: 'MAIN' } });
    const products = await prisma.product.findMany({ where: { id: { in: order.packing.map(line => line.productId) } } });
    for (const product of products) {
      const quantity = order.packing.filter(line => line.productId === product.id).reduce((sum, line) => sum + Number(line.quantity), 0);
      await post('/stock/receipts', { reference: `BROWSER-${randomUUID()}`, locationId: location.id, receivedAt: new Date().toISOString(), lines: [{ productId: product.id, quantity: String(quantity), unitCost: '100.00', serials: product.trackingMode === 'SERIALIZED' ? Array.from({ length: quantity }, () => `B44-${randomUUID().slice(0, 15)}`) : [] }] });
    }
    console.log('Prepared fixture', run, order.id, job.id);
    const begin = Date.now();
    const fulfilmentPage = run === 3 ? await rolePage('WAREHOUSE') : page;
    activePage = fulfilmentPage;
    fulfilmentPage.on('response', async response => { if (response.request().method() === 'POST' && response.status() >= 400) console.error('COMMAND REFUSED', response.status(), await response.text()); });
    await fulfilmentPage.goto(`/workspace/warehouse/orders/${order.id}`);
    await fulfilmentPage.getByRole('button', { name: 'Reserve all stock' }).click();
    await fulfilmentPage.getByRole('button', { name: 'Prepare dispatch', exact: true }).click();
    await fulfilmentPage.getByRole('heading', { name: 'Scan equipment' }).waitFor();
    const allocated = await prisma.allocation.findMany({ where: { jobId: job.id, unitId: { not: null } }, include: { unit: true } });
    // Typed input is persisted but never qualifies as physical scan evidence.
    await fulfilmentPage.getByRole('textbox', { name: 'Serial number', exact: true }).fill(allocated[0].unit.rawSerial);
    await fulfilmentPage.getByRole('textbox', { name: 'Serial number', exact: true }).press('Enter');
    await fulfilmentPage.getByText(`0 of ${allocated.length} required units scanned.`, { exact: true }).waitFor();
    await fulfilmentPage.getByText('Recorded only', { exact: true }).waitFor();
    await fulfilmentPage.getByLabel('Input source', { exact: true }).selectOption('SCANNER');
    for (const [index, allocation] of allocated.entries()) {
      await fulfilmentPage.getByRole('textbox', { name: 'Serial number', exact: true }).fill(allocation.unit.rawSerial);
      await fulfilmentPage.getByRole('textbox', { name: 'Serial number', exact: true }).press('Enter');
      await fulfilmentPage.getByText(`${index + 1} of ${allocated.length} required units scanned.`, { exact: true }).waitFor();
      if (index + 1 < allocated.length) await fulfilmentPage.waitForFunction(() => document.activeElement?.id.startsWith('scan-'));
    }
    // Commit response loss: real server commits; browser retries the exact key and body.
    const commands = [];
    let lose = true;
    await fulfilmentPage.route('**/api/v1/dispatches/*/dispatch', async route => {
      const request = route.request(); commands.push({ key: request.headers()['idempotency-key'], body: request.postData() });
      const response = await route.fetch();
      if (lose) { lose = false; assert.equal(response.status(), 200); await route.abort('failed'); }
      else await route.fulfill({ response });
    });
    await fulfilmentPage.getByRole('button', { name: 'Post dispatch', exact: true }).click();
    await fulfilmentPage.getByRole('button', { name: 'Retry this request' }).click();
    await fulfilmentPage.getByRole('button', { name: 'Record delivery' }).waitFor();
    assert.equal(commands.length, 2); assert.deepEqual(commands[0], commands[1]);
    await fulfilmentPage.unroute('**/api/v1/dispatches/*/dispatch');
    await fulfilmentPage.getByRole('button', { name: 'Record delivery' }).click();
    await fulfilmentPage.getByRole('heading', { name: 'Delivered', exact: true }).waitFor();
    await fulfilmentPage.reload(); await fulfilmentPage.getByRole('heading', { name: 'Delivered', exact: true }).waitFor();
    console.log('Delivered', run);
    const executionPage = run === 2 ? await rolePage('TECHNICIAN') : page;
    activePage = executionPage;
    await executionPage.goto(`/workspace/field-service/jobs/${job.id}`);
    await executionPage.getByRole('button', { name: 'Start job', exact: true }).click();
    await executionPage.getByRole('heading', { name: 'Complete the job', exact: true }).waitFor();
    await executionPage.getByRole('button', { name: 'Complete job', exact: true }).click();
    await executionPage.getByText('Add at least one roof photo.', { exact: true }).waitFor();
    await executionPage.locator('input[type=file]').setInputFiles({ name: 'roof.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUi5rGwMDAxMDAwMDAAAAMWgESNbkt0AAAAABJRU5ErkJggg==', 'base64') });
    await executionPage.getByRole('button', { name: "Don't use" }).waitFor();
    await executionPage.reload(); await executionPage.getByRole('button', { name: "Don't use" }).waitFor();
    const canvas = executionPage.locator('canvas'); await canvas.scrollIntoViewIfNeeded(); const box = await canvas.boundingBox(); assert.ok(box);
    await executionPage.mouse.move(box.x + 20, box.y + 30); await executionPage.mouse.down(); await executionPage.mouse.move(box.x + 120, box.y + 60, { steps: 10 }); await executionPage.mouse.up();
    await executionPage.getByRole('button', { name: 'Export PNG' }).click();
    await executionPage.getByText('Signature saved.', { exact: false }).waitFor();
    for (const value of ['MOUNTING', 'PANELS', 'WIRING', 'EARTHING', 'POWER_GENERATION']) await executionPage.locator(`input[name=check][value=${value}]`).check();
    assert.equal(await executionPage.locator('input[name=check]:checked').count(), 5);
    await executionPage.getByRole('button', { name: 'Complete job', exact: true }).click();
    await executionPage.getByRole('heading', { name: 'Completed work', exact: true }).waitFor();
    await executionPage.reload(); await executionPage.getByRole('heading', { name: 'Completed work', exact: true }).waitFor();
    await executionPage.getByAltText('Roof photo 1').evaluate(image => image.decode());
    await executionPage.getByAltText('Customer signature').evaluate(image => image.decode());
    assert.equal(await executionPage.getByAltText('Roof photo 1').evaluate(img => img.complete && img.naturalWidth > 0), true);
    assert.equal(await executionPage.getByAltText('Customer signature').evaluate(img => img.complete && img.naturalWidth > 0), true);
    assert.equal(await executionPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const saved = await prisma.job.findUniqueOrThrow({ where: { id: job.id }, include: { allocations: true } });
    assert.equal(saved.status, 'COMPLETED'); assert.ok(saved.allocations.every(row => row.status === 'INSTALLED'));
    assert.equal(await prisma.stockDocument.count({ where: { reference: `DISPATCH:${(await prisma.dispatch.findUniqueOrThrow({ where: { orderId: order.id } })).id}` } }), 1);
    results.push({ run, seconds: ((Date.now() - begin) / 1000).toFixed(1), jobId: job.id, orderId: order.id, serialUnits: allocated.length, status: saved.status });
    console.log('Completed persisted run', JSON.stringify(results.at(-1)));
    const ticket = await prisma.serviceTicket.create({ data: { ticketNumber: `B44-${randomUUID().slice(0, 12)}`, unitId: allocated[0].unitId, jobId: job.id, customerId: customer.id, faultDescription: 'Explicit synthetic saved ticket for read/refresh acceptance' } });
    lastTicket = ticket;
    await page.goto('/workspace/service');
    await page.getByRole('link', { name: ticket.ticketNumber, exact: true }).click();
    await page.getByRole('heading', { name: `Ticket ${ticket.ticketNumber}`, exact: true }).waitFor();
    await page.reload(); await page.getByRole('heading', { name: `Ticket ${ticket.ticketNumber}`, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save assessment', exact: true }).isDisabled(), true);
  }
  for (const role of ['SALES', 'WAREHOUSE', 'TECHNICIAN', 'SUPPORT']) {
    const scopedPage = await rolePage(role), scoped = scopedPage.context();
    const read = await scoped.request.get(`/api/v1/tickets/${lastTicket.id}`);
    assert.equal(read.status(), role === 'SUPPORT' ? 200 : 403);
    await scopedPage.goto(`/workspace/service?ticket=${lastTicket.id}`);
    if (role === 'SUPPORT') await scopedPage.getByRole('heading', { name: `Ticket ${lastTicket.ticketNumber}`, exact: true }).waitFor();
    else await scopedPage.getByText('Your role cannot open this workspace.', { exact: true }).waitFor();
  }
  const anonymous = await browser.newContext({ baseURL: origin }); contexts.push(anonymous);
  assert.equal((await anonymous.request.get(`/api/v1/tickets/${lastTicket.id}`)).status(), 401);
  await page.goto('/workspace/warehouse');
  await page.getByRole('button', { name: 'Receive stock', exact: true }).click();
  const receiptReference = `B44-UI-${randomUUID()}`;
  await page.getByRole('textbox', { name: 'Delivery reference', exact: true }).fill(receiptReference);
  await page.getByLabel('Product', { exact: true }).selectOption(catalogueDemoId(103));
  await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('2');
  await page.getByRole('textbox', { name: 'Actual cost per unit (₹)', exact: true }).fill('7.00');
  const receipts = []; let loseReceipt = true;
  await page.route('**/api/v1/stock/receipts', async route => {
    const request = route.request(); receipts.push({ key: request.headers()['idempotency-key'], body: request.postData() });
    const response = await route.fetch();
    if (loseReceipt) { loseReceipt = false; assert.equal(response.status(), 201); await route.abort('failed'); }
    else await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Record receipt', exact: true }).click();
  await page.getByRole('button', { name: 'Retry this request' }).click();
  await page.getByText(`Receipt ${receiptReference} recorded.`, { exact: true }).waitFor();
  assert.equal(receipts.length, 2); assert.deepEqual(receipts[0], receipts[1]);
  assert.equal(await prisma.stockDocument.count({ where: { reference: receiptReference } }), 1);
  await page.unroute('**/api/v1/stock/receipts');
  for (const [button, table] of [['Stock Balances', /Current Stock Levels/], ['Movement Ledger', /Stock Movements Ledger/], ['Valuation', /Product Inventory Valuation/]]) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await page.getByRole('table', { name: table }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${button} fits 360px`);
  }
  await page.getByRole('button', { name: 'Integrity & Audit', exact: true }).click();
  await page.getByText('✓ System Invariants Healthy', { exact: true }).waitFor();
  await page.setViewportSize({ width: 1280, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'desktop fits');
  // Real unavailable adapters stay visible as errors, never as fabricated coverage or finance.
  await page.goto('/workspace/reports');
  await page.getByRole('heading', { name: /Period summary/ }).waitFor();
  await page.getByRole('heading', { name: 'Open work across all dates' }).waitFor();
  const reportResponse = await context.request.get('/api/v1/reports/overview?period=today'); assert.equal(reportResponse.status(),200);
  const summary = (await reportResponse.json()).data;
  const cutoff = new Date(summary.asOf), start = new Date(summary.startUtc), end = new Date(summary.endUtc);
  const rawInvoices = await prisma.invoice.aggregate({where:{postedAt:{gte:start,lt:end,lte:cutoff},createdAt:{lte:cutoff}},_sum:{total:true}});
  const rawPayments = await prisma.payment.aggregate({where:{receivedAt:{gte:start,lt:end,lte:cutoff},createdAt:{lte:cutoff},invoice:{postedAt:{lte:cutoff},createdAt:{lte:cutoff}}},_sum:{amount:true}});
  const rawCosts = await prisma.costEntry.aggregate({where:{occurredAt:{gte:start,lt:end,lte:cutoff},postedAt:{lte:cutoff}},_sum:{amount:true}});
  assert.equal(summary.invoicedRevenue,rawInvoices._sum.total?.toFixed(2) ?? '0.00');
  assert.equal(summary.cashReceived,rawPayments._sum.amount?.toFixed(2) ?? '0.00');
  assert.equal(summary.actualCost,rawCosts._sum.amount?.toFixed(2) ?? '0.00');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', {name:'Download this period as CSV',exact:true}).click();
  const download = await downloading, stream = await download.createReadStream(); const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csvRows = Buffer.concat(chunks).toString('utf8').trim().split(/\r?\n/).map(row => row.split(','));
  const exported = Object.fromEntries(csvRows[0].map((name,i)=>[name.replaceAll('"',''),csvRows[1][i].replaceAll('"','')]));
  for (const field of ['invoicedRevenue','cashReceived','actualCost']) assert.equal(exported[field],summary[field]);
  await page.getByRole('textbox',{name:'Job ID',exact:true}).fill(lastTicket.jobId);
  await page.getByRole('button',{name:'Load job',exact:true}).click();
  await page.getByText('Provisional — unfinished',{exact:true}).waitFor();
  await page.getByRole('alert').filter({hasText:/approved time entries and frozen rates/}).waitFor();
  console.log('PASS persisted report JSON/CSV/source reconciliation',JSON.stringify(summary));
  await page.goto('/workspace/service');
  assert.equal(await page.getByRole('button', { name: 'Create ticket', exact: true }).isDisabled(), true);
  await page.getByRole('textbox', { name: 'Serial number', exact: true }).fill('TEST-UNAVAILABLE');
  await page.getByRole('button', { name: 'Look up serial' }).click();
  await page.getByRole('alert').filter({ hasText: /unavailable|integration/i }).waitFor();
  // Keyboard navigation focuses content after a client-side route change.
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.id === 'workspace-content');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'workspace-content');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, browserErrors: errors, mode: useVite ? 'development' : 'production', scope: 'Persisted warehouse-to-field runs; sales fixtures via real services; Live reports and CSV reconcile; payroll/warranty gates verified. No physical phone/scanner or complete after-sales demo claim.' }, null, 2));
} catch (error) {
  console.error('FAIL', error);
  if (activePage && !activePage.isClosed()) console.error((await activePage.locator('body').innerText()).slice(0, 6000));
  throw error;
} finally {
  for (const context of contexts) await context.close();
  await browser?.close(); await vite?.close(); await app?.close();
}
