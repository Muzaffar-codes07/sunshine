// Real disposable PostgreSQL proof; only the external approved-repair source reader is synthetic.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {installationFixture,installationCommands} from './helpers/installation-source.mjs';
const require = createRequire(import.meta.url);
const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) throw Error('Disposable TEST_DATABASE_URL required');
process.env.DATABASE_URL = url;
process.env.SESSION_SECRET = 'repair-invoice-tests-only-session-secret-2026';
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { Prisma } = require('../dist/generated/prisma/client');
const { PrismaService } = require('../dist/platform/prisma.service');
const { InvoicesService } = require('../dist/finance/invoices.service');
const { ServiceInvoiceWriter } = require('../dist/finance/service-invoice-writer');
const { RepairBillingService } = require('../dist/service/repair-billing.service');
const { CostWriterService } = require('../dist/finance/cost-writer.service');
const { SurveysService } = require('../dist/sales/surveys.service');
const { QuotesService } = require('../dist/quotes/quotes.service');
const { OrdersService } = require('../dist/orders/orders.service');
const { StockReceiptsService } = require('../dist/inventory/stock-receipts.service');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { catalogueDemoId: id } = require('../dist/catalog/demo-catalogue');
const {seedWarrantyPolicies}=require('../dist/warranty/seed-warranty-policies');
const {TicketCommandsService}=require('../dist/service/ticket-commands.service');
const actor = row => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });
let app, prisma, invoices, writer, order, unitId, admin, tech,directory;
const when = '2026-10-31T12:00:00.000Z';
const refuses = (promise, status, code) => assert.rejects(promise, error => {
  assert.equal(error.getStatus?.(), status, error.message); assert.equal(error.code, code); return true;
});
before(async () => {
  const parent=resolve(import.meta.dirname,'../../../var');await mkdir(parent,{recursive:true});directory=await mkdtemp(resolve(parent,'repair-source-test-'));process.env.UPLOAD_DIR=directory;
  app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  prisma = app.get(PrismaService); invoices = app.get(InvoicesService); writer = app.get(ServiceInvoiceWriter);
  assert.strictEqual(writer, invoices, 'D4 port resolves to the official D2 writer');
  await seedCatalogue(prisma);
  [admin, tech] = await Promise.all(['ADMIN', 'TECHNICIAN'].map(role => prisma.user.create({ data: {
    email: randomUUID() + '@repair.test', displayName: role + ' repair tester', role, passwordHash: 'not-a-login-hash',
  } })));
  await seedWarrantyPolicies(prisma);
  const main=await prisma.stockLocation.findUniqueOrThrow({where:{code:'MAIN'}});
  const complete=installationFixture({app,prisma,staff:{ADMIN:admin,SALES:admin,TECHNICIAN:tech},main,
    actor:role=>actor(role==='TECHNICIAN'?tech:admin),post:installationCommands(app,admin.id)});
  const time=await complete();order=await prisma.order.findUniqueOrThrow({where:{jobId:time.jobId}});
  unitId=(await prisma.allocation.findFirstOrThrow({where:{jobId:time.jobId,product:{category:'INVERTER'}}})).unitId;
});
after(async () => { await app?.close();await rm(directory,{recursive:true,force:true}); });
const ticket = async (covered = false, assessed = true) => {
  const commands=app.get(TicketCommandsService);
  let result=(await commands.create(actor(admin),randomUUID(),{unitId,faultDescription:'Synthetic fault'})).data;
  if(assessed) result=(await commands.assess(actor(admin),randomUUID(),result.id,{version:result.version,asOfDate:result.createdAt,
    requestedScope:covered?'Component replacement':'Component repair'})).data;
  return prisma.serviceTicket.findUniqueOrThrow({where:{id:result.id}});
};
const actorTx=work=>prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT set_config('sunshine.actor_id',${admin.id},true)`;return work(tx);
});
const input = row => ({
  uniqueSourceId: 'TICKET:' + row.id + ':REPAIR', ticketId: row.id, jobId: row.jobId, customerId: row.customerId,
  subtotal: '100.00', lines: [{ sourceId: randomUUID(), type: 'LABOUR', description: 'Approved service labour',
    quantity: '1.000', unitPrice: '100.00', totalPrice: '100.00' }],
});
const post = command => prisma.$transaction(tx => writer.ensureServiceInvoice(tx, command));
const invoiceWhere = ticketId => ({ sourceType: 'TICKET', sourceId: ticketId, kind: 'REPAIR' });

test('repair posting uses exact line-rounded selling amounts, independent of cost, with no receipt or sales order link', async () => {
  const row = await ticket(), command = input(row);
  command.lines = [
    { sourceId: randomUUID(), type: 'PART', description: 'A long original '.repeat(25), quantity: '0.125', unitPrice: '0.04', totalPrice: '0.01' },
    { sourceId: randomUUID(), type: 'LABOUR', description: 'Rounded labour', quantity: '2.5', unitPrice: '2', totalPrice: '5' },
  ]; command.subtotal = '5.01';
  const posted = await post(command), view = (await invoices.get(posted.invoiceId)).data;
  assert.equal(posted.subtotal, '5.01'); assert.equal(view.orderId, null); assert.equal(view.kind, 'REPAIR');
  assert.equal(view.sourceId, row.id); assert.equal(view.customerId, row.customerId);
  assert.equal(view.total, '5.01'); assert.equal(view.taxAmount, '0.00'); assert.equal(view.balance, '5.01');
  assert.deepEqual(view.payments, []); assert.equal('sourceSnapshot' in view, false);
  assert.ok(view.lines.some(line => line.description.endsWith('...')));
  const saved = await prisma.invoice.findUniqueOrThrow({ where: { id: posted.invoiceId } });
  assert.equal(saved.sourceSnapshot.source.lines.find(line => line.type === 'PART').description, command.lines[0].description.trim());
  const canonicalReplay = { ...command, ticketId: row.id.toUpperCase(), jobId: row.jobId.toUpperCase(), customerId: row.customerId.toUpperCase(),
    lines: [...command.lines].reverse().map(line => ({ ...line, sourceId: line.sourceId.toUpperCase() })) };
  assert.deepEqual(await post(canonicalReplay), posted);
});

test('concurrent identical calls post one invoice; different facts have one winner and an explicit refusal', async () => {
  const row = await ticket(), command = input(row);
  const same = await Promise.all(Array.from({ length: 4 }, () => post(command)));
  assert.equal(new Set(same.map(result => result.invoiceId)).size, 1);
  assert.equal(await prisma.invoice.count({ where: invoiceWhere(row.id) }), 1);
  const other = await ticket(), candidate = input(other);
  const competing = await Promise.allSettled([post(candidate), post({ ...candidate, lines: [{ ...candidate.lines[0], description: 'Different approved work' }] })]);
  assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1);
  const failure = competing.find(result => result.status === 'rejected').reason;
  assert.equal(failure.getStatus(), 409); assert.equal(failure.code, 'REPAIR_INVOICE_CONFLICT');
});

test('changed source identity, type, long-description suffix and amounts never silently replay', async () => {
  const row = await ticket(), command = input(row);
  command.lines[0].description = 'x'.repeat(300);
  await post(command);
  const changes = [
    { lines: [{ ...command.lines[0], sourceId: randomUUID() }] },
    { lines: [{ ...command.lines[0], type: 'PART' }] },
    { lines: [{ ...command.lines[0], description: 'x'.repeat(299) + 'y' }] },
    { subtotal: '101', lines: [{ ...command.lines[0], unitPrice: '101', totalPrice: '101' }] },
  ];
  for (const change of changes) await refuses(post({ ...command, ...change }), 409, 'REPAIR_INVOICE_CONFLICT');
  await refuses(post({ ...command, jobId: randomUUID() }), 409, 'REPAIR_SOURCE_CONFLICT');
  await refuses(post({ ...command, customerId: randomUUID() }), 409, 'REPAIR_SOURCE_CONFLICT');
  assert.equal(await prisma.invoice.count({ where: invoiceWhere(row.id) }), 1);
});

test('invalid sources, duplicate references, wrong totals, missing tickets and covered/unassessed work refuse', async () => {
  const row = await ticket(), command = input(row);
  await refuses(post({ ...command, uniqueSourceId: 'TICKET:' + randomUUID() + ':REPAIR' }), 503, 'REPAIR_INVOICE_INPUT_INVALID');
  await refuses(post({ ...command, lines: [...command.lines, command.lines[0]], subtotal: '200' }), 503, 'REPAIR_INVOICE_INPUT_INVALID');
  await refuses(post({ ...command, subtotal: '99' }), 409, 'REPAIR_INVOICE_AMOUNT_INVALID');
  await refuses(post({ ...command, lines: [{ ...command.lines[0], totalPrice: '99' }], subtotal: '99' }), 409, 'REPAIR_INVOICE_AMOUNT_INVALID');
  await refuses(post({ ...command, lines: [{ ...command.lines[0], quantity: 'NaN' }] }), 503, 'REPAIR_INVOICE_INPUT_INVALID');
  for (const invalid of [
    { ...command, subtotal: '0100' },
    { ...command, lines: [{ ...command.lines[0], quantity: '01' }] },
    { ...command, lines: [{ ...command.lines[0], unitPrice: '0100' }] },
  ]) await refuses(post(invalid), 503, 'REPAIR_INVOICE_INPUT_INVALID');
  const missing = { ...command, ticketId: randomUUID() }; missing.uniqueSourceId = 'TICKET:' + missing.ticketId + ':REPAIR';
  await refuses(post(missing), 404, 'TICKET_NOT_FOUND');
  await refuses(post(input(await ticket(true))), 409, 'REPAIR_INVOICE_NOT_CHARGEABLE');
  const unassessed=await ticket(false,false);
  await refuses(post(input(unassessed)), 409, 'REPAIR_INVOICE_NOT_CHARGEABLE');
  assert.equal(await prisma.invoice.count({ where: invoiceWhere(row.id) }), 0);
});

test('zero charge has a settled invoice without inventing a payment, and receipts preserve source replay', async () => {
  const row = await ticket(), command = input(row);
  command.subtotal = '0'; command.lines[0].unitPrice = '0'; command.lines[0].totalPrice = '0';
  const zero = await post(command), view = (await invoices.get(zero.invoiceId)).data;
  assert.equal(view.status, 'PAID'); assert.equal(view.balance, '0.00'); assert.deepEqual(view.payments, []);
  const paidTicket = await ticket(), paidInput = input(paidTicket), posted = await post(paidInput);
  await prisma.$transaction(tx => invoices.recordPayment(tx, posted.invoiceId, {
    amountInr: '100', method: 'UPI', reference: 'REPAIR-PAY-' + randomUUID(), receivedAt: new Date().toISOString(),
  }, actor(admin)));
  assert.deepEqual(await post(paidInput), posted);
  assert.equal((await invoices.get(posted.invoiceId)).data.status, 'PAID');
});

test('invoice, ticket and preceding caller writes roll back together, including a changed-source refusal', async () => {
  const row = await ticket(), command = input(row);
  await assert.rejects(prisma.$transaction(async tx => {
    await tx.customer.update({where:{id:row.customerId},data:{name:'Rolled-back edit'}});
    await writer.ensureServiceInvoice(tx, command); throw Error('late caller failure');
  }), /late caller failure/);
  assert.equal(await prisma.invoice.count({ where: invoiceWhere(row.id) }), 0);
  assert.equal((await prisma.customer.findUniqueOrThrow({where:{id:row.customerId}})).name,'Labour Source Customer');
  await post(command);
  await refuses(prisma.$transaction(async tx => {
    await tx.customer.update({where:{id:row.customerId},data:{name:'Must roll back on conflict'}});
    await writer.ensureServiceInvoice(tx, { ...command, lines: [{ ...command.lines[0], sourceId: randomUUID() }] });
  }), 409, 'REPAIR_INVOICE_CONFLICT');
  assert.equal((await prisma.customer.findUniqueOrThrow({where:{id:row.customerId}})).name,'Labour Source Customer');
});

test('real D4 billing composes costs, invoice and ticket snapshot atomically; covered work posts cost only', async () => {
  for (const covered of [false, true]) {
    const row = await ticket(covered), sourceId = randomUUID();
    const reader = { read: async () => [{
      sourceId, type: 'LABOUR', ticketId: row.id, jobId: row.jobId, customerId: row.customerId,
      scope: covered?'Component replacement':'Component repair', description: 'Approved persisted-source test labour',
      quantity: '1.000', unitCost: '60.00', unitPrice: '100.00', occurredAt: when,
    }] };
    const billing = new RepairBillingService(app.get(CostWriterService), reader, writer);
    const run = () => actorTx(tx => billing.executeRepairBilling(tx, row.id, [{ sourceId, type: 'LABOUR' }]));
    const first = await run(); assert.deepEqual(await run(), first);
    assert.equal(first.internalCost, '60.00'); assert.equal(first.customerCharge, covered ? '0.00' : '100.00');
    assert.equal(await prisma.costEntry.count({ where: { uniqueSourceId: 'TIME_ENTRY:' + sourceId } }), 1);
    assert.equal(await prisma.invoice.count({ where: invoiceWhere(row.id) }), covered ? 0 : 1);
    assert.equal(await prisma.ticketLine.count({ where: { ticketId: row.id } }), 1);
    assert.equal((await prisma.serviceTicket.findUniqueOrThrow({ where: { id: row.id } })).billingSnapshot.result.invoiceId, first.invoiceId);
    const commands=app.get(TicketCommandsService),current=await prisma.serviceTicket.findUniqueOrThrow({where:{id:row.id}});
    const resolved=(await commands.resolve(actor(admin),randomUUID(),row.id,{version:current.version,resolutionDetails:'Synthetic approved-source billing boundary completed'})).data;
    assert.equal(resolved.billingFinalized,true);assert.equal(resolved.noWorkReason,null);
    const closed=(await commands.confirm(actor(admin),randomUUID(),row.id,{version:resolved.version,confirmerName:'Fixture Customer',channel:'PHONE',confirmedAt:new Date().toISOString()})).data;
    assert.equal(closed.status,'CLOSED');
    assert.equal(await prisma.costEntry.count({where:{uniqueSourceId:'TIME_ENTRY:'+sourceId}}),1);
  }
});

test('a damaged snapshot or persisted invoice mismatch refuses safely rather than blessing a replay', async () => {
  const row = await ticket(), command = input(row), posted = await post(command);
  await prisma.invoice.update({ where: { id: posted.invoiceId }, data: { sourceSnapshot: { revision: 1, hash: 'bad', source: command } } });
  await refuses(post(command), 503, 'REPAIR_INVOICE_RECORD_INVALID');
  const other = await ticket(), candidate = input(other), second = await post(candidate);
  await prisma.invoiceLine.updateMany({ where: { invoiceId: second.invoiceId }, data: { description: 'Database-corrupted label' } });
  await refuses(post(candidate), 503, 'REPAIR_INVOICE_RECORD_INVALID');
});

test('late D4 caller failure removes real costs, invoice, lines and billing snapshot together', async () => {
  const row = await ticket(), sourceId = randomUUID();
  const sources = { read: async () => [{
    sourceId, type: 'LABOUR', ticketId: row.id, jobId: row.jobId, customerId: row.customerId,
    scope: 'Component repair', description: 'Atomic repair labour', quantity: '1', unitCost: '60', unitPrice: '100', occurredAt: when,
  }] };
  const billing = new RepairBillingService(app.get(CostWriterService), sources, writer);
  await assert.rejects(actorTx(async tx => {
    await billing.executeRepairBilling(tx, row.id, [{ sourceId, type: 'LABOUR' }]); throw Error('late D4 caller failure');
  }), /late D4 caller failure/);
  assert.equal(await prisma.invoice.count({ where: invoiceWhere(row.id) }), 0);
  assert.equal(await prisma.costEntry.count({ where: { uniqueSourceId: 'TIME_ENTRY:' + sourceId } }), 0);
  assert.equal(await prisma.ticketLine.count({ where: { ticketId: row.id } }), 0);
  const restored = await prisma.serviceTicket.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(restored.status, 'ASSESSED'); assert.equal(restored.version, row.version); assert.equal(restored.billingSnapshot, null);
});
