// Real source workflow; explicit disposable DB and owned upload directory only.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { installationFixture } from './helpers/installation-source.mjs';
const require=createRequire(import.meta.url), db=process.env.TEST_DATABASE_URL;
if(!db || !new URL(db).pathname.endsWith('_test')) throw Error('Explicit disposable _test database required');
process.env.DATABASE_URL=db; process.env.SESSION_SECRET='labour-tests-only-session-secret-long-value';
process.env.AUTH_TRUSTED_ORIGINS='http://127.0.0.1:3001';process.env.SESSION_COOKIE_SECURE='false';
const {NestFactory}=require('@nestjs/core'),{AppModule}=require('../dist/app.module');
const {ApiExceptionFilter}=require('../dist/platform/api-exception.filter'),{PrismaService}=require('../dist/platform/prisma.service');
const {seedCatalogue}=require('../dist/catalog/seed-catalogue'),{catalogueDemoId:id}=require('../dist/catalog/demo-catalogue');
const {SurveysService}=require('../dist/sales/surveys.service'),{QuotesService}=require('../dist/quotes/quotes.service');
const {OrdersService}=require('../dist/orders/orders.service'),{InvoicesService}=require('../dist/finance/invoices.service');
const {IdempotencyService}=require('../dist/platform/idempotency'),{JobsService}=require('../dist/field/jobs.service');
const {InstallationService}=require('../dist/field/installation.service'),{FilesService}=require('../dist/files/files.service');
const {LabourService}=require('../dist/labour/labour.service'),{CostWriterService}=require('../dist/finance/cost-writer.service');
const {ReportingService}=require('../dist/reporting/reporting.service'),{hashPassword}=require('../dist/auth/passwords');
const {Client}=require('pg');
let app,base,prisma,sql,directory,main,completeRealInstallation;
const staff={},cookies={},origin='http://127.0.0.1:3001',password='labour-test-only-password';
const actor=role=>({id:staff[role].id,email:staff[role].email,displayName:staff[role].displayName,role});
const send=(path,body,key=randomUUID(),role='ADMIN')=>fetch(base+path,{method:'POST',headers:{origin,'content-type':'application/json',...(key?{'idempotency-key':key}:{}),...(role?{cookie:cookies[role]}:{})},body:JSON.stringify(body)});
const get=(path,role='ADMIN',extra={})=>fetch(base+path,{headers:{...(role?{cookie:cookies[role]}:{}),...extra}});
const ok=async(pending,status=200)=>{const response=await pending,body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body.data;};
const refused=async(pending,status,code)=>{const response=await pending,body=await response.json();assert.equal(response.status,status,JSON.stringify(body));assert.equal(body.error.code,code);};
before(async()=>{
  const parent=resolve(import.meta.dirname,'../../../var');await mkdir(parent,{recursive:true});directory=await mkdtemp(resolve(parent,'labour-test-'));process.env.UPLOAD_DIR=directory;
  app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api/v1');app.useGlobalFilters(new ApiExceptionFilter());await app.listen(0,'127.0.0.1');
  base=(await app.getUrl())+'/api/v1';prisma=app.get(PrismaService);await seedCatalogue(prisma);
  sql=new Client({connectionString:db});await sql.connect();
  for(const role of ['ADMIN','SALES','TECHNICIAN','WAREHOUSE','SUPPORT']){
    staff[role]=await prisma.user.create({data:{email:randomUUID()+'@labour.test',displayName:role+' labour test',role,passwordHash:await hashPassword(password)}});
    const response=await fetch(base+'/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:staff[role].email,password})});
    assert.equal(response.status,200);cookies[role]=response.headers.get('set-cookie').split(';')[0];
  }
  main=await prisma.stockLocation.findUniqueOrThrow({where:{code:'MAIN'}});
  completeRealInstallation=installationFixture({app,prisma,staff,main,send,ok,actor});
});
after(async()=>{await sql?.end();await app?.close();await rm(directory,{recursive:true,force:true});});
const version=async jobId=>(await prisma.job.findUniqueOrThrow({where:{id:jobId}})).version;
const createRate=(hourlyRate='100.00',technicianId=staff.TECHNICIAN.id,key=randomUUID())=>ok(send('/technician-rates',{technicianId,hourlyRate,reference:'Explicit fictional test rate approval'},key),201);

test('rate and approval APIs enforce real ADMIN access, strict inputs, bounded lists and revoked sessions',async()=>{
  assert.equal((await get('/time-entries',null,{'x-role':'ADMIN'})).status,401);
  for(const role of ['SALES','TECHNICIAN','WAREHOUSE','SUPPORT']){
    assert.equal((await get('/time-entries',role)).status,403);
    assert.equal((await send('/technician-rates',{technicianId:staff.TECHNICIAN.id,hourlyRate:'1.00',reference:'Fixture'},randomUUID(),role)).status,403);
  }
  assert.equal((await get('/time-entries?pageSize=1000')).status,400);
  assert.equal((await send('/technician-rates',{technicianId:staff.TECHNICIAN.id,hourlyRate:'-1',reference:'Fixture'})).status,400);
  assert.equal((await send('/technician-rates',{technicianId:staff.TECHNICIAN.id,hourlyRate:'1',reference:'Fixture'},null)).status,400);
  await refused(send('/technician-rates',{technicianId:staff.SALES.id,hourlyRate:'1.00',reference:'Wrong role fixture'}),409,'RATE_TECHNICIAN_INVALID');
});

test('a real completed installation approves one frozen source cost, replays exact retries, and reconciles pay/profit/CSV',async()=>{
  const row=await completeRealInstallation(),rate=await createRate('36000.00');
  const initial=await app.get(ReportingService).getJobProfitability(row.jobId);assert.equal(initial.isProvisional,true);
  const before=new Date(),key=randomUUID(),input={rateRevisionId:rate.id.toUpperCase(),note:'Approved actual recorded installation work'};
  const results=await Promise.all([send(`/time-entries/${row.id.toUpperCase()}/approve`,input,key),send(`/time-entries/${row.id}/approve`,{...input,rateRevisionId:rate.id},key)]);
  const a=await ok(results[0],201),b=await ok(results[1],201);assert.deepEqual(a,b);
  const elapsed=BigInt(row.finishedAt.getTime()-row.startedAt.getTime()),cents=(elapsed*3600000n+1800000n)/3600000n;
  assert.equal(a.approval.elapsedMs,elapsed.toString());assert.equal(a.approval.amount,`${cents/100n}.${String(cents%100n).padStart(2,'0')}`);
  assert.deepEqual(await ok(get(`/time-entries/${row.id}`)),a);
  assert.equal(await prisma.costEntry.count({where:{uniqueSourceId:'TIME_RECORD:'+row.id,costType:'INSTALLATION_LABOUR'}}),1);
  await refused(send(`/time-entries/${row.id}/approve`,{...input,note:'Changed payload'},key),409,'IDEMPOTENCY_CONFLICT');
  const newer=await createRate('1.00');
  await refused(send(`/time-entries/${row.id}/approve`,{rateRevisionId:newer.id,note:input.note}),409,'TIME_ALREADY_APPROVED');
  const reporting=app.get(ReportingService);
  assert.equal((await reporting.getJobProfitability(row.jobId,before)).isProvisional,true,'approval not known at older cutoff');
  const profit=await reporting.getJobProfitability(row.jobId);assert.equal(profit.isCompleted,true);
  assert.equal(profit.costBreakdown.installationLabour,a.approval.amount);
  const pay=await ok(get('/reports/pay-summary?period=today'));assert.equal(pay.scope,'INSTALLATION_ONLY');
  assert.equal(pay.technicians.find(item=>item.technicianId===row.technicianId).totalPay,a.approval.amount);
  const csv=await get('/reports/export.csv?report=pay&period=today');assert.equal(csv.status,200);const text=await csv.text();assert.ok(text.includes('"INSTALLATION_ONLY"'));assert.ok(text.includes(`"${a.approval.amount}"`));
  const original=await prisma.costEntry.findUniqueOrThrow({where:{id:a.approval.costEntryId}});
  await prisma.$transaction(tx=>app.get(CostWriterService).postCost(tx,{uniqueSourceId:'REVERSAL:'+original.id,reversalOfId:original.id,jobId:row.jobId,costType:'INSTALLATION_LABOUR',amount:'-'+a.approval.amount,occurredAt:new Date().toISOString(),description:'Explicit test correction obligation'}));
  assert.equal((await reporting.getJobProfitability(row.jobId)).isProvisional,true,'a reversed cost cannot be final profit until reconciled');
});

test('changed-key approval races have one winner; a late failure rolls back cost, approval and command',async()=>{
  const row=await completeRealInstallation(),first=await createRate('11.11'),second=await createRate('22.22');
  const key=randomUUID(),input={rateRevisionId:first.id,note:'Atomic actual work approval'};
  const costs=app.get(CostWriterService),saved=costs.postCost.bind(costs);
  costs.postCost=async(tx,data)=>{await saved(tx,data);throw Error('late approval failure');};
  try{await assert.rejects(app.get(LabourService).approve(staff.ADMIN.id,key,row.id,input),/late approval failure/);}finally{costs.postCost=saved;}
  assert.equal(await prisma.command.count({where:{actorId:staff.ADMIN.id,idempotencyKey:key}}),0);
  assert.equal(await prisma.installationLabourApproval.count({where:{timeRecordId:row.id}}),0);
  assert.equal(await prisma.costEntry.count({where:{uniqueSourceId:'TIME_RECORD:'+row.id}}),0);
  const responses=await Promise.all([send(`/time-entries/${row.id}/approve`,input,key),send(`/time-entries/${row.id}/approve`,{...input,rateRevisionId:second.id})]);
  assert.deepEqual(responses.map(response=>response.status).sort(),[201,409]);
  assert.equal(await prisma.installationLabourApproval.count({where:{timeRecordId:row.id}}),1);
  assert.equal(await prisma.costEntry.count({where:{uniqueSourceId:'TIME_RECORD:'+row.id}}),1);
});

test('rate/time facts cannot be edited, deleted or truncated; wrong-source SQL insert rolls back',async()=>{
  const rate=await createRate('0.00');
  for(const statement of ['UPDATE technician_rate_revisions SET "hourlyRate"=100 WHERE id=$1','DELETE FROM technician_rate_revisions WHERE id=$1']) await assert.rejects(sql.query(statement,[rate.id]),error=>error.code==='23514');
  await assert.rejects(sql.query('TRUNCATE technician_rate_revisions CASCADE'),error=>error.code==='23514');
  const approval=await prisma.installationLabourApproval.findFirstOrThrow();
  await assert.rejects(sql.query('UPDATE installation_labour_approvals SET note=$1 WHERE "timeRecordId"=$2',['Changed note',approval.timeRecordId]),error=>error.code==='23514');
  await assert.rejects(sql.query('DELETE FROM installation_labour_approvals WHERE "timeRecordId"=$1',[approval.timeRecordId]),error=>error.code==='23514');
  await assert.rejects(sql.query('TRUNCATE installation_labour_approvals'),error=>error.code==='23514');
  const row=await completeRealInstallation();
  await assert.rejects(sql.query(`INSERT INTO installation_labour_approvals
    ("timeRecordId","rateRevisionId","costEntryId","elapsedMs",hours,"hourlyRate",amount,"approvedById",note)
    VALUES($1,$2,$3,1,0,0,0,$4,'Deliberately wrong source')`,[row.id,rate.id,approval.costEntryId,staff.ADMIN.id]),error=>error.code==='23514' && error.constraint==='labour_check_source');
  const outsider=await prisma.user.create({data:{email:randomUUID()+'@labour.test',displayName:'Unassigned fixture technician',role:'TECHNICIAN',passwordHash:'not-a-login-hash'}});
  // Explicit corrupt historical-time fixture: no application route accepts a client-owned job/time link.
  let badTime;
  await sql.query('ALTER TABLE installation_time_records DISABLE TRIGGER installation_time_records_check_insert');
  try { badTime=await prisma.installationTimeRecord.create({data:{jobId:row.jobId,technicianId:outsider.id,recordedById:staff.ADMIN.id,
    startedAt:new Date(Date.now()-7200000),finishedAt:new Date(Date.now()-3600000)}}); }
  finally { await sql.query('ALTER TABLE installation_time_records ENABLE TRIGGER installation_time_records_check_insert'); }
  const outsiderRate=await createRate('1.00',outsider.id),badKey=randomUUID();
  await refused(send(`/time-entries/${badTime.id}/approve`,{rateRevisionId:outsiderRate.id,note:'Must refuse an unassigned out-of-job interval'},badKey),409,'LABOUR_EVIDENCE_INVALID');
  assert.equal(await prisma.costEntry.count({where:{uniqueSourceId:'TIME_RECORD:'+badTime.id}}),0);
  assert.equal(await prisma.command.count({where:{actorId:staff.ADMIN.id,idempotencyKey:badKey}}),0);
  await prisma.user.update({where:{id:staff.ADMIN.id},data:{active:false}});
  assert.equal((await get('/time-entries')).status,401);
  assert.equal((await get('/reports/pay-summary')).status,401);
});
