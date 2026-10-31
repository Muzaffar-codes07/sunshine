// Lineage persistence only; real stock/warranty replacement remains a separate command.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url),url=process.env.TEST_DATABASE_URL;
if(!url || !/test/i.test(new URL(url).pathname))throw Error('Disposable TEST_DATABASE_URL required');
process.env.DATABASE_URL=url;process.env.SESSION_SECRET='unit-lineage-tests-only-session-secret';
const {NestFactory}=require('@nestjs/core');
const {AppModule}=require('../dist/app.module');
const {PrismaService}=require('../dist/platform/prisma.service');
const {StockReceiptsService}=require('../dist/inventory/stock-receipts.service');
const {StockReadService}=require('../dist/inventory/stock-read.service');
const {seedCatalogue}=require('../dist/catalog/seed-catalogue');
const {Client}=require('pg');
let app,prisma,receipts,reads,actor,product,location,sql;
before(async()=>{
 app=await NestFactory.createApplicationContext(AppModule,{logger:false});prisma=app.get(PrismaService);
 receipts=app.get(StockReceiptsService);reads=app.get(StockReadService);await seedCatalogue(prisma);
 actor=await prisma.user.create({data:{email:randomUUID()+'@test.local',displayName:'Lineage warehouse tester',role:'WAREHOUSE',passwordHash:'not-a-login-fixture'}});
 product=await prisma.product.findFirstOrThrow({where:{trackingMode:'SERIALIZED',active:true}});
 location=await prisma.stockLocation.findUniqueOrThrow({where:{code:'MAIN'}});
 sql=new Client({connectionString:url});await sql.connect();
});
after(async()=>{await sql?.end();await app?.close();});
async function units(count=3){
 const result=(await receipts.receive(actor.id,randomUUID(),{reference:'LINEAGE-'+randomUUID(),locationId:location.id,receivedAt:new Date().toISOString(),
  lines:[{productId:product.id,quantity:String(count),unitCost:'250.75',serials:Array.from({length:count},()=> 'LINEAGE-'+randomUUID())}]})).data;
 return result.lines[0].unitIds;
}
const link=(child,parent)=>sql.query('UPDATE units SET "replacesUnitId"=$2 WHERE id=$1',[child,parent]);
const rule=name=>error=>error.constraint===name;

test('actual receipts default to no predecessor and traceability reloads a recorded predecessor',async()=>{
 const [old,replacement]=await units(2);
 const before=(await reads.getUnit(replacement)).data;assert.equal(before.replacesUnitId,null);
 const moves=await prisma.stockMovement.count();await link(replacement,old);
 const after=(await reads.getUnit(replacement)).data;assert.equal(after.replacesUnitId,old);
 assert.deepEqual({...after,replacesUnitId:null},before);assert.equal(await prisma.stockMovement.count(),moves);
 const persisted=await prisma.unit.findUniqueOrThrow({where:{id:replacement},include:{replacesUnit:true}});
 assert.equal(persisted.replacesUnit.id,old);assert.equal(persisted.acquisitionCost.toFixed(2),'250.75');
});

test('missing predecessors and self-links fail without modifying a real unit',async()=>{
 const [id]=await units(1);
 await assert.rejects(link(id,randomUUID()),rule('units_replacesUnitId_fkey'));
 await assert.rejects(link(id,id),rule('units_lineage_not_self'));
 assert.equal((await reads.getUnit(id)).data.replacesUnitId,null);
});

test('recorded history cannot be cleared or redirected, while identical writes and normal lifecycle updates remain possible',async()=>{
 const [old,replacement,other]=await units();await link(replacement,old);await link(replacement,old);
 await assert.rejects(link(replacement,null),rule('units_lineage_immutable'));
 await assert.rejects(link(replacement,other),rule('units_lineage_immutable'));
 await prisma.unit.update({where:{id:replacement},data:{status:'QUARANTINED',version:{increment:1}}});
 const row=await prisma.unit.findUniqueOrThrow({where:{id:replacement}});assert.equal(row.replacesUnitId,old);assert.equal(row.status,'QUARANTINED');
});

test('sequential cycles are refused and a legitimate chain retains every ancestor',async()=>{
 const [a,b,c]=await units();await link(b,a);await link(c,b);
 await assert.rejects(link(a,c),rule('units_lineage_acyclic'));
 assert.equal((await reads.getUnit(c)).data.replacesUnitId,b);assert.equal((await reads.getUnit(b)).data.replacesUnitId,a);
 assert.equal((await reads.getUnit(a)).data.replacesUnitId,null);
});

test('two concurrent opposite edges have one winner and never commit a cycle',async()=>{
 const [a,b]=await units(2),other=new Client({connectionString:url});await other.connect();
 try{
  const outcomes=await Promise.allSettled([link(a,b),other.query('UPDATE units SET "replacesUnitId"=$2 WHERE id=$1',[b,a])]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(outcomes.find(r=>r.status==='rejected').reason.constraint,'units_lineage_acyclic');
  const rows=await prisma.unit.findMany({where:{id:{in:[a,b]}}});assert.equal(rows.filter(r=>r.replacesUnitId!==null).length,1);
 }finally{await other.end();}
});

test('a caller failure rolls back the predecessor and preceding domain writes, allowing a clean retry',async()=>{
 const [old,replacement]=await units(2),marker=randomUUID();
 await assert.rejects(prisma.$transaction(async tx=>{
  await tx.user.create({data:{id:marker,email:marker+'@test.local',displayName:'Rollback marker',role:'WAREHOUSE',passwordHash:'test'}});
  await tx.unit.update({where:{id:replacement},data:{replacesUnitId:old}});throw Error('replacement caller failed');
 }),/replacement caller failed/);
 assert.equal(await prisma.user.findUnique({where:{id:marker}}),null);assert.equal((await reads.getUnit(replacement)).data.replacesUnitId,null);
 await link(replacement,old);assert.equal((await reads.getUnit(replacement)).data.replacesUnitId,old);
});

test('new links reject stale-snapshot isolation while read-only snapshot traceability remains available',async()=>{
 const [old,replacement]=await units(2);
 for(const isolationLevel of ['RepeatableRead','Serializable'])await assert.rejects(prisma.$transaction(tx=>tx.unit.update({where:{id:replacement},data:{replacesUnitId:old}}),{isolationLevel}),error=>/predecessor links require a READ COMMITTED transaction/.test(error.message));
 await link(replacement,old);assert.equal((await reads.getUnit(replacement)).data.replacesUnitId,old);
});

test('actual self-FK is restrictive and its lookup index is valid',async()=>{
 const {rows}=await sql.query(`SELECT confdeltype,confupdtype,convalidated FROM pg_constraint WHERE conrelid='units'::regclass AND conname='units_replacesUnitId_fkey'`);
 assert.deepEqual(rows,[{confdeltype:'r',confupdtype:'r',convalidated:true}]);
 const index=await sql.query(`SELECT indisvalid FROM pg_index WHERE indexrelid='"units_replacesUnitId_idx"'::regclass`);assert.equal(index.rows[0].indisvalid,true);
});


test('a multi-row insert cannot create a cycle between new units',async()=>{
 const [source]=await units(1),a=randomUUID(),b=randomUUID();
 const count=await prisma.unit.count();
 await assert.rejects(sql.query(`INSERT INTO units (id,"productId","manufacturerId","rawSerial","normalizedSerial",status,"acquisitionCost","receiptLineId",version,"createdAt","updatedAt","replacesUnitId")
  SELECT $1::uuid,"productId","manufacturerId",$1::text,$1::text,'AVAILABLE'::"UnitStatus","acquisitionCost","receiptLineId",1,now(),now(),$2::uuid FROM units WHERE id=$3
  UNION ALL SELECT $2::uuid,"productId","manufacturerId",$2::text,$2::text,'AVAILABLE'::"UnitStatus","acquisitionCost","receiptLineId",1,now(),now(),$1::uuid FROM units WHERE id=$3`,[a,b,source]),rule('units_lineage_acyclic'));
 assert.equal(await prisma.unit.count(),count);
});
