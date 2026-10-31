// PostgreSQL acceptance tests; never load the ordinary application .env.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID, randomInt } from 'node:crypto';
const require=createRequire(import.meta.url);
const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl||!/test/i.test(new URL(testUrl).pathname))throw new Error('Disposable TEST_DATABASE_URL required');
process.env.DATABASE_URL=testUrl;
process.env.SESSION_SECRET='quote-tests-only-session-secret-2026';
process.env.AUTH_TRUSTED_ORIGINS='http://127.0.0.1:3001';
process.env.SESSION_COOKIE_SECURE='false';
const {NestFactory}=require('@nestjs/core');
const {AppModule}=require('../dist/app.module');
const {ApiExceptionFilter}=require('../dist/platform/api-exception.filter');
const {PrismaService}=require('../dist/platform/prisma.service');
const {QuotesService}=require('../dist/quotes/quotes.service');
const {SurveysService}=require('../dist/sales/surveys.service');
const {CatalogService}=require('../dist/catalog/catalog.service');
const {seedCatalogue}=require('../dist/catalog/seed-catalogue');
const {catalogueDemoId:id}=require('../dist/catalog/demo-catalogue');
const {hashPassword}=require('../dist/auth/passwords');
const {quoteSchema}=require('@sunshine/contracts');
const {Client}=require('pg');
let app,base,prisma,quotes,surveys,catalog,sales,tech,warehouse;
const password='quote-test-password-2026';
const origin='http://127.0.0.1:3001';
const staff=row=>({id:row.id,email:row.email,displayName:row.displayName,role:row.role});
const when='2026-11-02T05:00:00.000Z';
const facts={roofDirection:'S',roofTiltDeg:'18.5',cableDistanceM:'22.00',usableRoofAreaSqm:'30.00'};
const user=async role=>prisma.user.create({data:{email:randomUUID()+'@test.local',displayName:role+' quote tester',role,passwordHash:await hashPassword(password)}});
const refuses=(promise,status,code)=>assert.rejects(promise,error=>{assert.equal(error.getStatus(),status);assert.equal(error.code,code);return true;});
async function fixture(approved=true){
  const customer=await prisma.customer.create({data:{name:'Quote Customer',phone:'6'+String(randomInt(0,1e9)).padStart(9,'0'),addressLine:'7 Quote Road',city:'Pune',pincode:'411001'}});
  const enquiry=await prisma.enquiry.create({data:{customerId:customer.id,source:'PHONE',requestedCapacityKw:1,status:'QUALIFIED',contactName:'Quote Customer',siteAddressLine:'7 Quote Road',siteCity:'Pune',sitePincode:'411001'}});
  const scheduled=(await surveys.schedule(enquiry.id,{technicianId:tech.id,scheduledFor:when})).data;
  if(approved){await surveys.submit(scheduled.id,{version:1,...facts},staff(tech));await surveys.approve(scheduled.id,{version:2},staff(sales));}
  return {customer,enquiry,surveyId:scheduled.id,command:{surveyId:scheduled.id,packageId:id(1001)}};
}
async function draft(source=quotes){
  const f=await fixture();return {...f,quote:(await source.create(f.enquiry.id,f.command,staff(sales))).data};
}
async function sent(source=quotes){
  const f=await draft(source);return {...f,quote:(await source.send(f.quote.id,{version:1,channel:'PRINT'},staff(sales))).data};
}
async function accepted(){
  const f=await sent();return {...f,quote:(await quotes.accept(f.quote.id,{version:2,acceptedByName:'Quote Customer',channel:'IN_PERSON'},staff(sales))).data};
}
before(async()=>{
  app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api/v1');app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0,'127.0.0.1');base=(await app.getUrl())+'/api/v1';
  prisma=app.get(PrismaService);quotes=app.get(QuotesService);surveys=app.get(SurveysService);catalog=app.get(CatalogService);
  await seedCatalogue(prisma);sales=await user('SALES');tech=await user('TECHNICIAN');warehouse=await user('WAREHOUSE');
});
after(async()=>{await app?.close();});

test('quote requires the latest approved survey belonging to the selected enquiry',async()=>{
  const f=await fixture(false);
  await refuses(quotes.create(f.enquiry.id,f.command,staff(sales)),409,'SURVEY_NOT_APPROVED');
  assert.equal(await prisma.quote.count({where:{enquiryId:f.enquiry.id}}),0);
  await surveys.submit(f.surveyId,{version:1,...facts},staff(tech));await surveys.reject(f.surveyId,{version:2,reason:'Roof facts need correction'},staff(sales));
  await refuses(quotes.create(f.enquiry.id,f.command,staff(sales)),409,'SURVEY_NOT_APPROVED');
  const other=await fixture();
  await refuses(quotes.create(f.enquiry.id,{...f.command,surveyId:other.surveyId},staff(sales)),400,'INVALID_INPUT');
  await surveys.schedule(other.enquiry.id,{technicianId:tech.id,scheduledFor:when});
  await refuses(quotes.create(other.enquiry.id,other.command,staff(sales)),409,'SURVEY_NOT_APPROVED');
});
test('creation freezes a complete kit, exact charges and explicit unconfigured policies atomically',async()=>{
  const f=await draft();const q=f.quote;
  assert.ok(quoteSchema.safeParse(q).success);assert.equal(q.lines.length,11);assert.equal(q.totalPrice,'55000.00');
  assert.equal(q.lines.filter(line=>line.kind==='PACKAGE').length,1);assert.equal(q.lines.filter(line=>line.kind==='SERVICE').length,1);
  assert.ok(q.lines.filter(line=>line.kind==='COMPONENT').every(line=>line.unitPrice==='0.00'&&line.lineTotal==='0.00'));
  assert.ok(q.lines.filter(line=>line.productId!==null).every(line=>line.policyStatus==='UNCONFIGURED'&&line.warrantyPolicySnapshot===null));
  assert.equal(q.customerSnapshot.addressLine,'7 Quote Road');
  await refuses(quotes.create(f.enquiry.id,f.command,staff(sales)),409,'QUOTE_ALREADY_EXISTS');
  assert.equal(await prisma.quote.count({where:{enquiryId:f.enquiry.id}}),1);
});
test('inactive package or incomplete source BOM produces no quote',async()=>{
  const f=await fixture();
  await prisma.package.update({where:{id:id(1001)},data:{active:false}});
  try{await refuses(quotes.create(f.enquiry.id,f.command,staff(sales)),409,'PACKAGE_NOT_CURRENT');}
  finally{await prisma.package.update({where:{id:id(1001)},data:{active:true}});}
  const line=await prisma.packageItem.findFirstOrThrow({where:{packageId:id(1001),productId:id(105)}});
  await prisma.packageItem.delete({where:{id:line.id}});
  try{await refuses(quotes.create(f.enquiry.id,f.command,staff(sales)),503,'CATALOGUE_DATA_INVALID');}
  finally{await prisma.packageItem.create({data:line});}
  assert.equal(await prisma.quote.count({where:{enquiryId:f.enquiry.id}}),0);
});
test('later catalogue and customer changes cannot rewrite frozen quote facts',async()=>{
  const f=await draft();
  const manufacturer=await prisma.manufacturer.findUniqueOrThrow({where:{id:id(1)}});
  const panel=await prisma.product.findUniqueOrThrow({where:{id:id(100)}});
  try{
    await prisma.manufacturer.update({where:{id:id(1)},data:{name:'Changed manufacturer '+randomUUID()}});
    await prisma.product.update({where:{id:id(100)},data:{name:'Changed panel name',unitSalePrice:'99999.99'}});
    await prisma.package.update({where:{id:id(1001)},data:{hardwarePrice:'60000.00'}});
    await prisma.enquiry.update({where:{id:f.enquiry.id},data:{contactName:'Changed contact',siteAddressLine:'Different site'}});
    assert.deepEqual((await quotes.get(f.quote.id)).data,f.quote);
    const revised=(await quotes.revise(f.quote.id,{version:1,...f.command,reason:'Customer requested changed terms'},staff(sales))).data;
    assert.equal(revised.revision,2);assert.equal(revised.supersedesQuoteId,f.quote.id);assert.equal(revised.totalPrice,'65000.00');
    assert.equal(revised.customerSnapshot.addressLine,'Different site');
    assert.equal(revised.lines.find(line=>line.productId===id(100)).productSnapshot.name,'Changed panel name');
    assert.deepEqual((await quotes.get(f.quote.id)).data,{...f.quote,isLatest:false});
  }finally{
    await prisma.manufacturer.update({where:{id:id(1)},data:{name:manufacturer.name}});
    await prisma.product.update({where:{id:id(100)},data:{name:panel.name,unitSalePrice:panel.unitSalePrice}});
    await prisma.package.update({where:{id:id(1001)},data:{hardwarePrice:'50000.00'}});
  }
});
test('sending and recorded acceptance are versioned; accepted terms stay immutable',async()=>{
  const f=await draft();
  await refuses(quotes.accept(f.quote.id,{version:1,acceptedByName:'Quote Customer',channel:'PHONE'},staff(sales)),409,'INVALID_TRANSITION');
  await refuses(quotes.send(f.quote.id,{version:9,channel:'PRINT'},staff(sales)),409,'STALE_VERSION');
  const sentQuote=(await quotes.send(f.quote.id,{version:1,channel:'WHATSAPP'},staff(sales))).data;
  assert.equal(sentQuote.version,2);assert.equal(sentQuote.sentById,sales.id);assert.ok(sentQuote.sentAt);
  const done=(await quotes.accept(f.quote.id,{version:2,acceptedByName:'Quote Customer',channel:'PHONE',reference:'Staff recorded call'},staff(sales))).data;
  assert.equal(done.status,'ACCEPTED');assert.equal(done.version,3);assert.equal(done.decidedById,sales.id);
  await refuses(quotes.reject(done.id,{version:3,reason:'Cannot overwrite accepted terms'},staff(sales)),409,'INVALID_TRANSITION');
  assert.deepEqual((await prisma.$transaction(tx=>quotes.requireAcceptedQuote(tx,done.id))),done);
});
test('declined quote retains its reason; a successor preserves old accepted or declined facts',async()=>{
  const f=await sent();const rejected=(await quotes.reject(f.quote.id,{version:2,reason:'Customer selected another capacity'},staff(sales))).data;
  assert.equal(rejected.decisionReason,'Customer selected another capacity');
  await refuses(prisma.$transaction(tx=>quotes.requireAcceptedQuote(tx,rejected.id)),409,'QUOTE_NOT_ACCEPTED');
  const next=(await quotes.revise(rejected.id,{version:3,...f.command,reason:'New offer requested'},staff(sales))).data;
  assert.equal(next.revision,2);
  await refuses(quotes.send(rejected.id,{version:3,channel:'PRINT'},staff(sales)),409,'QUOTE_SUPERSEDED');
  const list=(await quotes.listForEnquiry(f.enquiry.id)).data.items;
  assert.deepEqual(list.map(row=>row.revision),[2,1]);assert.equal(list[1].status,'REJECTED');
});
test('simultaneous acceptance and revision of one sent version has exactly one winner',async()=>{
  const f=await sent();
  const results=await Promise.allSettled([
    quotes.accept(f.quote.id,{version:2,acceptedByName:'Quote Customer',channel:'IN_PERSON'},staff(sales)),
    quotes.revise(f.quote.id,{version:2,...f.command,reason:'Revised offer requested'},staff(sales)),
  ]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
  assert.ok(['STALE_VERSION','QUOTE_SUPERSEDED'].includes(results.find(row=>row.status==='rejected').reason.code));
});
test('D4 policy reader freezes configured facts; unavailable policy data rolls back the whole quote',async()=>{
  const policy={policyName:'Fictional component policy',revision:'r1',scope:'Equipment defects',durationMonths:24};
  const reader={getWarrantyPolicySnapshot:async()=>({...policy})};
  const configured=new QuotesService(prisma,catalog,surveys,reader);
  const f=await draft(configured);
  policy.revision='r2';policy.durationMonths=12;
  assert.ok((await configured.get(f.quote.id)).data.lines.filter(line=>line.productId!==null).every(line=>line.warrantyPolicySnapshot.revision==='r1'&&line.warrantyPolicySnapshot.durationMonths===24));
  const failing=new QuotesService(prisma,catalog,surveys,{getWarrantyPolicySnapshot:async()=>({policyName:'Incomplete policy'})});
  const other=await fixture();
  await refuses(failing.create(other.enquiry.id,other.command,staff(sales)),503,'POLICY_DATA_INVALID');
  assert.equal(await prisma.quote.count({where:{enquiryId:other.enquiry.id}}),0);
});
test('accepted-quote helper sees caller writes and never commits the caller transaction',async()=>{
  const f=await sent();const rollback=new Error('intentional caller rollback');
  await assert.rejects(prisma.$transaction(async tx=>{
    await tx.quote.update({where:{id:f.quote.id},data:{status:'ACCEPTED',version:3,decidedAt:new Date(),decidedById:sales.id,acceptedByName:'Quote Customer',decisionChannel:'PHONE'}});
    assert.equal((await quotes.requireAcceptedQuote(tx,f.quote.id)).status,'ACCEPTED');
    throw rollback;
  }),error=>error===rollback);
  assert.equal((await quotes.get(f.quote.id)).data.status,'SENT');
});
test('database enforces immutable sent/accepted headers and lines even through raw writes',async()=>{
  const f=await accepted();
  for(const [sql,values] of [
    ['UPDATE quotes SET "totalPrice"=$1 WHERE id=$2::uuid',['1.00',f.quote.id]],
    ['UPDATE quote_lines SET description=$1 WHERE "quoteId"=$2::uuid',['Changed terms',f.quote.id]],
    ['DELETE FROM quote_lines WHERE "quoteId"=$1::uuid',[f.quote.id]],
    ['DELETE FROM quotes WHERE id=$1::uuid',[f.quote.id]],
  ])await assert.rejects(prisma.$executeRawUnsafe(sql,...values),error=>error.code==='P2010'&&error.meta?.driverAdapterError?.cause?.originalCode==='23514');
  assert.deepEqual((await quotes.get(f.quote.id)).data,f.quote);
});
test('database rejects nonfinite/negative money, fractional serialized requirements and duplicate charges',async()=>{
  const f=await draft();const client=new Client({connectionString:testUrl});await client.connect();
  const fails=async(sql,values,rule)=>{
    await client.query('BEGIN');
    try{await assert.rejects(client.query(sql,values),error=>{assert.equal(error.constraint,rule);return true;});}
    finally{await client.query('ROLLBACK');}
  };
  try{
    for(const value of ['NaN','-0.01'])await fails('INSERT INTO quotes SELECT * FROM jsonb_populate_record(NULL::quotes, (SELECT to_jsonb(q) FROM quotes q WHERE id=$1::uuid) || $2::jsonb)',
      [f.quote.id,JSON.stringify({id:randomUUID(),hardwarePrice:value})],'quotes_prices_reconcile');
    await fails('INSERT INTO quotes SELECT * FROM jsonb_populate_record(NULL::quotes, (SELECT to_jsonb(q) FROM quotes q WHERE id=$1::uuid) || $2::jsonb)',
      [f.quote.id,JSON.stringify({id:randomUUID(),revision:2,supersedesQuoteId:f.quote.id,revisionReason:null})],'quotes_revision_source');
    const component=f.quote.lines.find(line=>line.kind==='COMPONENT');
    await fails('UPDATE quote_lines SET quantity=$1::numeric WHERE id=$2::uuid',['NaN',component.id],'quote_lines_quantity_positive');
    await fails('UPDATE quote_lines SET quantity=$1::numeric WHERE id=$2::uuid',['1.500',component.id],'quote_lines_serialized_whole');
    await fails('UPDATE quote_lines SET "unitPrice"=1,"lineTotal"=1 WHERE id=$1::uuid',[component.id],'quote_lines_charging_consistent');
    await fails('INSERT INTO quote_lines SELECT * FROM jsonb_populate_record(NULL::quote_lines,(SELECT to_jsonb(line) FROM quote_lines line WHERE id=$1::uuid)||$2::jsonb)',
      [f.quote.lines[0].id,JSON.stringify({id:randomUUID(),position:99})],'quote_lines_one_package_charge');
  }finally{await client.end();}
});
test('HTTP quote routes enforce roles, reject client totals, and persist manual send and acceptance',async()=>{
  const login=async account=>{
    const response=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({email:account.email,password})});
    assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];
  };
  const salesCookie=await login(sales);const warehouseCookie=await login(warehouse);const f=await fixture();
  const post=(route,cookie,body)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json',origin,...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  const route='/enquiries/'+f.enquiry.id+'/quotes';
  assert.equal((await post(route,null,f.command)).status,401);
  assert.equal((await post(route,warehouseCookie,f.command)).status,403);
  assert.equal((await post(route,salesCookie,{...f.command,totalPrice:'1.00'})).status,400);
  const created=await post(route,salesCookie,f.command);assert.equal(created.status,201);const q=(await created.json()).data;
  const send=await post('/quotes/'+q.id+'/send',salesCookie,{version:1,channel:'EMAIL'});assert.equal(send.status,201);
  const accept=await post('/quotes/'+q.id+'/accept',salesCookie,{version:2,acceptedByName:'Quote Customer',channel:'EMAIL',reference:'Staff recorded email acceptance'});
  assert.equal(accept.status,201);assert.equal((await accept.json()).data.status,'ACCEPTED');
  const loaded=await fetch(base+'/quotes/'+q.id,{headers:{cookie:salesCookie}});assert.equal(loaded.status,200);
  assert.equal((await loaded.json()).data.status,'ACCEPTED');
});

test('Off-Grid quote freezes its battery and passes the complete-terms send backstop',async()=>{
  const f=await fixture();f.command.packageId=id(2001);
  const q=(await quotes.create(f.enquiry.id,f.command,staff(sales))).data;
  assert.equal(q.totalPrice,'80000.00');
  assert.equal(q.lines.filter(line=>line.kind==='COMPONENT').length,10);
  assert.equal(q.lines.filter(line=>line.productSnapshot?.category==='BATTERY').length,1);
  assert.equal((await quotes.send(q.id,{version:1,channel:'PRINT'},staff(sales))).data.status,'SENT');
});

test('a damaged draft is refused by the API and cannot bypass completeness through raw sending',async()=>{
  const f=await draft();const line=f.quote.lines.find(row=>row.productSnapshot?.category==='CONNECTOR');
  const client=new Client({connectionString:testUrl});await client.connect();
  const saved=(await client.query('SELECT to_jsonb(line) AS row FROM quote_lines line WHERE id=$1::uuid',[line.id])).rows[0].row;
  await client.query('DELETE FROM quote_lines WHERE id=$1::uuid',[line.id]);
  try{
    await refuses(quotes.get(f.quote.id),503,'QUOTE_DATA_INVALID');
    await refuses(quotes.send(f.quote.id,{version:1,channel:'PRINT'},staff(sales)),503,'QUOTE_DATA_INVALID');
    await assert.rejects(client.query('UPDATE quotes SET status=$1,version=version+1,"sentAt"=now(),"sentById"=$2::uuid,"sentChannel"=$3 WHERE id=$4::uuid',
      ['SENT',sales.id,'PRINT',f.quote.id]),error=>error.constraint==='quotes_complete_terms');
  }finally{
    await client.query('INSERT INTO quote_lines SELECT * FROM jsonb_populate_record(NULL::quote_lines,$1::jsonb)',[JSON.stringify(saved)]);
    await client.end();
  }
  assert.equal((await quotes.get(f.quote.id)).data.status,'DRAFT');
});

test('closing an approved enquiry prevents new quote terms',async()=>{
  const f=await fixture();
  await prisma.enquiry.update({where:{id:f.enquiry.id},data:{status:'ARCHIVED',closedReason:'Customer cancelled before quotation'}});
  await refuses(quotes.create(f.enquiry.id,f.command,staff(sales)),409,'ENQUIRY_NOT_QUALIFIED');
  assert.equal(await prisma.quote.count({where:{enquiryId:f.enquiry.id}}),0);
});

test('accepted-quote confirmation helper refuses archived or disqualified enquiries while preserving history', async () => {
  const { EnquiryQueueService } = require('../dist/sales/enquiry-queue.service');
  const queue = app.get(EnquiryQueueService);
  for (const status of ['ARCHIVED', 'DISQUALIFIED']) {
    const f = await accepted();
    if (status === 'ARCHIVED') {
      await queue.archive(f.enquiry.id, { version: 1, reason: 'Customer cancelled before confirmation' });
    } else {
      await queue.qualify(f.enquiry.id, {
        version: 1, outcome: 'DISQUALIFIED', reason: 'Site no longer suitable',
        shadowFreeRoofAreaSqm: '0.00', monthlyBillInr: '2500.00', gridConnectionSuitable: false,
      });
    }
    await refuses(prisma.$transaction(tx => quotes.requireAcceptedQuote(tx, f.quote.id)), 409, 'ENQUIRY_NOT_QUALIFIED');
    assert.equal((await quotes.get(f.quote.id)).data.status, 'ACCEPTED', 'saved customer terms remain readable');
  }
});
