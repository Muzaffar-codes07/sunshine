// Full persisted acceptance needs an explicitly named empty test database.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
if(!process.env.TEST_DATABASE_URL||!/test/.test(new URL(process.env.TEST_DATABASE_URL).pathname))throw Error('Explicit TEST_DATABASE_URL with a test database name is required');
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
process.env.UPLOAD_DIR=resolve('var/demo450-test-uploads');
const {PrismaService}=require('../../dist/platform/prisma.service');
const {seedDemo,verifyDemo}=require('../../dist/demo/seed-demo');
const {demoId,buildManifest}=require('../../dist/demo/manifest');
const {InvoicesService}=require('../../dist/finance/invoices.service');
const {JobsService}=require('../../dist/field/jobs.service');
const {OrdersService}=require('../../dist/orders/orders.service');
const {CatalogService}=require('../../dist/catalog/catalog.service');
const {SurveysService}=require('../../dist/sales/surveys.service');
const {QuotesService}=require('../../dist/quotes/quotes.service');
const {IdempotencyService}=require('../../dist/platform/idempotency');

test('450-customer import rolls back late failure, resumes, reconciles and preserves progressed data',{timeout:300000},async()=>{
  const prisma=new PrismaService();
  try{
    assert.equal(await prisma.customer.count(),0,'Use an empty disposable database, not the demo');
    const options={password:'integration-test-only-password',anchor:'2026-11-01'};
    await assert.rejects(seedDemo(prisma,{...options,failAt:391}),/INJECTED_FAILURE/);
    const rows=buildManifest(options.anchor);
    assert.equal(await prisma.customer.count(),390);
    assert.equal(await prisma.customer.findUnique({where:{id:rows[390].customerId}}),null);
    assert.equal(await prisma.job.findUnique({where:{id:rows[390].jobId}}),null);
    assert.equal(await prisma.file.count(),0,'Failed completed job leaves no file metadata');
    assert.equal((await readdir(process.env.UPLOAD_DIR)).length,0,'New blobs are cleaned after rollback');
    const report=await seedDemo(prisma,options);
    assert.equal(report.actual.customers,450);assert.equal(report.actual.completedJobs,60);
    assert.equal(report.actual.counts.service_tickets,15);assert.equal(report.reconciliation.financialErrors,0);
    assert.equal(report.reconciliation.stock.ok,true);
    assert.deepEqual(report.reconciliation.warrantyAtIntake.map(r=>r.status).sort(),['COVERED','EXPIRED']);
    const original=report.actual.counts;
    const enquiry=await prisma.enquiry.update({where:{id:rows[0].enquiryId},data:{status:'CONTACTED',version:{increment:1}}});
    const repeat=await seedDemo(prisma,options);
    assert.deepEqual(repeat.actual.counts,original,'A rerun creates no duplicate rows');
    assert.equal((await prisma.enquiry.findUniqueOrThrow({where:{id:enquiry.id}})).status,'CONTACTED');
    await assert.rejects(seedDemo(prisma,{...options,anchor:'2026-10-31'}),/ANCHOR_CONFLICT/);
    // Read saved histories through production DTO readers, not raw seed JSON.
    const invoices=new InvoicesService(prisma),jobs=new JobsService(prisma);
    const quotes=new QuotesService(prisma,new CatalogService(prisma),new SurveysService(prisma));
    const orders=new OrdersService(prisma,new IdempotencyService(prisma),quotes,invoices,jobs);
    const actor=await prisma.user.findUniqueOrThrow({where:{email:'admin@sunshine.test'}});
    const job=(await jobs.get(rows[390].jobId,actor)).data;
    assert.equal(job.status,'COMPLETED');assert.equal(job.photoFileIds.length,1);assert.equal(job.timeRecords.length,2);
    const order=(await orders.getForEnquiry(rows[390].enquiryId)).data;
    assert.equal(order.invoice.balance,'0.00');
    assert.equal((await quotes.get(order.quoteId)).data.status,'ACCEPTED');
    const marker=await prisma.command.findUniqueOrThrow({where:{id:demoId('import:391')}});
    assert.equal(marker.action,'DEMO_CUSTOMER_IMPORT');
    assert.equal((await verifyDemo(prisma)).actual.customers,450);
  }finally{await prisma.$disconnect();}
});
