// Real PostgreSQL, actual sales/job sources and private disk. No completion workflow is simulated as implemented.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw Error('Disposable TEST_DATABASE_URL required');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'job-file-tests-only-session-secret';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
process.env.SESSION_COOKIE_SECURE = 'false';
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
const { PrismaService } = require('../dist/platform/prisma.service');
const { QuotesService } = require('../dist/quotes/quotes.service');
const { SurveysService } = require('../dist/sales/surveys.service');
const { OrdersService } = require('../dist/orders/orders.service');
const { JobsService } = require('../dist/field/jobs.service');
const { JobFileAccessService } = require('../dist/field/job-file-access.service');
const { FilesService } = require('../dist/files/files.service');
const { PrivateFileStore } = require('../dist/files/private-file.store');
const { seedCatalogue } = require('../dist/catalog/seed-catalogue');
const { catalogueDemoId: id } = require('../dist/catalog/demo-catalogue');
const { hashPassword } = require('../dist/auth/passwords');
const { Client } = require('pg');
const origin = 'http://127.0.0.1:3001', password = 'job-file-test-password-2026';
const staff = {}, cookies = {};
const identity = row => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII=', 'base64');
const upload = () => ({ buffer: png, size: png.length, mimetype: 'image/png', originalname: 'roof.png' });
const expectCode = (pending, status, code) => assert.rejects(pending, error => error.getStatus() === status && error.code === code);
const context = job => ({ contextType: 'JOB', contextId: job.jobId });
let app, base, prisma, quotes, surveys, orders, jobs, files, store, access, directory, sql;
before(async () => {
  const parent = resolve(import.meta.dirname, '../../../var'); await mkdir(parent, { recursive: true });
  directory = await mkdtemp(resolve(parent, 'job-files-test-')); process.env.UPLOAD_DIR = directory;
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1'); base = (await app.getUrl()) + '/api/v1';
  prisma = app.get(PrismaService); quotes = app.get(QuotesService); surveys = app.get(SurveysService);
  orders = app.get(OrdersService); jobs = app.get(JobsService); files = app.get(FilesService);
  store = app.get(PrivateFileStore); access = app.get(JobFileAccessService);
  await seedCatalogue(prisma); sql = new Client({ connectionString: testUrl }); await sql.connect();
  const passwordHash = await hashPassword(password);
  for (const [name, role] of [['ADMIN','ADMIN'],['SALES','SALES'],['TECH_A','TECHNICIAN'],['TECH_B','TECHNICIAN'],['WAREHOUSE','WAREHOUSE'],['SUPPORT','SUPPORT']]) {
    staff[name] = await prisma.user.create({ data: { email: randomUUID()+'@test.local', displayName: name+' file tester', role, passwordHash } });
    if (name === 'SUPPORT') continue; // Keep within the existing login limit; its matrix is exercised in-process.
    const r = await fetch(base+'/auth/login', { method:'POST', headers:{origin,'content-type':'application/json'}, body:JSON.stringify({email:staff[name].email,password}) });
    assert.equal(r.status,200); cookies[name] = r.headers.get('set-cookie').split(';')[0];
  }
});
after(async () => {
  await sql?.end(); await app?.close();
  if (directory) {
    if (!resolve(directory).startsWith(resolve(import.meta.dirname,'../../../var')+sep) || !directory.split(sep).pop().startsWith('job-files-test-')) throw Error('Unsafe fixture cleanup');
    await rm(directory,{recursive:true,force:true});
  }
});
async function newJob() {
  const customer = await prisma.customer.create({data:{name:'Evidence Customer',phone:`7${String(randomInt(1e9)).padStart(9,'0')}`,addressLine:'6 Evidence Road',city:'Nagpur',pincode:'440001'}});
  const enquiry = await prisma.enquiry.create({data:{customerId:customer.id,source:'PHONE',requestedCapacityKw:1,status:'QUALIFIED',contactName:'Evidence Customer',siteAddressLine:'6 Evidence Road',siteCity:'Nagpur',sitePincode:'440001'}});
  const sales = identity(staff.SALES);
  const survey = (await surveys.schedule(enquiry.id,{technicianId:staff.TECH_A.id,scheduledFor:'2026-11-02T05:00:00.000Z'})).data;
  await surveys.submit(survey.id,{version:1,roofDirection:'S',roofTiltDeg:'18.5',cableDistanceM:'22.00',usableRoofAreaSqm:'30.00'},identity(staff.TECH_A));
  await surveys.approve(survey.id,{version:2},sales);
  const quote = (await quotes.create(enquiry.id,{surveyId:survey.id,packageId:id(1001)},sales)).data;
  await quotes.send(quote.id,{version:1,channel:'PRINT'},sales);
  await quotes.accept(quote.id,{version:2,acceptedByName:'Evidence Customer',channel:'IN_PERSON'},sales);
  const order = (await orders.confirm({quoteId:quote.id},randomUUID(),sales)).data;
  await jobs.schedule(order.jobId,{expectedVersion:1,scheduledStart:'2026-11-03T04:00:00.000Z',scheduledFinish:'2026-11-03T10:00:00.000Z',technicianIds:[staff.TECH_A.id]},sales);
  return {jobId:order.jobId,orderId:order.id,enquiryId:enquiry.id,customerId:customer.id};
}
const attach = (fileId, target, name='TECH_A') => prisma.$transaction(tx=>files.attach(tx,fileId,context(target),identity(staff[name])));
const httpUpload = (target, name='TECH_A') => {
  const form = new FormData(); form.append('file',new Blob([png],{type:'image/png'}),'roof.png');
  form.append('contextType','JOB'); form.append('contextId',target.jobId);
  return fetch(base+'/files',{method:'POST',headers:{origin,cookie:cookies[name]},body:form});
};

test('the production provider enforces every role for upload, download and attachment against a real job', async () => {
  const job = await newJob();
  const bound = (await files.upload(upload(),context(job),identity(staff.TECH_A))).data;
  for (const name of Object.keys(staff)) {
    const actor = identity(staff[name]);
    const canRead = ['ADMIN','SALES','TECH_A'].includes(name), canWrite = ['ADMIN','TECH_A'].includes(name);
    if (canRead) assert.deepEqual((await files.download(bound.id,actor)).buffer,png);
    else await expectCode(files.download(bound.id,actor),403,'FORBIDDEN');
    const orphan = (await files.upload(upload(),{},actor)).data;
    if (canWrite) {
      await files.upload(upload(),context(job),actor); await attach(orphan.id,job,name);
    } else {
      const count = await prisma.file.count(), disk = await readdir(directory);
      await expectCode(files.upload(upload(),context(job),actor),403,'FORBIDDEN');
      await expectCode(attach(orphan.id,job,name),403,'FORBIDDEN');
      assert.equal(await prisma.file.count(),count); assert.deepEqual(await readdir(directory),disk);
      assert.equal((await prisma.file.findUniqueOrThrow({where:{id:orphan.id}})).contextId,null);
    }
  }
});

test('HTTP multipart and download use the wired job adapter, server identity and canonical UUIDs', async () => {
  const job = await newJob();
  const response = await httpUpload({...job,jobId:job.jobId.toUpperCase()}); assert.equal(response.status,201);
  const {data} = await response.json(); assert.equal(data.contextId,job.jobId); assert.equal(data.uploadedById,staff.TECH_A.id);
  for (const name of ['ADMIN','SALES','TECH_A','TECH_B','WAREHOUSE']) {
    const read = await fetch(base+'/files/'+data.id,{headers:{cookie:cookies[name]}});
    assert.equal(read.status,['ADMIN','SALES','TECH_A'].includes(name)?200:403);
    if (read.status===200) assert.deepEqual(Buffer.from(await read.arrayBuffer()),png);
  }
  for (const name of ['SALES','TECH_B','WAREHOUSE']) assert.equal((await httpUpload(job,name)).status,403);
  await prisma.user.update({where:{id:staff.TECH_A.id},data:{active:false}});
  try { assert.equal((await fetch(base+'/files/'+data.id,{headers:{cookie:cookies.TECH_A}})).status,401); }
  finally { await prisma.user.update({where:{id:staff.TECH_A.id},data:{active:true}}); }
});

test('current assignment changes revoke original-uploader access and permit newly assigned crew', async () => {
  const job = await newJob(); const saved = (await files.upload(upload(),context(job),identity(staff.TECH_A))).data;
  const orphan = (await files.upload(upload(),{},identity(staff.TECH_A))).data;
  await jobs.schedule(job.jobId,{expectedVersion:2,scheduledStart:'2026-11-03T04:00:00.000Z',scheduledFinish:'2026-11-03T10:00:00.000Z',technicianIds:[staff.TECH_B.id]},identity(staff.SALES));
  await expectCode(files.download(saved.id,identity(staff.TECH_A)),403,'FORBIDDEN');
  await expectCode(files.upload(upload(),context(job),identity(staff.TECH_A)),403,'FORBIDDEN');
  await expectCode(attach(orphan.id,job),403,'FORBIDDEN');
  assert.deepEqual((await files.download(saved.id,identity(staff.TECH_B))).buffer,png);
  await files.upload(upload(),context(job),identity(staff.TECH_B));
  const assignments = await prisma.jobAssignment.findMany({where:{jobId:job.jobId}});
  assert.ok(assignments.find(row=>row.technicianId===staff.TECH_A.id).removedAt);
});

test('completed jobs freeze new uploads and attachments; existing downloads keep their role rules', async () => {
  const job = await newJob(); const saved = (await files.upload(upload(),context(job),identity(staff.TECH_A))).data;
  const orphan = (await files.upload(upload(),{},identity(staff.TECH_A))).data;
  const adminOrphan = (await files.upload(upload(),{},identity(staff.ADMIN))).data;
  // State fixtures exercise authorization only; this is not evidence that completion is implemented.
  for (const status of ['SCHEDULED','IN_PROGRESS','AWAITING_ACCEPTANCE']) {
    await prisma.job.update({where:{id:job.jobId},data:{status}});
    await files.upload(upload(),context(job),identity(staff.TECH_A));
    const allowed = (await files.upload(upload(),{},identity(staff.TECH_A))).data;
    await attach(allowed.id,job);
  }
  await prisma.job.update({where:{id:job.jobId},data:{status:'COMPLETED'}});
  const count = await prisma.file.count(), disk = await readdir(directory);
  for (const name of ['TECH_A','ADMIN']) {
    await expectCode(files.upload(upload(),context(job),identity(staff[name])),403,'FORBIDDEN');
    await expectCode(attach(name==='ADMIN'?adminOrphan.id:orphan.id,job,name),403,'FORBIDDEN');
  }
  assert.equal(await prisma.file.count(),count); assert.deepEqual(await readdir(directory),disk);
  for (const name of ['TECH_A','ADMIN','SALES']) assert.deepEqual((await files.download(saved.id,identity(staff[name]))).buffer,png);
  await expectCode(files.download(saved.id,identity(staff.TECH_B)),403,'FORBIDDEN');
});

test('missing or inconsistent job/order/quote/enquiry/customer links fail closed, including for admin', async () => {
  const one = await newJob(), two = await newJob();
  await expectCode(files.upload(upload(),{contextType:'JOB',contextId:randomUUID()},identity(staff.ADMIN)),404,'NOT_FOUND');
  const edits = [
    tx=>tx.order.update({where:{id:one.orderId},data:{jobId:null}}),
    tx=>tx.order.update({where:{id:one.orderId},data:{customerId:two.customerId}}),
    tx=>tx.order.update({where:{id:one.orderId},data:{enquiryId:randomUUID()}}),
    tx=>tx.enquiry.update({where:{id:one.enquiryId},data:{customerId:two.customerId}}),
  ];
  // The enquiry source is unique per order; create a real unused enquiry for the mismatch.
  const otherEnquiry = await prisma.enquiry.create({data:{customerId:two.customerId,source:'PHONE',requestedCapacityKw:1,contactName:'Other customer',siteAddressLine:'Elsewhere',siteCity:'Nagpur',sitePincode:'440001'}});
  edits[2] = tx=>tx.order.update({where:{id:one.orderId},data:{enquiryId:otherEnquiry.id}});
  for (const edit of edits) {
    await assert.rejects(prisma.$transaction(async tx=>{
      await edit(tx);
      await access.assertAccess(tx,identity(staff.ADMIN),context(one),'DOWNLOAD');
    }),error=>error.code==='NOT_FOUND');
  }
  assert.equal((await prisma.order.findUniqueOrThrow({where:{id:one.orderId}})).jobId,one.jobId);
});

test('ticket contexts remain unconfigured for every action, without leaking job grants', async () => {
  const target = {contextType:'TICKET',contextId:randomUUID()};
  await expectCode(files.upload(upload(),target,identity(staff.ADMIN)),503,'FILE_AUTHORIZATION_UNAVAILABLE');
  const orphan = (await files.upload(upload(),{},identity(staff.ADMIN))).data;
  await expectCode(prisma.$transaction(tx=>files.attach(tx,orphan.id,target,identity(staff.ADMIN))),503,'FILE_AUTHORIZATION_UNAVAILABLE');
  const testTicketFile = await prisma.file.update({where:{id:orphan.id},data:target});
  await expectCode(files.download(testTicketFile.id,identity(staff.ADMIN)),503,'FILE_AUTHORIZATION_UNAVAILABLE');
});

test('caller rollback and exact association prevent orphan or other-job files from satisfying evidence', async () => {
  const [one,two] = [await newJob(),await newJob()];
  const orphan = (await files.upload(upload(),{},identity(staff.TECH_A))).data;
  await expectCode(prisma.$transaction(tx=>files.requireEvidence(tx,orphan.id,context(one),identity(staff.TECH_A))),409,'EVIDENCE_REQUIRED');
  await assert.rejects(prisma.$transaction(async tx=>{ await files.attach(tx,orphan.id,context(one),identity(staff.TECH_A)); throw Error('late job failure'); }),/late job failure/);
  assert.equal((await prisma.file.findUniqueOrThrow({where:{id:orphan.id}})).contextId,null);
  await attach(orphan.id,one);
  await expectCode(attach(orphan.id,two),409,'FILE_ALREADY_ATTACHED');
  await expectCode(prisma.$transaction(tx=>files.requireEvidence(tx,orphan.id,context(two),identity(staff.TECH_A))),409,'EVIDENCE_REQUIRED');
  await prisma.$transaction(tx=>files.requireEvidence(tx,orphan.id,context(one),identity(staff.TECH_A)));
  const adminOrphan = (await files.upload(upload(),{},identity(staff.TECH_B))).data;
  await expectCode(attach(adminOrphan.id,one,'ADMIN'),403,'FORBIDDEN');
});

test('concurrent claims bind an orphan to one real job only', async () => {
  const targets = [await newJob(),await newJob()]; const orphan = (await files.upload(upload(),{},identity(staff.TECH_A))).data;
  const results = await Promise.allSettled(targets.map(target=>attach(orphan.id,target)));
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(results.find(row=>row.status==='rejected').reason.code,'FILE_ALREADY_ATTACHED');
});

test('an upload waiting behind reassignment rechecks current crew and leaves no metadata or blob', async () => {
  const job = await newJob(); const count = await prisma.file.count(), disk = await readdir(directory);
  await sql.query('BEGIN'); await sql.query('SELECT id FROM jobs WHERE id=$1 FOR NO KEY UPDATE',[job.jobId]);
  const pending = files.upload(upload(),context(job),identity(staff.TECH_A)).then(value=>({value}),error=>({error}));
  try {
    await new Promise(resolve=>setTimeout(resolve,50));
    await sql.query('UPDATE job_assignments SET "removedAt"=clock_timestamp() WHERE "jobId"=$1',[job.jobId]);
  } finally { await sql.query('COMMIT'); }
  const result = await pending; assert.equal(result.error?.code,'FORBIDDEN');
  assert.equal(await prisma.file.count(),count); assert.deepEqual(await readdir(directory),disk);
});

test('attachment takes the job before the file, avoiding a cycle with field commands', async () => {
  const job = await newJob(); const orphan = (await files.upload(upload(),{},identity(staff.TECH_A))).data;
  let entered; const waiting = new Promise(resolve=>{entered=resolve;});
  const guarded = new FilesService(prisma,store,{assertAccess:(...args)=>{entered();return access.assertAccess(...args);}});
  await sql.query('BEGIN'); await sql.query("SET LOCAL lock_timeout = '500ms'");
  await sql.query('SELECT id FROM jobs WHERE id=$1 FOR NO KEY UPDATE',[job.jobId]);
  const pending = prisma.$transaction(tx=>guarded.attach(tx,orphan.id,context(job),identity(staff.TECH_A))).then(value=>({value}),error=>({error}));
  try { await waiting; await sql.query('SELECT id FROM files WHERE id=$1 FOR UPDATE',[orphan.id]); }
  finally { await sql.query('ROLLBACK'); }
  const result = await pending; assert.ifError(result.error); assert.equal(result.value.contextId,job.jobId);
});

test('bound private-byte preflight refuses missing/altered blobs and current access is repeated for evidence', async () => {
  const job = await newJob();
  for (const change of ['missing','altered']) {
    const saved = (await files.upload(upload(),context(job),identity(staff.TECH_A))).data;
    const row = await prisma.file.findUniqueOrThrow({where:{id:saved.id}});
    if (change==='missing') await unlink(resolve(directory,row.storageKey)); else await writeFile(resolve(directory,row.storageKey),Buffer.alloc(png.length));
    await expectCode(files.download(saved.id,identity(staff.TECH_A)),503,'FILE_UNAVAILABLE');
  }
  const saved = (await files.upload(upload(),context(job),identity(staff.TECH_A))).data;
  await jobs.schedule(job.jobId,{expectedVersion:2,scheduledStart:'2026-11-03T04:00:00.000Z',scheduledFinish:'2026-11-03T10:00:00.000Z',technicianIds:[staff.TECH_B.id]},identity(staff.SALES));
  await expectCode(prisma.$transaction(tx=>files.requireEvidence(tx,saved.id,context(job),identity(staff.TECH_A))),403,'FORBIDDEN');
});
