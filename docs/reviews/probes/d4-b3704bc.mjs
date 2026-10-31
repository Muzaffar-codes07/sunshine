// Opt-in independent review only. Run after D4 database fixtures on a disposable database.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
assert.ok(process.env.D4_REVIEW_ROOT, 'Set D4_REVIEW_ROOT to the compiled reviewed checkout');
const require=createRequire(pathToFileURL(resolve(process.env.D4_REVIEW_ROOT,'apps/api/package.json')));
require('reflect-metadata');
const {Client}=require('pg');
const {PrismaService}=require('./dist/platform/prisma.service');
const {CostWriterService}=require('./dist/finance/cost-writer.service');
const url=process.env.TEST_DATABASE_URL;
assert.ok(url, 'Set TEST_DATABASE_URL explicitly');
const target=new URL(url);
assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname) && /test/i.test(target.pathname), 'A disposable local test database is required');
process.env.DATABASE_URL=url;
const sql=new Client({connectionString:url});await sql.connect();
const prisma=new PrismaService(),writer=new CostWriterService();let checks=0;
const check=(name,fn)=>fn().then(()=>{checks++;process.stdout.write(`PASS ${name}\n`);});
const rollback=async(fn)=>{await sql.query('BEGIN');try{await fn();}finally{await sql.query('ROLLBACK');}};
const reject=async(statement,args,rule)=>{await sql.query('SAVEPOINT probe');try{
 await assert.rejects(sql.query(statement,args),e=>e.constraint===rule);
}finally{await sql.query('ROLLBACK TO SAVEPOINT probe');}};
try {
 const job=(await sql.query('SELECT id FROM jobs ORDER BY id LIMIT 1')).rows[0].id;
 const unit=(await sql.query('SELECT id FROM units ORDER BY id LIMIT 1')).rows[0].id;
 const ticket=(await sql.query('SELECT id FROM service_tickets ORDER BY id LIMIT 1')).rows[0].id;
 const customer=(await sql.query('SELECT "customerId" FROM orders WHERE "jobId"=$1',[job])).rows[0].customerId;
 const base={uniqueSourceId:`D3_REVIEW:${randomUUID()}`,jobId:job,costType:'MATERIAL_DISPATCH',amount:'1.25',description:'Original source',occurredAt:'2026-10-30T12:00:00.000Z'};
 const post=x=>prisma.$transaction(tx=>writer.postCost(tx,x));const original=await post(base);
 for(const [name,change] of Object.entries({description:{description:'Different'},time:{occurredAt:'2026-10-30T12:00:00.001Z'}})) {
  await check(`changed ${name} aborts caller writes`,async()=>{
   const marker=randomUUID();await assert.rejects(prisma.$transaction(async tx=>{
    await tx.subsidyMilestone.create({data:{id:marker,jobId:job,stage:'rollback',amount:'1'}});
    await writer.postCost(tx,{...base,...change});
   }),e=>e.code==='IDEMPOTENCY_CONFLICT');
   assert.equal(await prisma.subsidyMilestone.count({where:{id:marker}}),0);
  });
 }
 await check('zero original and reversal replay exactly once',async()=>{
  const zero=await post({...base,uniqueSourceId:`D3_REVIEW:${randomUUID()}`,amount:'0.00'});
  const command={...base,uniqueSourceId:`REVERSAL:${zero.id}`,reversalOfId:zero.id,amount:'0.00'};
  const rows=await Promise.all([post(command),post(command)]);assert.equal(rows[0].id,rows[1].id);
 });
 await check('same transaction cost is rolled back after downstream failure',async()=>{
  const input={...base,uniqueSourceId:`D3_REVIEW:${randomUUID()}`};
  await assert.rejects(prisma.$transaction(async tx=>{await writer.postCost(tx,input);throw Error('late failure');}),/late failure/);
  assert.equal(await prisma.costEntry.count({where:{uniqueSourceId:input.uniqueSourceId}}),0);
 });
 const insertCost='INSERT INTO cost_entries (id,"uniqueSourceId","jobId","costType",amount,description,"occurredAt","reversalOfId") VALUES ($1,$2,$3,\'MATERIAL_DISPATCH\',$4,$5,$6,$7)';
 const costArgs=(extra={})=>{const x={id:randomUUID(),source:`D3_REVIEW:${randomUUID()}`,job,amount:'1',description:'SQL probe',at:'2026-10-30T12:00:00Z',reversal:null,...extra};return[x.id,x.source,x.job,x.amount,x.description,x.at,x.reversal];};
 const cases=[
 ['negative ordinary cost',{amount:'-1'},'cost_entries_reversal_shape'],
 ['reserved reversal namespace',{source:'REVERSAL:bad'},'cost_entries_reversal_shape'],
 ['NaN cost',{amount:'NaN'},'cost_entries_amount_finite'],
 ['blank source',{source:' '},'cost_entries_text_not_blank'],
 ['blank description',{description:' '},'cost_entries_text_not_blank'],
 ['missing cost job',{job:randomUUID()},'cost_entries_jobId_fkey'],
 ['wrong reversal amount',{source:`REVERSAL:${original.id}`,reversal:original.id,amount:'-1'},'cost_entries_valid_reversal'],
 ['reversal before source',{source:`REVERSAL:${original.id}`,reversal:original.id,amount:'-1.25',at:'2026-10-29T12:00:00Z'},'cost_entries_valid_reversal'],
 ];
 for(const [name,args,rule] of cases)await check(name,()=>rollback(()=>reject(insertCost,costArgs(args),rule)));
 const warranty='INSERT INTO warranties (id,"unitId","startDate","expiryDate","policyName","policyRevision",scope,"durationMonths","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())';
 for(const [name,args,rule] of [
  ['warranty same date',['2026-01-01','2026-01-01','Policy','v1','Parts',12],'warranties_dates_ordered'],
  ['warranty negative duration',['2026-01-01','2027-01-01','Policy','v1','Parts',0],'warranties_duration_positive'],
  ['warranty blank policy',['2026-01-01','2027-01-01',' ','v1','Parts',12],'warranties_policy_not_blank'],
 ])await check(name,()=>rollback(()=>reject(warranty,[randomUUID(),unit,...args],rule)));
 const line='INSERT INTO ticket_lines (id,"ticketId","lineType",description,quantity,"unitCost","totalCost","billableToCustomer") VALUES ($1,$2,\'PART\',$3,$4,$5,$6,false)';
 for(const [name,values,rule]of[
 ['part zero quantity',['Part','0','1','0'],'ticket_lines_quantity_positive'],
 ['part NaN quantity',['Part','NaN','1','0'],'ticket_lines_quantity_positive'],
 ['part negative cost',['Part','1','-1','-1'],'ticket_lines_cost_nonnegative'],
 ['part inconsistent total',['Part','2','1','3'],'ticket_lines_total_matches'],
 ['part blank description',[' ','1','1','1'],'ticket_lines_description_not_blank'],
 ])await check(name,()=>rollback(()=>reject(line,[randomUUID(),ticket,...values],rule)));
 await check('half-up exact part totals accept 0.333 × 1.50 = 0.50',()=>rollback(async()=>{
  await sql.query(line,[randomUUID(),ticket,'Part','0.333','1.50','0.50']);
 }));
 await check('all 12 real D4 foreign keys are restrictive and validated',async()=>{
  const {rows}=await sql.query(`SELECT c.conname,c.confdeltype,c.convalidated FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
   WHERE t.relname=ANY($1) AND c.contype='f' AND c.connamespace='public'::regnamespace`,[['warranties','cost_entries','service_tickets','ticket_lines','subsidy_milestones']]);
  assert.equal(rows.length,12);assert.ok(rows.every(r=>r.confdeltype==='r'&&r.convalidated));
 });
 await check('PART schema currently lacks canonical product identity (integration gate)',async()=>{
  const {rows}=await sql.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='ticket_lines'`);
  assert.ok(!rows.some(r=>r.column_name==='productId'));
 });
 process.stdout.write(`Independent checks passed: ${checks}\n`);
}finally{await sql.end();await prisma.$disconnect();}
