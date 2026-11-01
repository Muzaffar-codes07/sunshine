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
process.env.DATABASE_URL=db; process.env.SESSION_SECRET='ticket-tests-only-session-secret-long-value';
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
const {seedWarrantyPolicies}=require('../dist/warranty/seed-warranty-policies');
const {TicketCommandsService}=require('../dist/service/ticket-commands.service');
const {RepairBillingService}=require('../dist/service/repair-billing.service');
let app,base,prisma,sql,directory,main,completeRealInstallation;
const staff={},cookies={},origin='http://127.0.0.1:3001',password='ticket-test-only-password';
const actor=role=>({id:staff[role].id,email:staff[role].email,displayName:staff[role].displayName,role});
const send=(path,body,key=randomUUID(),role='ADMIN')=>fetch(base+path,{method:'POST',headers:{origin,'content-type':'application/json',...(key?{'idempotency-key':key}:{}),...(role?{cookie:cookies[role]}:{})},body:JSON.stringify(body)});
const get=(path,role='ADMIN',extra={})=>fetch(base+path,{headers:{...(role?{cookie:cookies[role]}:{}),...extra}});
const ok=async(pending,status=200)=>{const response=await pending,body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body.data;};
const refused=async(pending,status,code)=>{const response=await pending,body=await response.json();assert.equal(response.status,status,JSON.stringify(body));assert.equal(body.error.code,code);};
before(async()=>{
  const parent=resolve(import.meta.dirname,'../../../var');await mkdir(parent,{recursive:true});directory=await mkdtemp(resolve(parent,'ticket-test-'));process.env.UPLOAD_DIR=directory;
  app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api/v1');app.useGlobalFilters(new ApiExceptionFilter());await app.listen(0,'127.0.0.1');
  base=(await app.getUrl())+'/api/v1';prisma=app.get(PrismaService);await seedCatalogue(prisma);await seedWarrantyPolicies(prisma);
  sql=new Client({connectionString:db});await sql.connect();
  for(const role of ['ADMIN','SALES','TECHNICIAN','WAREHOUSE','SUPPORT']){
    staff[role]=await prisma.user.create({data:{email:randomUUID()+'@ticket.test',displayName:role+' labour test',role,passwordHash:await hashPassword(password)}});
    const response=await fetch(base+'/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:staff[role].email,password})});
    assert.equal(response.status,200);cookies[role]=response.headers.get('set-cookie').split(';')[0];
  }
  main=await prisma.stockLocation.findUniqueOrThrow({where:{code:'MAIN'}});
  completeRealInstallation=installationFixture({app,prisma,staff,main,send,ok,actor});
});
after(async()=>{await sql?.end();await app?.close();await rm(directory,{recursive:true,force:true});});
const version=async jobId=>(await prisma.job.findUniqueOrThrow({where:{id:jobId}})).version;

async function newTicket(role='SUPPORT') {
  const time=await completeRealInstallation();
  const allocation=await prisma.allocation.findFirstOrThrow({where:{jobId:time.jobId,product:{category:'INVERTER'}},include:{unit:true}});
  const ticket=await ok(send('/tickets',{unitId:allocation.unitId,faultDescription:'Explicit synthetic service complaint'},randomUUID(),role),201);
  return {ticket,unit:allocation.unit,time};
}
const assess=(ticket,scope='Component replacement',key=randomUUID(),role='SUPPORT')=>send(`/tickets/${ticket.id}/assess`,{
  version:ticket.version,asOfDate:ticket.createdAt,requestedScope:scope},key,role);
async function actorSql(work) {
  await sql.query('BEGIN');
  try {await sql.query("SELECT set_config('sunshine.actor_id',$1,true)",[staff.ADMIN.id]);return await work();}
  finally {await sql.query('ROLLBACK');}
}

test('real staff roles and idempotency headers protect every ticket action before source reads',async()=>{
  const body={unitId:randomUUID(),faultDescription:'Fixture fault'};
  assert.equal((await send('/tickets',body,randomUUID(),null)).status,401);
  assert.equal((await fetch(base+'/tickets',{method:'POST',headers:{origin,'content-type':'application/json','x-role':'ADMIN'},body:JSON.stringify(body)})).status,401);
  for(const role of ['SALES','WAREHOUSE','TECHNICIAN']){
    assert.equal((await send('/tickets',body,randomUUID(),role)).status,403);
    assert.equal((await send(`/tickets/${randomUUID()}/assess`,{version:1,asOfDate:new Date().toISOString(),requestedScope:'Labour'},randomUUID(),role)).status,403);
  }
  assert.equal((await send('/tickets',body,null,'SUPPORT')).status,400);
  assert.equal((await send('/tickets',{...body,customerId:randomUUID()},randomUUID(),'SUPPORT')).status,400);
  assert.equal((await send('/tickets',body,randomUUID(),'SUPPORT')).status,404);
});

test('concurrent intake retries create one verified ticket/event; separate faults remain separate and UUID reads are canonical',async()=>{
  const time=await completeRealInstallation();
  const unit=(await prisma.allocation.findFirstOrThrow({where:{jobId:time.jobId,unitId:{not:null}},include:{unit:true}})).unit;
  const key=randomUUID(),body={unitId:unit.id.toUpperCase(),faultDescription:'Duplicate-intent regression fixture'};
  const responses=await Promise.all([send('/tickets',body,key,'SUPPORT'),send('/tickets',{...body,unitId:unit.id},key,'SUPPORT')]);
  const a=await ok(responses[0],201),b=await ok(responses[1],201);assert.deepEqual(a,b);assert.equal(a.sourceVerified,true);
  assert.equal(a.jobId,time.jobId);assert.equal(a.unitId,unit.id);assert.equal(a.status,'OPEN');assert.equal(a.billingFinalized,false);
  assert.equal(await prisma.serviceTicketEvent.count({where:{ticketId:a.id}}),1);
  assert.equal((await prisma.serviceTicket.findUniqueOrThrow({where:{id:a.id}})).createdById,staff.SUPPORT.id);
  assert.deepEqual(await ok(get('/tickets/'+a.id.toUpperCase(),'SUPPORT')),a);
  const list=await ok(get('/tickets?unitId='+unit.id.toUpperCase(),'SUPPORT'));assert.ok(list.items.some(row=>row.id===a.id));
  await refused(send('/tickets',{...body,faultDescription:'Changed intake'},key,'SUPPORT'),409,'IDEMPOTENCY_CONFLICT');
  const other=await ok(send('/tickets',{...body,faultDescription:'A separate independent fault'},randomUUID(),'SUPPORT'),201);assert.notEqual(other.id,a.id);
  const spare=await ok(send('/stock/receipts',{reference:'TICKET-SPARE-'+randomUUID(),locationId:main.id,receivedAt:new Date().toISOString(),lines:[{
    productId:unit.productId,quantity:'1',unitCost:'10.00',serials:['SPARE-'+randomUUID()]}]}),201);
  await refused(send('/tickets',{unitId:spare.lines[0].unitIds[0],faultDescription:'Uninstalled fixture'},randomUUID(),'SUPPORT'),409,'INSTALLATION_REQUIRED');
  const badId=randomUUID();
  await assert.rejects(actorSql(()=>sql.query(`INSERT INTO service_tickets(id,"ticketNumber","customerId","jobId","unitId","faultDescription","updatedAt")
    VALUES($1,$2,$3,$4,$5,'Wrong customer fixture',now())`,[badId,'BAD-'+badId,randomUUID(),time.jobId,unit.id])),error=>error.code==='23514'&&error.constraint==='ticket_guard');
  assert.equal(await prisma.serviceTicket.count({where:{id:badId}}),0);
});

test('assessments use the immutable complaint occurrence, preserve wrong-scope history, and reject stale concurrent decisions',async()=>{
  let {ticket}=await newTicket();
  await refused(send(`/tickets/${ticket.id}/assess`,{version:1,asOfDate:new Date(Date.parse(ticket.createdAt)-86400000).toISOString(),requestedScope:'Component replacement'},randomUUID(),'SUPPORT'),400,'INVALID_INPUT');
  const wrong=await ok(assess(ticket,'Labour'));assert.equal(wrong.assessmentSnapshot.coverageStatus,'OUT_OF_SCOPE');assert.equal(wrong.version,2);
  const key=randomUUID(),covered=await ok(assess(wrong,'Component replacement',key));
  assert.equal(covered.assessmentSnapshot.coverageStatus,'COVERED');assert.equal(covered.assessmentSnapshot.asOfDate,new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ticket.createdAt)));
  assert.deepEqual(await ok(assess(wrong,'Component replacement',key)),covered);
  let events=await prisma.serviceTicketEvent.findMany({where:{ticketId:ticket.id},orderBy:{occurredAt:'asc'}});
  assert.equal(events.length,3);assert.equal(events[2].beforeSnapshot.assessmentSnapshot.coverageStatus,'OUT_OF_SCOPE');assert.equal(events[2].afterSnapshot.assessmentSnapshot.coverageStatus,'COVERED');
  const history=await ok(get(`/tickets/${ticket.id.toUpperCase()}/events?pageSize=2`,'SUPPORT'));assert.equal(history.total,3);assert.equal(history.items.length,2);
  assert.equal(history.items[0].assessment.coverageStatus,'COVERED');assert.equal(history.items[0].previousAssessment.coverageStatus,'OUT_OF_SCOPE');
  assert.equal('billingSnapshot' in history.items[0],false);
  assert.equal((await get(`/tickets/${ticket.id}/events`,'SALES')).status,403);
  const races=await Promise.all([assess(covered,'Labour'),assess(covered,'Component replacement')]);
  assert.deepEqual(races.map(response=>response.status).sort(),[200,409]);
  ticket=await ok(get('/tickets/'+ticket.id,'SUPPORT'));assert.equal(ticket.version,4);
  assert.equal(await prisma.serviceTicketEvent.count({where:{ticketId:ticket.id}}),4);
  await assert.rejects(actorSql(()=>sql.query('UPDATE service_tickets SET status=$1,version=version+1 WHERE id=$2',['OPEN',ticket.id])),error=>error.code==='23514');
});

test('unbilled work cannot resolve; an explicit no-work resolution closes only after actual customer confirmation',async()=>{
  let {ticket}=await newTicket();ticket=await ok(assess(ticket));
  const costs=await prisma.costEntry.count({where:{jobId:ticket.jobId}});
  await refused(send(`/tickets/${ticket.id}/resolve`,{version:ticket.version,resolutionDetails:'Work not yet finalized'},randomUUID(),'SUPPORT'),409,'REPAIR_BILLING_REQUIRED');
  const resolveKey=randomUUID(),resolution={version:ticket.version,resolutionDetails:'Synthetic customer withdrew duplicate complaint before work.',
    noWorkReason:'Complaint withdrawn before any labour, parts or replacement.'};
  ticket=await ok(send(`/tickets/${ticket.id}/resolve`,resolution,resolveKey,'SUPPORT'));
  assert.deepEqual(await ok(send(`/tickets/${ticket.id}/resolve`,resolution,resolveKey,'SUPPORT')),ticket);
  await refused(send(`/tickets/${ticket.id}/resolve`,{...resolution,resolutionDetails:'Changed resolution intent'},resolveKey,'SUPPORT'),409,'IDEMPOTENCY_CONFLICT');
  assert.equal(ticket.status,'AWAITING_CUSTOMER_CONFIRMATION');assert.equal(ticket.billingFinalized,false);assert.ok(ticket.noWorkReason);
  await refused(send(`/tickets/${ticket.id}/confirm`,{version:ticket.version,confirmerName:'Fixture Customer',channel:'PHONE',confirmedAt:new Date(Date.parse(ticket.resolvedAt)-1).toISOString()},randomUUID(),'SUPPORT'),400,'INVALID_INPUT');
  const key=randomUUID(),input={version:ticket.version,confirmerName:'Fixture Customer',channel:'PHONE',confirmedAt:new Date().toISOString(),notes:'Explicit synthetic confirmation, no message sent'};
  const closed=await ok(send(`/tickets/${ticket.id}/confirm`,input,key,'SUPPORT'));assert.equal(closed.status,'CLOSED');assert.equal(closed.confirmation.confirmerName,input.confirmerName);
  assert.deepEqual(await ok(send(`/tickets/${ticket.id}/confirm`,input,key,'SUPPORT')),closed);
  assert.equal(await prisma.invoice.count({where:{sourceType:'TICKET',sourceId:ticket.id}}),0);
  assert.equal(await prisma.costEntry.count({where:{jobId:ticket.jobId}}),costs);
  assert.equal(await prisma.serviceTicketEvent.count({where:{ticketId:ticket.id}}),4);
  await assert.rejects(actorSql(()=>sql.query('UPDATE service_tickets SET "confirmedBy"=$1,version=version+1 WHERE id=$2',['Another name',ticket.id])),error=>error.code==='23514');
  await assert.rejects(sql.query('DELETE FROM service_tickets WHERE id=$1',[ticket.id]),error=>error.code==='23514');
  await assert.rejects(sql.query('TRUNCATE service_tickets CASCADE'),error=>error.code==='23514');
});

test('existing work lines prevent scope rewrites and no-work bypass, and service audit remains append-only',async()=>{
  let {ticket}=await newTicket();ticket=await ok(assess(ticket));
  await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('sunshine.actor_id',${staff.ADMIN.id},true)`;
    await tx.ticketLine.create({data:{ticketId:ticket.id,lineType:'LABOUR',description:'Explicit pending work obligation fixture',quantity:'1.000',unitCost:'1.00',totalCost:'1.00',billableToCustomer:false}});});
  await refused(assess(ticket,'Labour'),409,'REASSESSMENT_LOCKED');
  await refused(send(`/tickets/${ticket.id}/resolve`,{version:ticket.version,resolutionDetails:'Must not hide actual work',noWorkReason:'Incorrect no-work attempt'},randomUUID(),'SUPPORT'),409,'REPAIR_BILLING_REQUIRED');
  assert.equal((await ok(get('/tickets/'+ticket.id,'SUPPORT'))).status,'ASSESSED');
  await assert.rejects(sql.query('UPDATE service_ticket_events SET "afterSnapshot"=$1 WHERE "ticketId"=$2',['{}',ticket.id]),error=>error.code==='23514');
  await assert.rejects(sql.query('TRUNCATE service_ticket_events'),error=>error.code==='23514');
  // Only this approved-source projection is synthetic; assessment, ticket locks, costs,
  // lines, billing snapshots and both competing PostgreSQL transactions are real.
  const {ticket:intake}=await newTicket(),current=await ok(assess(intake)),sourceId=randomUUID();
  const billing=new RepairBillingService(app.get(CostWriterService),{read:async()=>[{
    sourceId,type:'LABOUR',ticketId:current.id,jobId:current.jobId,customerId:current.customerId,
    scope:'Component replacement',description:'Synthetic approved-source scope-race boundary',quantity:'1.000',unitCost:'1.00',unitPrice:'2.00',occurredAt:new Date().toISOString(),
  }]},app.get(InvoicesService));
  const results=await Promise.allSettled([
    app.get(TicketCommandsService).assess(actor('SUPPORT'),randomUUID(),current.id,{version:current.version,asOfDate:current.createdAt,requestedScope:'Labour'}),
    prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('sunshine.actor_id',${staff.ADMIN.id},true)`;
      return billing.executeRepairBilling(tx,current.id,[{type:'LABOUR',sourceId}]);}),
  ]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1,'scope rewrite and billing in the old scope cannot both commit');
  const saved=await prisma.serviceTicket.findUniqueOrThrow({where:{id:current.id}}),billed=results[1].status==='fulfilled';
  assert.equal(saved.status,billed?'IN_PROGRESS':'ASSESSED');
  assert.equal(await prisma.ticketLine.count({where:{ticketId:current.id}}),billed?1:0);
  assert.equal(await prisma.costEntry.count({where:{uniqueSourceId:'TIME_ENTRY:'+sourceId}}),billed?1:0);
  assert.equal(await prisma.invoice.count({where:{sourceType:'TICKET',sourceId:current.id}}),0);
  if(!billed) assert.equal(saved.assessmentSnapshot.coverageStatus,'OUT_OF_SCOPE');
});

test('a caller failure after ticket/event insertion rolls back both effects and its command, allowing the same key retry',async()=>{
  const time=await completeRealInstallation(),unit=(await prisma.allocation.findFirstOrThrow({where:{jobId:time.jobId,unitId:{not:null}}})).unitId;
  const key=randomUUID(),input={unitId:unit,faultDescription:'Late failure regression fixture'},commands=app.get(IdempotencyService),run=commands.run.bind(commands);
  const before=await prisma.serviceTicket.count(),events=await prisma.serviceTicketEvent.count();
  commands.run=(command,work)=>run(command,async tx=>{await work(tx);throw Error('late ticket failure');});
  try{await assert.rejects(app.get(TicketCommandsService).create(actor('ADMIN'),key,input),/late ticket failure/);}finally{commands.run=run;}
  assert.equal(await prisma.serviceTicket.count(),before);assert.equal(await prisma.serviceTicketEvent.count(),events);
  assert.equal(await prisma.command.count({where:{actorId:staff.ADMIN.id,idempotencyKey:key}}),0);
  const saved=await ok(send('/tickets',input,key),201);assert.equal(saved.sourceVerified,true);
  assert.equal(await prisma.serviceTicketEvent.count({where:{ticketId:saved.id}}),1);
});

test('audit occurrence follows saved decisions when an earlier transaction acquires its ticket lock later',async()=>{
  const {ticket}=await newTicket(),idempotency=app.get(IdempotencyService),run=idempotency.run.bind(idempotency),commands=app.get(TicketCommandsService);
  const earlierKey=randomUUID();let release,entered;
  const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{entered=resolve;});
  // Gate only the real caller transaction before its ticket lock. All domain reads/writes remain real.
  idempotency.run=(command,work)=>run(command,async tx=>{
    if(command.key===earlierKey){entered();await gate;}return work(tx);
  });
  let queued;
  try{
    queued=commands.assess(actor('ADMIN'),earlierKey,ticket.id,{version:2,asOfDate:ticket.createdAt,requestedScope:'Component replacement'});
    await ready;
    const first=(await commands.assess(actor('ADMIN'),randomUUID(),ticket.id,{version:1,asOfDate:ticket.createdAt,requestedScope:'Labour'})).data;
    assert.equal(first.version,2);release();
    const last=(await queued).data;assert.equal(last.version,3);
    const history=await ok(get(`/tickets/${ticket.id}/events`,'SUPPORT'));
    assert.equal(history.items[0].assessment.coverageStatus,'COVERED');
    assert.equal(history.items[0].previousAssessment.coverageStatus,'OUT_OF_SCOPE');
  } finally {release();idempotency.run=run;await queued?.catch(()=>{});}
});
