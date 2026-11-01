// Isolated persisted warehouse -> field acceptance. Requires built API/contracts, migrated
// TEST_DATABASE_URL ending in _test, and an externally installed Playwright package/browser.
// API setup creates explicit synthetic sales fixtures; business effects run through real services.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createSalesOrderFromBrowser } from './sales-browser-flow.mjs';
const root = resolve(import.meta.dirname, '../../..');
const apiRequire = createRequire(resolve(root, 'apps/api/package.json'));
const webRequire = createRequire(resolve(root, 'apps/web/package.json'));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const db = process.env.TEST_DATABASE_URL;
if (!db || !new URL(db).pathname.endsWith('_test')) throw Error('Explicit disposable _test database required');
process.env.DATABASE_URL = db;
// Keep setup inside the same explicit test-database boundary as the browser run.
// A separate `npm run db:deploy` can otherwise pick up an unrelated local .env.
if (process.argv.includes('--migrate')) {
  const migration = spawnSync('npm', ['run', 'db:deploy'], { cwd: root, env: process.env, stdio: 'inherit' });
  if (migration.error) throw migration.error;
  if (migration.status !== 0) throw Error('Disposable browser database migration failed');
}
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
const { seedWarrantyPolicies } = apiRequire('./dist/warranty/seed-warranty-policies');
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
  await seedWarrantyPolicies(prisma);
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
    if (run === 1) ({ order, customer } = await createSalesOrderFromBrowser({ browser, adminPage: page, staff, password, prisma, origin, contexts, errors, onPage: current => { activePage = current; }, registerContext: (role, scoped) => roleContexts.set(role, scoped) }));
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
    // Hold only the job readback while allocations refresh, reproducing the reservation/prepare race.
    let releaseJobReadback;
    const jobReadbackGate = new Promise(resolve => { releaseJobReadback = resolve; });
    let jobReadbackHeld;
    const jobReadbackStarted = new Promise(resolve => { jobReadbackHeld = resolve; });
    await fulfilmentPage.getByRole('button', { name: 'Reserve all stock' }).waitFor();
    if (run === 1) await fulfilmentPage.route(`**/api/v1/jobs/${job.id}`, async route => {
      const response = await route.fetch(); jobReadbackHeld(); await jobReadbackGate; await route.fulfill({ response });
    });
    await fulfilmentPage.getByRole('button', { name: 'Reserve all stock' }).click();
    if (run === 1) {
      await jobReadbackStarted;
      await fulfilmentPage.getByRole('button', { name: 'Prepare dispatch', exact: true }).waitFor();
      try { assert.equal(await fulfilmentPage.getByRole('button', { name: 'Prepare dispatch', exact: true }).isDisabled(), true); }
      finally { releaseJobReadback(); }
    }
    await fulfilmentPage.getByRole('button', { name: 'Prepare dispatch', exact: true }).click();
    if (run === 1) await fulfilmentPage.unroute(`**/api/v1/jobs/${job.id}`);
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
    await page.goto('/workspace/service');
    await page.getByRole('textbox', { name: 'Installed unit ID', exact: true }).fill(allocated[0].unitId);
    await page.getByRole('textbox', { name: 'Fault description', exact: true }).fill('Explicit synthetic complaint; no repair performed in this browser case');
    const intakeRequests = []; let loseIntake = run === 1;
    await page.route('**/api/v1/tickets', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      intakeRequests.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
      const response = await route.fetch(); assert.equal(response.status(), 201);
      if (loseIntake) { loseIntake = false; return route.abort('failed'); }
      return route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Create ticket', exact: true }).click();
    if (run === 1) {
      await page.getByRole('button', { name: 'Retry this request', exact: true }).waitFor();
      assert.equal(await page.getByRole('textbox', { name: 'Fault description', exact: true }).isDisabled(), true);
      await page.getByRole('button', { name: 'Retry this request', exact: true }).click();
    }
    await page.waitForURL(/\/workspace\/service\?ticket=/);
    const ticket = await prisma.serviceTicket.findUniqueOrThrow({ where: { id: new URL(page.url()).searchParams.get('ticket') } });
    lastTicket = ticket;
    assert.equal(ticket.customerId, customer.id); assert.equal(ticket.jobId, job.id); assert.ok(ticket.sourceVerifiedAt);
    assert.equal(intakeRequests.length, run === 1 ? 2 : 1);
    if (run === 1) assert.deepEqual(intakeRequests[0], intakeRequests[1]);
    assert.equal(await prisma.serviceTicketEvent.count({ where: { ticketId: ticket.id } }), 1);
    await page.unroute('**/api/v1/tickets');
    await page.getByRole('heading', { name: `Ticket ${ticket.ticketNumber}`, exact: true }).waitFor();
    await page.reload(); await page.getByRole('heading', { name: `Ticket ${ticket.ticketNumber}`, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Save assessment', exact: true }).isDisabled(), false);
    if (run === 1) {
      await page.getByRole('textbox', { name: 'Requested scope', exact: true }).fill('Uncovered cosmetic work');
      await page.getByRole('button', { name: 'Save assessment', exact: true }).click();
      await page.getByText('Not covered — charge pending assessment', { exact: true }).waitFor();
      await page.getByRole('textbox', { name: 'Requested scope', exact: true }).fill('Component replacement');
      await page.getByRole('button', { name: 'Save assessment', exact: true }).click();
      await page.getByText('Covered — customer charge ₹0.00', { exact: true }).waitFor();
      await page.getByRole('checkbox', { name: 'No parts, labour, replacement or financial effects occurred', exact: true }).check();
      await page.getByRole('textbox', { name: 'No-work resolution reason', exact: true }).fill('Synthetic customer withdrew complaint before any work');
      await page.getByRole('textbox', { name: 'Resolution details', exact: true }).fill('Complaint withdrawn; equipment was not repaired in this scenario');
      await page.getByRole('button', { name: 'Await customer confirmation', exact: true }).click();
      await page.getByRole('textbox', { name: 'Confirmer name', exact: true }).fill(customer.name);
      await page.getByRole('button', { name: 'Close ticket', exact: true }).click();
      await page.getByText('Ticket closed with recorded customer confirmation.', { exact: true }).waitFor();
      await page.reload(); await page.getByText('Ticket closed with recorded customer confirmation.', { exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Audited service history', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'service fits 360px');
      const historyResponse = await context.request.get(`/api/v1/tickets/${ticket.id}/events`); assert.equal(historyResponse.status(), 200);
      const history = (await historyResponse.json()).data; assert.equal(history.total, 5);
      assert.ok(history.items.some(row => row.previousAssessment?.coverageStatus === 'OUT_OF_SCOPE' && row.assessment?.coverageStatus === 'COVERED'));
      assert.equal(await prisma.ticketLine.count({ where: { ticketId: ticket.id } }), 0);
      assert.equal(await prisma.invoice.count({ where: { sourceType: 'TICKET', sourceId: ticket.id } }), 0);
      console.log('PASS real ticket intake exact retry, audited scope correction and explicit no-work confirmed closure', ticket.id);
    }
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
  // Finance and warranty use persisted sources. Service work posting and payroll remain separate gates.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/workspace/reports');
  await page.getByRole('heading', { name: /Period summary/ }).waitFor();
  await page.getByRole('heading', { name: 'Open work across all dates' }).waitFor();
  const timeRecord = await prisma.installationTimeRecord.findFirstOrThrow({where:{jobId:lastTicket.jobId}});
  await page.getByRole('button',{name:`Review time ${timeRecord.id}`,exact:true}).click();
  await page.getByRole('textbox',{name:'Hourly rate (INR)',exact:true}).fill('36000.00');
  await page.getByRole('textbox',{name:'Rate approval reference',exact:true}).fill('Explicit fictional browser-test rate; no real wage assumption');
  await page.getByRole('button',{name:'Save approved rate revision',exact:true}).click();
  const rateRevision = await page.waitForFunction(()=>{
    const select=document.querySelector('select[name=rateRevisionId]'); return select?.options.length>1 ? select.options[1].value : null;
  });
  await page.getByRole('combobox',{name:'Approved rate revision',exact:true}).selectOption(await rateRevision.jsonValue());
  await page.getByRole('textbox',{name:'Time approval note',exact:true}).fill('Approved recorded browser fixture work');
  let approvalKey, approvalBody;
  await page.route(`**/api/v1/time-entries/${timeRecord.id}/approve`,async route=>{
    const request=route.request();
    if(!approvalKey){approvalKey=request.headers()['idempotency-key'];approvalBody=request.postData();const committed=await route.fetch();assert.equal(committed.status(),201);return route.abort('failed');}
    assert.equal(request.headers()['idempotency-key'],approvalKey);assert.equal(request.postData(),approvalBody);return route.continue();
  });
  await page.getByRole('button',{name:'Approve time and post cost',exact:true}).click();
  await page.getByRole('button',{name:'Retry this request',exact:true}).waitFor();
  assert.equal(await page.getByRole('combobox',{name:'Time approval status',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Retry this request',exact:true}).click();
  await page.getByRole('heading',{name:'Frozen labour cost',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'labour approval fits actual 360px viewport');
  assert.equal(await prisma.costEntry.count({where:{uniqueSourceId:'TIME_RECORD:'+timeRecord.id,costType:'INSTALLATION_LABOUR'}}),1);
  await page.reload();
  await page.getByRole('combobox',{name:'Time approval status',exact:true}).selectOption('APPROVED');
  await page.getByRole('button',{name:`Review time ${timeRecord.id}`,exact:true}).click();
  await page.getByRole('heading',{name:'Frozen labour cost',exact:true}).waitFor();
  await page.getByText('Installation pay only — service time and unapproved installation work are excluded.',{exact:true}).waitFor();
  const payResponse=await context.request.get('/api/v1/reports/pay-summary?period=today');assert.equal(payResponse.status(),200);
  const pay=(await payResponse.json()).data;assert.equal(pay.scope,'INSTALLATION_ONLY');
  const storedPay=await prisma.installationLabourApproval.aggregate({where:{timeRecord:{technicianId:timeRecord.technicianId}},_sum:{amount:true}});
  assert.equal(pay.technicians.find(row=>row.technicianId===timeRecord.technicianId).totalPay,storedPay._sum.amount.toFixed(2));
  console.log('PASS labour approval exact retry/pay source reconciliation',JSON.stringify({timeRecordId:timeRecord.id,approvalKey,scope:pay.scope}));
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
  await page.getByText('Installation pay only — service time and unapproved installation work are excluded.',{exact:true}).waitFor();
  console.log('PASS persisted report JSON/CSV/source reconciliation',JSON.stringify(summary));
  await page.goto('/workspace/service');
  assert.equal(await page.getByRole('button', { name: 'Create ticket', exact: true }).isDisabled(), false);
  await page.getByRole('textbox', { name: 'Serial number', exact: true }).fill('ABSENT-' + randomUUID());
  await page.getByRole('button', { name: 'Look up serial' }).click();
  await page.getByRole('alert').filter({ hasText: /No unit matches/i }).waitFor();
  const warrantyUnit = await prisma.unit.findUniqueOrThrow({ where: { id: lastTicket.unitId } });
  await page.getByRole('textbox', { name: 'Serial number', exact: true }).fill(warrantyUnit.rawSerial.toLowerCase());
  await page.getByRole('button', { name: 'Look up serial' }).click();
  await page.getByRole('heading', { name: `Warranty — ${warrantyUnit.rawSerial}`, exact: true }).waitFor();
  await page.locator('section[aria-labelledby=service-workspace-title]').getByText('COVERED', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('combobox', { name: 'Equipment product', exact: true }).selectOption(warrantyUnit.productId);
  await page.getByRole('button', { name: 'Save future warranty terms', exact: true }).waitFor();
  const policyName = page.getByRole('textbox', { name: 'Policy name', exact: true });
  const oldPolicyName = await policyName.inputValue();
  const changedPolicyName = 'Demo browser policy ' + randomUUID().slice(0, 8);
  await policyName.fill(changedPolicyName);
  await page.getByRole('textbox', { name: 'Policy revision', exact: true }).fill('browser-' + randomUUID().slice(0, 8));
  let lostPolicyBody, lostPolicyKey;
  await page.route(`**/api/v1/warranty-policies/${warrantyUnit.productId}`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const request = route.request();
    if (!lostPolicyBody) {
      lostPolicyBody = request.postData(); lostPolicyKey = request.headers()['idempotency-key'];
      const committed = await route.fetch(); assert.equal(committed.status(), 201);
      return route.abort('failed');
    }
    assert.equal(request.postData(), lostPolicyBody); assert.equal(request.headers()['idempotency-key'], lostPolicyKey);
    return route.continue();
  });
  await page.getByRole('button', { name: 'Save future warranty terms', exact: true }).click();
  await page.getByRole('button', { name: 'Retry saved policy request', exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Equipment product', exact: true }).isDisabled(), true);
  assert.equal(await policyName.isDisabled(), true);
  await page.getByRole('button', { name: 'Retry saved policy request', exact: true }).click();
  await page.waitForFunction(name => document.querySelector('input[name=policyName]')?.value === name &&
    !document.querySelector('input[name=policyName]')?.disabled, changedPolicyName);
  assert.notEqual(changedPolicyName, oldPolicyName);
  assert.equal(await prisma.command.count({ where: { actorId: staff.ADMIN.id, idempotencyKey: lostPolicyKey } }), 1);
  await page.reload();
  await page.getByRole('combobox', { name: 'Equipment product', exact: true }).selectOption(warrantyUnit.productId);
  await page.waitForFunction(name => document.querySelector('input[name=policyName]')?.value === name, changedPolicyName);
  await page.getByRole('textbox', { name: 'Serial number', exact: true }).fill(warrantyUnit.rawSerial);
  await page.getByRole('button', { name: 'Look up serial' }).click();
  await page.locator('section[aria-labelledby=service-workspace-title]').getByText('COVERED', { exact: true }).waitFor();
  const frozen = await context.request.get('/api/v1/warranties/lookup?' + new URLSearchParams({serial:warrantyUnit.rawSerial}));
  assert.equal((await frozen.json()).data.assessment.policyName, oldPolicyName, 'editing future terms does not change sold coverage');
  const supportPage = await rolePage('SUPPORT');
  await supportPage.goto('/workspace/service');
  await supportPage.getByRole('textbox', {name:'Serial number',exact:true}).fill(warrantyUnit.rawSerial);
  await supportPage.getByRole('button',{name:'Look up serial'}).click();
  await supportPage.locator('section[aria-labelledby=service-workspace-title]').getByText('COVERED',{exact:true}).waitFor();
  assert.equal(await supportPage.getByRole('heading',{name:'Configure future warranty terms',exact:true}).count(),0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,'warranty and policy fit 360px');
  console.log('PASS persisted warranty lookup, future-policy edit and lost-response exact retry',JSON.stringify({unitId:warrantyUnit.id,jobId:lastTicket.jobId,policyKey:lostPolicyKey}));
  // Keyboard navigation focuses content after a client-side route change.
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.id === 'workspace-content');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'workspace-content');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, browserErrors: errors, mode: useVite ? 'development' : 'production', scope: 'Persisted warehouse-to-field runs; sales fixtures via real services; ticket intake exact retry, audited scope corrections and legitimate no-work confirmed closure; installation pay approval/exact retry and source reconciliation; live financial JSON/CSV, warranty lookup and policy-edit replay. Actual repair-parts, replacement and service-time payroll gates remain. No physical phone/scanner or complete after-sales repair demo claim.' }, null, 2));
} catch (error) {
  console.error('FAIL', error);
  if (activePage && !activePage.isClosed()) console.error((await activePage.locator('body').innerText()).slice(0, 6000));
  throw error;
} finally {
  for (const context of contexts) await context.close();
  await browser?.close(); await vite?.close(); await app?.close();
}
