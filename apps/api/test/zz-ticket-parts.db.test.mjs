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


const partPath=ticket=>`/tickets/${ticket.id}/parts`;
async function prepared(){const state=await newTicket();state.ticket=await ok(assess(state.ticket));return state;}
const request=(ticket,productId,extra={})=>({version:ticket.version,productId,quantity:'1.000',scope:'Component replacement',reason:'Explicit synthetic requirement for assessed component work',...extra});
const actorWork=work=>prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('sunshine.actor_id',${staff.ADMIN.id},true)`;return work(tx);});

test('part requirements enforce actual ADMIN sessions, strict source inputs, immutable scope and serialized quantity',async()=>{
 const {ticket,unit}=await prepared(),input=request(ticket,unit.productId);
 assert.equal((await send(partPath(ticket),input,randomUUID(),null)).status,401);
 for(const role of ['SUPPORT','SALES','WAREHOUSE','TECHNICIAN']){
  assert.equal((await send(partPath(ticket),input,randomUUID(),role)).status,403);
  assert.equal((await get(partPath(ticket),role)).status,403);
 }
 await refused(send(partPath(ticket),{...input,unitCost:'0'}),400,'INVALID_INPUT');
 await refused(send(partPath(ticket),{...input,quantity:'2.000'}),400,'INVALID_INPUT');
 await refused(send(partPath(ticket),{...input,scope:'Unrelated labour'}),409,'REPAIR_SCOPE_CONFLICT');
 await refused(send(partPath(ticket),{...input,productId:randomUUID()}),409,'PART_PRODUCT_INVALID');
 const service=await prisma.product.findFirstOrThrow({where:{kind:'SERVICE'}});
 await refused(send(partPath(ticket),{...input,productId:service.id}),409,'PART_PRODUCT_INVALID');
 await refused(send(partPath(ticket),{...input,version:ticket.version-1}),409,'STALE_VERSION');
 assert.equal((await get(partPath(ticket)+'?page=0')).status,400);
 assert.equal((await get(`/tickets/${randomUUID()}/parts`)).status,404);
});

test('identical concurrent requirements replay one Product/quantity/price source and never reserve, consume or expense stock',async()=>{
 const {ticket,unit}=await prepared(),input=request(ticket,unit.productId),key=randomUUID();
 const before={costs:await prisma.costEntry.count(),moves:await prisma.stockMovement.count(),allocations:await prisma.allocation.count()};
 const results=await Promise.all([send(partPath(ticket),input,key),send(`/tickets/${ticket.id.toUpperCase()}/parts`,{...input,productId:unit.productId.toUpperCase(),quantity:'1'},key)]);
 const saved=await ok(results[0],201);assert.deepEqual(await ok(results[1],201),saved);
 assert.equal(saved.part.phase,'PLANNED');assert.equal(saved.part.product.id,unit.productId);assert.equal(saved.part.quantity,'1.000');
 assert.equal(saved.part.unitCost,null);assert.equal(saved.part.totalCost,null);assert.equal(saved.part.createdById,staff.ADMIN.id);
 assert.equal(saved.ticketVersion,ticket.version+1);assert.equal(saved.part.billableToCustomer,false);
 assert.equal(await prisma.ticketLine.count({where:{ticketId:ticket.id}}),1);
 assert.deepEqual({costs:await prisma.costEntry.count(),moves:await prisma.stockMovement.count(),allocations:await prisma.allocation.count()},before);
 const product=await prisma.product.findUniqueOrThrow({where:{id:unit.productId}}),price=saved.part.unitPrice;
 try{
  await prisma.product.update({where:{id:product.id},data:{unitSalePrice:product.unitSalePrice.add('1.00')}});
  assert.deepEqual(await ok(send(partPath(ticket),input,key),201),saved);
  assert.equal((await ok(get(partPath(ticket)))).items[0].unitPrice,price);
 }finally{await prisma.product.update({where:{id:product.id},data:{unitSalePrice:product.unitSalePrice}});}
 await refused(send(partPath(ticket),{...input,reason:'Changed requirement intent'},key),409,'IDEMPOTENCY_CONFLICT');
});

test('fractional bulk requirements are real Product obligations with unknown costs, not invented zero expenses',async()=>{
 const {ticket}=await prepared(),wire=await prisma.product.findFirstOrThrow({where:{kind:'HARDWARE',trackingMode:'BULK'}});
 const saved=await ok(send(partPath(ticket),request(ticket,wire.id,{quantity:'1.500'})),201);
 assert.equal(saved.part.quantity,'1.500');assert.equal(saved.part.unitPrice,wire.unitSalePrice.toFixed(2));assert.equal(saved.part.totalCost,null);
 const definition=(await sql.query(`SELECT numeric_scale FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_lines' AND column_name='unitCost'`)).rows[0];
 assert.equal(definition.numeric_scale,6);
 const rows=await ok(get(partPath(ticket).replace(ticket.id,ticket.id.toUpperCase())+'?pageSize=1'));
 assert.equal(rows.items[0].id,saved.part.id);assert.equal(rows.total,1);
});

test('SQL freezes requirement identity and price, forbids fabricated legacy/issued parts and preserves cancellation evidence',async()=>{
 const {ticket,unit}=await prepared(),saved=await ok(send(partPath(ticket),request(ticket,unit.productId)),201),line=saved.part;
 const constraint=error=>error.code==='P2039'||error.code==='P2010';
 for(const data of [{productId:randomUUID()},{unitPrice:'0.00'},{quantity:'2.000'},{unitCost:'0.00',totalCost:'0.00'},{scope:'Other scope'},{phase:'ISSUED'}]){
  await assert.rejects(actorWork(tx=>tx.ticketLine.update({where:{id:line.id},data})),constraint);
 }
 for(const phase of ['LEGACY','ISSUED']) await assert.rejects(actorWork(tx=>tx.ticketLine.create({data:{
  ticketId:ticket.id,lineType:'PART',phase,productId:unit.productId,description:'Cannot fabricate old or consumed stock',quantity:'1',unitCost:'1',totalCost:'1',unitPrice:line.unitPrice,scope:line.scope,billableToCustomer:false,
 }})),constraint);
 await assert.rejects(prisma.ticketLine.delete({where:{id:line.id}}),constraint);
 await assert.rejects(sql.query('TRUNCATE ticket_lines CASCADE'),error=>error.code==='23514');
 assert.equal((await prisma.ticketLine.findUniqueOrThrow({where:{id:line.id}})).phase,'PLANNED');
 assert.equal((await prisma.serviceTicket.findUniqueOrThrow({where:{id:ticket.id}})).version,saved.ticketVersion);
});

test('planned obligations block scope/no-work bypass; explicit unused cancellation permits audited reassessment and true no-work closure',async()=>{
 let {ticket,unit}=await prepared();const before=await prisma.costEntry.count();
 const saved=await ok(send(partPath(ticket),request(ticket,unit.productId)),201);ticket={...ticket,version:saved.ticketVersion};
 await refused(assess(ticket,'Labour'),409,'REASSESSMENT_LOCKED');
 await refused(send(`/tickets/${ticket.id}/resolve`,{version:ticket.version,resolutionDetails:'Must not hide a requirement',noWorkReason:'Incorrect no-work bypass'}),409,'REPAIR_BILLING_REQUIRED');
 const key=randomUUID(),input={version:ticket.version,lineVersion:saved.part.version,reason:'Synthetic unused requirement withdrawn before stock allocation'};
 const path=partPath(ticket)+`/${saved.part.id}/cancel`,cancelled=await ok(send(path,input,key),201);
 assert.equal(cancelled.part.phase,'CANCELLED');assert.equal(cancelled.part.cancelledById,staff.ADMIN.id);assert.ok(cancelled.part.cancelledAt);
 assert.deepEqual(await ok(send(path,input,key),201),cancelled);
 ticket=await ok(assess({...ticket,version:cancelled.ticketVersion},'Labour'));
 const resolved=await ok(send(`/tickets/${ticket.id}/resolve`,{version:ticket.version,resolutionDetails:'Customer withdrew synthetic complaint',noWorkReason:'No parts or labour occurred; unused requirement was cancelled'}));
 const closed=await ok(send(`/tickets/${ticket.id}/confirm`,{version:resolved.version,confirmerName:'Fixture Customer',channel:'PHONE',confirmedAt:new Date().toISOString()}));
 assert.equal(closed.status,'CLOSED');assert.equal(await prisma.costEntry.count(),before);
 await refused(send(partPath(closed),request(closed,unit.productId)),409,'PART_REQUIREMENT_LOCKED');
 await assert.rejects(actorWork(tx=>tx.ticketLine.update({where:{id:saved.part.id},data:{phase:'PLANNED',version:{increment:1}}})));
});

test('competing create/cancel intents have one winner, and late caller failure rolls back line, audit, version and key',async()=>{
 let {ticket,unit}=await prepared();const input=request(ticket,unit.productId);
 const results=await Promise.all([send(partPath(ticket),input),send(partPath(ticket),input)]);
 assert.deepEqual(results.map(row=>row.status).sort(),[201,409]);const saved=await ok(results.find(row=>row.status===201),201);
 const cancel={version:saved.ticketVersion,lineVersion:saved.part.version,reason:'Cancel unused concurrent test requirement'};
 const race=await Promise.all([send(partPath(ticket)+`/${saved.part.id}/cancel`,cancel),send(partPath(ticket)+`/${saved.part.id}/cancel`,cancel)]);
 assert.deepEqual(race.map(row=>row.status).sort(),[201,409]);const winner=await ok(race.find(row=>row.status===201),201);
 ticket={...ticket,version:winner.ticketVersion};
 const key=randomUUID(),commands=app.get(IdempotencyService),run=commands.run.bind(commands),Parts=require('../dist/service/ticket-parts.service').TicketPartsService;
 const count=await prisma.ticketLine.count(),events=await prisma.serviceTicketEvent.count();
 commands.run=(command,work)=>run(command,async tx=>{await work(tx);throw Error('late part failure');});
 try{await assert.rejects(app.get(Parts).create(actor('ADMIN'),key,ticket.id,request(ticket,unit.productId)),/late part failure/);}finally{commands.run=run;}
 assert.equal(await prisma.ticketLine.count(),count);assert.equal(await prisma.serviceTicketEvent.count(),events);
 assert.equal((await prisma.serviceTicket.findUniqueOrThrow({where:{id:ticket.id}})).version,ticket.version);
 assert.equal(await prisma.command.count({where:{actorId:staff.ADMIN.id,idempotencyKey:key}}),0);
 assert.equal((await ok(send(partPath(ticket),request(ticket,unit.productId),key),201)).part.phase,'PLANNED');
});
