import 'reflect-metadata';
import { config } from 'dotenv';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { StaffIdentity } from '@sunshine/contracts';
import { PrismaService } from '../platform/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { hashPassword } from '../auth/passwords';
import { seedCatalogue } from '../catalog/seed-catalogue';
import { catalogueDemoId, demoPackages, demoProducts } from '../catalog/demo-catalogue';
import { seedWarrantyPolicies } from '../warranty/seed-warranty-policies';
import { PrivateFileStore } from '../files/private-file.store';
import { StockIntegrityService } from '../inventory/stock-integrity.service';
import { PersistedWarrantyEquipmentReader, ValidatedWarrantyReader } from '../warranty/persisted-warranty-readers';
import { WarrantyService } from '../warranty/warranty.service';
import { hashPayload } from '../platform/idempotency';
import { IdempotencyService } from '../platform/idempotency';
import { StockLedgerService } from '../inventory/stock-ledger.service';
import { StockReceiptsService } from '../inventory/stock-receipts.service';
import { buildManifest, DEMO_VERSION, demoId, manifestSummary, hasOrder, type DemoCustomer } from './manifest';
import { HistoricalDemoImporter, type DemoStaff, type Evidence } from './historical-import';

export const repository = resolve(__dirname,'../../../..');
const DATASET_ID=demoId('dataset');
const fail=(code:string)=>{throw Error(code);};

export function assertDemoTarget(env:NodeJS.ProcessEnv=process.env,writing=true){
  if(!env.DATABASE_URL || !env.DEMO_DATABASE_NAME)fail('DEMO_TARGET_REQUIRED: set DATABASE_URL and the exact DEMO_DATABASE_NAME');
  let url:URL;try{url=new URL(env.DATABASE_URL!);}catch{throw Error('DEMO_TARGET_INVALID');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||decodeURIComponent(url.pathname.slice(1))!==env.DEMO_DATABASE_NAME)fail('DEMO_TARGET_MISMATCH');
  if(writing&&(env.DEMO_DATABASE_DISPOSABLE!=='true'||env.NODE_ENV==='production'))fail('DEMO_DISPOSABLE_REQUIRED: opt in to a disposable local demo database');
  if(writing&&(!env.DEMO_STAFF_PASSWORD||env.DEMO_STAFF_PASSWORD.length<12||env.DEMO_STAFF_PASSWORD.length>200))fail('DEMO_PASSWORD_REQUIRED: supply a 12–200 character demo-only staff password');
}

export async function prepareStaff(prisma:PrismaService,password:string):Promise<DemoStaff>{
  const specs=[['admin','ADMIN','Demo Administrator'],['sales','SALES','Demo Sales Coordinator'],['warehouse','WAREHOUSE','Demo Warehouse Coordinator'],['support','SUPPORT','Demo Support Coordinator'],
    ...Array.from({length:6},(_,n)=>[n===0?'technician':`technician${n+1}`,'TECHNICIAN',`Demo Technician ${n+1}`])] as const;
  const staff:StaffIdentity[]=[];
  // One hash for the explicitly shared local-demo password; never printed or put in reports.
  const passwordHash=await hashPassword(password);
  for(const [alias,role,displayName]of specs){
    const email=`${alias}@sunshine.test`,existing=await prisma.user.findUnique({where:{email}});
    if(existing&&(existing.role!==role||!existing.active))fail('DEMO_STAFF_COLLISION');
    const row=existing??await prisma.user.create({data:{id:demoId(`staff:${alias}`),email,role:role as StaffIdentity['role'],displayName,passwordHash}});
    staff.push({id:row.id,email:row.email,displayName:row.displayName,role:row.role});
  }
  return {admin:staff[0]!,sales:staff[1]!,warehouse:staff[2]!,support:staff[3]!,technicians:staff.slice(4)};
}

async function evidenceFor(store:PrivateFileStore):Promise<Evidence[]>{
  const created:Evidence[]=[];
  try{
    for(const name of ['roof','signature']){
      const buffer=await readFile(resolve(repository,`prisma/seed/assets/sample-${name}.png`));
      const storageKey=await store.write(buffer);
      created.push({storageKey,originalName:`SYNTHETIC-sample-${name}.png`,mediaType:'image/png',sizeBytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')});
    }
    return created;
  }catch(error){for(const file of created)await store.remove(file.storageKey);throw error;}
}

export async function seedDemo(prisma:PrismaService,options:{password:string;anchor?:string;progress?:(count:number)=>void;failAt?:number}){
  // Refuse unrelated customer records before any setup writes. No deletion/reset path exists.
  const saved=await prisma.command.findUnique({where:{id:DATASET_ID}});
  const original=saved?.result as {version?:string;anchor?:string}|null;
  if(saved&&(saved.action!=='DEMO_DATASET'||original?.version!==DEMO_VERSION))fail('DEMO_MANIFEST_COLLISION');
  if(options.anchor&&original?.anchor&&options.anchor!==original.anchor)fail('DEMO_ANCHOR_CONFLICT: reruns must preserve original history');
  const rows=buildManifest(original?.anchor??options.anchor);
  const allowed=new Set(rows.map(r=>r.customerId));
  for(const customer of await prisma.customer.findMany({select:{id:true}}))if(!allowed.has(customer.id))fail('DEMO_DATABASE_NOT_EMPTY: use a dedicated database; existing customers will not be adopted or deleted');
  const staff=await prepareStaff(prisma,options.password);
  await seedCatalogue(prisma);await seedWarrantyPolicies(prisma);
  if(!saved)await prisma.command.create({data:{id:DATASET_ID,actorId:staff.admin.id,idempotencyKey:`${DEMO_VERSION}-dataset`,action:'DEMO_DATASET',payloadHash:hashPayload(manifestSummary(rows)),result:manifestSummary(rows)}});
  const location=await prisma.stockLocation.findUniqueOrThrow({where:{code:'MAIN'}});
  if(!location.active||location.kind!=='USABLE'||await prisma.stockLocation.count({where:{kind:'USABLE',active:true}})!==1)fail('DEMO_LOCATION_INVALID');
  // Real receipt, no job expense: stock remaining on the shelf is not consumed material.
  await new StockReceiptsService(new IdempotencyService(prisma),new StockLedgerService(),prisma).receive(staff.warehouse.id,'DEMO450-stock-buffer-v1',{
    reference:'DEMO450-STOCK-BUFFER',locationId:location.id,receivedAt:new Date(`${rows[0]!.anchor}T00:00:00+05:30`).toISOString(),
    lines:demoProducts.filter(p=>p.kind==='HARDWARE').map((p,n)=>{
      const serialized=p.trackingMode==='SERIALIZED',quantity=serialized?(p.category==='PANEL'?20:3):(p.category==='CABLE'?500:25);
      return {productId:p.id!,quantity:String(quantity),unitCost:new Prisma.Decimal(String(p.unitSalePrice)).mul('0.50').toFixed(2),
        serials:serialized?Array.from({length:quantity},(_,s)=>`DEMO450-SPARE-${n}-${s+1}`):[]};
    }),
  });
  for(const t of staff.technicians){
    const rateId=demoId(`rate:${t.id}`);
    if(!await prisma.technicianRateRevision.findUnique({where:{id:rateId}}))await prisma.technicianRateRevision.create({data:{id:rateId,technicianId:t.id,hourlyRate:'300.00',reference:'Synthetic demo rate, approved for sample history',createdById:staff.admin.id,createdAt:new Date('2020-01-01T00:00:00Z')}});
  }
  const importer=new HistoricalDemoImporter(staff,location.id),store=new PrivateFileStore();
  for(const row of rows){
    const markerId=demoId(`import:${row.index}`),fingerprint=hashPayload(row);
    const marker=await prisma.command.findUnique({where:{id:markerId}});
    if(marker){
      if(marker.action!=='DEMO_CUSTOMER_IMPORT'||marker.payloadHash!==fingerprint)fail('DEMO_CUSTOMER_MANIFEST_CONFLICT');
      await verifyIdentity(prisma,row);
    }else{
      const evidence=row.stage==='COMPLETED'?await evidenceFor(store):[];
      try{
        await prisma.$transaction(async tx=>{
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(450,${row.index}::int)::text`;
          const result=await importer.customer(tx,row,evidence);
          if(options.failAt===row.index)fail('DEMO_INJECTED_FAILURE');
          await tx.command.create({data:{id:markerId,actorId:staff.admin.id,idempotencyKey:`${DEMO_VERSION}-customer-${row.index}`,action:'DEMO_CUSTOMER_IMPORT',payloadHash:fingerprint,result}});
        },{timeout:90_000,maxWait:10_000});
      }catch(error){for(const file of evidence)await store.remove(file.storageKey);throw error;}
    }
    if(row.index%50===0)options.progress?.(row.index);
  }
  return verifyDemo(prisma,rows);
}

async function verifyIdentity(prisma:PrismaService,row:DemoCustomer){
  const customer=await prisma.customer.findUniqueOrThrow({where:{id:row.customerId}});
  if(customer.phone!==row.phone||customer.name!==row.name||customer.email!==row.email||customer.addressLine!==row.addressLine||customer.city!==row.city||customer.pincode!==row.pincode)fail('DEMO_CUSTOMER_IDENTITY_CONFLICT');
  const enquiry=await prisma.enquiry.findUnique({where:{id:row.enquiryId},select:{customerId:true}});
  if(enquiry?.customerId!==row.customerId)fail('DEMO_ENQUIRY_IDENTITY_CONFLICT');
}

export async function verifyDemo(prisma:PrismaService,providedRows?:DemoCustomer[]){
  const saved=await prisma.command.findUniqueOrThrow({where:{id:DATASET_ID}}),seed=saved.result as {anchor:string};
  const rows=providedRows??buildManifest(seed.anchor),summary=manifestSummary(rows);
  for(const row of rows)await verifyIdentity(prisma,row);
  const tables=await prisma.$queryRaw<{name:string;identifier:string}[]>`SELECT tablename AS name,quote_ident(tablename) AS identifier FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const counts:Record<string,number>={};
  for(const table of tables){
    const [result]=await prisma.$queryRawUnsafe<{count:bigint}[]>(`SELECT count(*) AS count FROM public.${table.identifier}`);
    counts[table.name]=Number(result!.count);
  }
  if(counts.customers!==450)fail('DEMO_CUSTOMER_COUNT_MISMATCH');
  for(const [table,minimum]of Object.entries({enquiries:450,surveys:270,quotes:200,orders:145,jobs:145,invoices:145,service_tickets:15}))if((counts[table]??0)<minimum)fail(`DEMO_HISTORY_INCOMPLETE:${table}`);
  const financialErrors=await prisma.$queryRaw<{id:string}[]>`SELECT i.id FROM invoices i
    WHERE i."paidAmount" <> COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p."invoiceId"=i.id),0)
    OR i.subtotal <> COALESCE((SELECT SUM(l."lineTotal") FROM invoice_lines l WHERE l."invoiceId"=i.id),0)
    OR i.total<>i.subtotal+i."taxAmount" OR i."paidAmount">i.total`;
  if(financialErrors.length)fail('DEMO_FINANCIAL_RECONCILIATION_FAILED');
  const stock=await new StockIntegrityService(prisma).report();
  if(!stock.data.ok)fail(`DEMO_STOCK_INTEGRITY_FAILED:${stock.data.checks.filter(c=>c.count).map(c=>c.code).join(',')}`);
  const costErrors=await prisma.$queryRaw<{id:string}[]>`SELECT c.id FROM cost_entries c
    LEFT JOIN stock_movements m ON c."uniqueSourceId"='STOCK_MOVEMENT:'||m.id::text
    WHERE c."costType"='MATERIAL_DISPATCH' AND (m.id IS NULL OR m."occurredAt"<>c."occurredAt")`;
  if(costErrors.length)fail('DEMO_COST_SOURCE_RECONCILIATION_FAILED');
  // Independent expected amounts come from the immutable source manifest, not report SQL.
  let expectedInvoiced=new Prisma.Decimal(0),expectedReceived=new Prisma.Decimal(0),expectedMaterial=new Prisma.Decimal(0);
  for(const row of rows.filter(r=>hasOrder(r.stage))){
    const kit=demoPackages.find(p=>p.data.id===catalogueDemoId((row.systemType==='ON_GRID'?1000:2000)+row.capacityKw))!;
    const total=new Prisma.Decimal(String(kit.data.hardwarePrice)).add(String(kit.data.installationPrice));
    expectedInvoiced=expectedInvoiced.add(total);
    if(!(row.stage==='ORDER'&&row.index%3===0))expectedReceived=expectedReceived.add(row.stage==='COMPLETED'||row.index%4===0?total:total.mul('0.30').toDecimalPlaces(2));
    if(!['ORDER','RESERVED'].includes(row.stage))for(const item of kit.items){
      const product=demoProducts.find(p=>p.id===item.productId)!;
      expectedMaterial=expectedMaterial.add(new Prisma.Decimal(String(product.unitSalePrice)).mul('0.50').toDecimalPlaces(2).mul(String(item.quantity)).toDecimalPlaces(2));
    }
  }
  const orderIds=rows.filter(r=>hasOrder(r.stage)).map(r=>demoId(`DEMO450-${r.index}:order`));
  const originalInvoices=await prisma.invoice.aggregate({where:{sourceType:'ORDER',sourceId:{in:orderIds}},_sum:{total:true}});
  const originalPayments=await prisma.payment.aggregate({where:{reference:{startsWith:'SAMPLE-450-'}},_sum:{amount:true}});
  // Accounts may have pre-existing IDs from seed:staff; derive actual immutable time sources from imported jobs.
  const seededTimes=await prisma.installationTimeRecord.findMany({where:{jobId:{in:rows.filter(r=>r.stage==='COMPLETED').map(r=>r.jobId)}},select:{id:true}});
  const timeIds=seededTimes.map(t=>t.id);
  const [originalCosts]=await prisma.$queryRaw<{material:Prisma.Decimal;labour:Prisma.Decimal}[]>`SELECT
    (SELECT COALESCE(SUM(c.amount),0) FROM cost_entries c JOIN stock_movements m ON c."uniqueSourceId"='STOCK_MOVEMENT:'||m.id::text
      JOIN stock_document_lines l ON l.id=m."documentLineId" JOIN stock_documents d ON d.id=l."documentId"
      WHERE c."costType"='MATERIAL_DISPATCH' AND d.reference LIKE 'DEMO450-HISTORY:%') AS material,
    (SELECT COALESCE(SUM(c.amount),0) FROM cost_entries c JOIN installation_labour_approvals a ON a."costEntryId"=c.id WHERE a."timeRecordId"=ANY(${timeIds}::uuid[])) AS labour`;
  const expectedLabour=new Prisma.Decimal(60*2*8*300);
  if(!originalInvoices._sum.total?.equals(expectedInvoiced)||!originalPayments._sum.amount?.equals(expectedReceived)||
    !originalCosts!.material.equals(expectedMaterial)||!originalCosts!.labour.equals(expectedLabour))fail('DEMO_MANIFEST_ORACLE_MISMATCH');
  const store=new PrivateFileStore();
  for(const file of await prisma.file.findMany())await store.read(file.storageKey,file.sizeBytes,file.sha256);
  const warranty=new WarrantyService(new PersistedWarrantyEquipmentReader(prisma),new ValidatedWarrantyReader(prisma));
  const covered=await warranty.lookup({serial:'INV-ACTIVE-2025-01'}),expired=await warranty.lookup({serial:'BAT-EXPIRED-2024-09'});
  const tickets=await prisma.serviceTicket.findMany({where:{id:{in:['d4510000-0000-4000-8000-000000000051','d4510000-0000-4000-8000-000000000052']}}});
  const intake=[];
  for(const ticket of tickets)intake.push(await warranty.evaluateWarranty(ticket.unitId,ticket.createdAt,'Component replacement'));
  if(intake.length!==2||!intake.some(r=>r.coverageStatus==='COVERED')||!intake.some(r=>r.coverageStatus==='EXPIRED'))fail('DEMO_WARRANTY_SCENARIOS_INVALID');
  const [financial]=await prisma.$queryRaw<{invoiced:string;received:string;outstanding:string;actualCost:string}[]>`SELECT
    (SELECT COALESCE(SUM(total),0)::text FROM invoices) AS invoiced,
    (SELECT COALESCE(SUM(amount),0)::text FROM payments) AS received,
    (SELECT COALESCE(SUM(total-"paidAmount"),0)::text FROM invoices) AS outstanding,
    (SELECT COALESCE(SUM(amount),0)::text FROM cost_entries) AS "actualCost"`;
  const completed=await prisma.job.count({where:{status:'COMPLETED'}});
  if(completed<60)fail('DEMO_COMPLETED_HISTORY_INCOMPLETE');
  return { ...summary,persisted:true,verifiedAt:new Date().toISOString(),actual:{customers:counts.customers,completedJobs:completed,counts,
    applicationRows:Object.entries(counts).filter(([name])=>name!=='_prisma_migrations').reduce((sum,[,n])=>sum+n,0)},
    reconciliation:{financial,initialDatasetOracle:{invoiced:expectedInvoiced.toFixed(2),received:expectedReceived.toFixed(2),outstanding:expectedInvoiced.sub(expectedReceived).toFixed(2),
      materialCost:expectedMaterial.toFixed(2),installationLabour:expectedLabour.toFixed(2),matched:true},financialErrors:0,costSourceErrors:0,stock:stock.data,privateFilesVerified:counts.files,
      warrantyAtIntake:intake.map(r=>({serial:r.serial,status:r.coverageStatus})),warrantyToday:[covered.data.assessment,expired.data.assessment].map(r=>({serial:r.serial,status:r.coverageStatus}))},
    limitations:['All identities, transactions and evidence are synthetic demo data.','Historical dispatch serials were imported as TYPED; no physical scanner acceptance is claimed.',
      'Physical service repair/replacement remains subject to the existing production adapter gates.'] };
}

export async function main(args=process.argv.slice(2)){
  config({path:resolve(repository,'.env'),quiet:true});
  if(args.some(arg=>arg!=='--preview'&&arg!=='--verify-only'&&!/^--anchor=/.test(arg)))fail('DEMO_INVALID_ARGUMENT');
  const anchor=args.find(a=>a.startsWith('--anchor='))?.slice(9);
  if(args.includes('--preview')){
    const rows=buildManifest(anchor);console.log(JSON.stringify({...manifestSummary(rows),persisted:false,samples:[rows[0],rows[200],rows[357],rows[380],rows[390],rows[440]]},null,2));return;
  }
  const writing=!args.includes('--verify-only');assertDemoTarget(process.env,writing);
  const sql=new Client({connectionString:process.env.DATABASE_URL}),prisma=new PrismaService();
  try{
    await sql.connect();
    const {rows:[database]}=await sql.query('SELECT current_database() AS name');
    if(database.name!==process.env.DEMO_DATABASE_NAME)fail('DEMO_TARGET_MISMATCH');
    // Dedicated connection retains this session lock through every scenario transaction.
    await sql.query('SELECT pg_advisory_lock(450,0)');
    const report=writing?await seedDemo(prisma,{anchor,password:process.env.DEMO_STAFF_PASSWORD!,progress:n=>console.log(`Verified/imported ${n}/450 synthetic customers`)}):await verifyDemo(prisma);
    const reportDir=resolve(repository,'var/demo450');await mkdir(reportDir,{recursive:true});
    await writeFile(resolve(reportDir,'verification.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({customers:report.actual.customers,applicationRows:report.actual.applicationRows,completedJobs:report.actual.completedJobs,
      anchor:report.anchor,report:'var/demo450/verification.json',verified:true}));
  }finally{await prisma.$disconnect();await sql.end();}
}
if(require.main===module)main().catch(error=>{
  // Driver errors can contain connection details or contact data. Never dump them.
  const message=error instanceof Error&&/^DEMO_[A-Z_]+/.test(error.message)?error.message.split('\n')[0]:'DEMO_SEED_FAILED: import stopped; no effects from the failed customer committed. Inspect the local verification logs.';
  console.error(message);process.exitCode=1;
});
