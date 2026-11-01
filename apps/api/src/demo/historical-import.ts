import type { StaffIdentity } from '@sunshine/contracts';
import { Prisma, type File as FileRow } from '../generated/prisma/client';
import { PrismaService } from '../platform/prisma.service';
import { IdempotencyService } from '../platform/idempotency';
import { CatalogService } from '../catalog/catalog.service';
import { catalogueDemoId } from '../catalog/demo-catalogue';
import { SurveysService } from '../sales/surveys.service';
import { QuotesService } from '../quotes/quotes.service';
import { PrismaQuoteWarrantyPolicyReader } from '../warranty/quote-warranty-policy.reader';
import { activateFromDelivery, addCalendarMonths } from '../warranty/warranty-activation';
import { InvoicesService } from '../finance/invoices.service';
import { CostWriterService } from '../finance/cost-writer.service';
import { StockLedgerService } from '../inventory/stock-ledger.service';
import { AllocationsService } from '../inventory/allocations.service';
import { JobsService } from '../field/jobs.service';
import { LabourService } from '../labour/labour.service';
import { at, demoId, hasAllocation, hasDelivery, hasOrder, hasQuote, offset, type DemoCustomer } from './manifest';
import { createHash } from 'node:crypto';

export interface DemoStaff { admin: StaffIdentity; sales: StaffIdentity; warehouse: StaffIdentity; support: StaffIdentity; technicians: StaffIdentity[] }
export type Evidence = Pick<FileRow,'storageKey'|'originalName'|'mediaType'|'sizeBytes'|'sha256'>;

/** Services used during import share exactly the caller's transaction, including command records.
 * No production request receives this facade, and no independent nested transaction commits. */
export function transactionServices(tx: Prisma.TransactionClient) {
  return new Proxy(tx, { get(target, key) {
    if (key === '$transaction') return async (work: (client: Prisma.TransactionClient) => Promise<unknown>) => work(tx);
    const value = Reflect.get(target,key);
    return typeof value === 'function' ? value.bind(target) : value;
  } }) as PrismaService;
}

/** A restricted offline import, not a public command or a physical-scanner attestation.
 * SQL guards remain enabled. Historical occurrence dates are set before facts freeze.
 * Receipts and issues use the one stock ledger; invoices and payments use D2;
 * material/labour costs use D4; actual delivery activates frozen warranty terms. */
export class HistoricalDemoImporter {
  constructor(private readonly staff: DemoStaff, private readonly locationId: string) {}

  async customer(tx: Prisma.TransactionClient, row: DemoCustomer, evidence: Evidence[]) {
    const client = transactionServices(tx), commands = new IdempotencyService(client);
    const invoices = new InvoicesService(client), ledger = new StockLedgerService(), costs = new CostWriterService();
    const catalog = new CatalogService(client), surveys = new SurveysService(client);
    const quotes = new QuotesService(client,catalog,surveys,new PrismaQuoteWarrantyPolicyReader());
    const crew = row.technicianIndexes.map(n=>this.staff.technicians[n]!);
    const key = `DEMO450-${row.index}`, orderId = demoId(`${key}:order`), surveyId = demoId(`${key}:survey`);
    const packageId = catalogueDemoId((row.systemType==='ON_GRID' ? 1000 : 2000)+row.capacityKw);
    await tx.customer.create({ data: { id:row.customerId, name:row.name,phone:row.phone,email:row.email,
      addressLine:row.addressLine,city:row.city,pincode:row.pincode,createdAt:row.enquiryAt } });
    const qualified = row.stage !== 'NEW';
    await tx.enquiry.create({ data: { id:row.enquiryId,customerId:row.customerId,source:row.source,status:qualified?'QUALIFIED':'NEW',
      contactName:row.name,contactEmail:row.email,siteAddressLine:row.addressLine,siteCity:row.city,sitePincode:row.pincode,
      requestedCapacityKw:row.capacityKw,systemType:row.systemType,subsidyInterest:row.systemType==='ON_GRID' && row.index%3===0,
      message:`Synthetic demo enquiry ${row.index}. ${['Roof renovation completed; seeking a site visit.','Comparing solar options to reduce the monthly electricity bill.','Backup required for outages; please explain battery maintenance.','Family approval pending; follow up next week.'][row.index%4]}`,
      ownerId:qualified||row.index%2===0?this.staff.sales.id:null,createdAt:row.enquiryAt,
      ...(qualified?{shadowFreeRoofAreaSqm:String(row.capacityKw*9+10),monthlyBillInr:String(row.capacityKw*1400+700),
        gridConnectionSuitable:row.systemType==='ON_GRID',nextFollowUpAt:offset(at(row.anchor,10),row.index%14+1)}:{}),
    } });
    if (['NEW','QUALIFIED'].includes(row.stage)) return {customerId:row.customerId,enquiryId:row.enquiryId};
    const status = row.stage==='SURVEY_SCHEDULED'?'SCHEDULED':row.stage==='SURVEY_SUBMITTED'?'SUBMITTED':row.stage==='SURVEY_REJECTED'?'REJECTED':'APPROVED';
    await tx.survey.create({data:{id:surveyId,enquiryId:row.enquiryId,revision:1,status,technicianId:crew[0]!.id,
      scheduledFor:status==='SCHEDULED'?offset(at(row.anchor,10),row.index%10+1):row.surveyAt,createdAt:offset(row.surveyAt,-2),
      ...(status!=='SCHEDULED'?{roofDirection:row.index%4===0?'SW':'S',roofTiltDeg:String(12+row.index%15),
        cableDistanceM:String(15+row.capacityKw*5+row.index%7),usableRoofAreaSqm:String(row.capacityKw*9+10),
        notes:status==='REJECTED'?'Synthetic site: afternoon shading requires a revised layout.':'Synthetic measured site: clear roof section, accessible meter and earthing route.',submittedAt:offset(row.surveyAt,1)}:{}),
      ...(['APPROVED','REJECTED'].includes(status)?{decidedAt:offset(row.surveyAt,2),decidedById:this.staff.sales.id}:{}),
      ...(status==='REJECTED'?{decisionReason:'Roof shade/access issue: revise the design and resurvey before quoting.'}:{})}});
    if(!hasQuote(row.stage)) return {customerId:row.customerId,enquiryId:row.enquiryId,surveyId};
    const draft = await quotes.importDraft(tx,row.enquiryId,{surveyId,packageId},this.staff.sales,{id:demoId(`${key}:quote`),createdAt:row.quoteAt});
    if(row.stage==='QUOTE_DRAFT') return {customerId:row.customerId,quoteId:draft.id};
    await tx.quote.update({where:{id:draft.id},data:{status:'SENT',sentAt:offset(row.quoteAt,1),sentChannel:'PRINT',sentById:this.staff.sales.id,version:{increment:1}}});
    if(row.stage==='QUOTE_SENT') return {customerId:row.customerId,quoteId:draft.id};
    await tx.quote.update({where:{id:draft.id},data:{status:row.stage==='QUOTE_REJECTED'?'REJECTED':'ACCEPTED',decidedAt:offset(row.quoteAt,2),
      decidedById:this.staff.sales.id,version:{increment:1},...(row.stage==='QUOTE_REJECTED'?{decisionReason:'Customer postponed purchase while arranging the budget.'}:
        {acceptedByName:row.name,decisionChannel:'IN_PERSON',decisionReference:`SAMPLE-ACCEPT-${row.index}`})}});
    if(!hasOrder(row.stage)) return {customerId:row.customerId,quoteId:draft.id};
    const quote = await quotes.requireAcceptedQuote(tx,draft.id);
    const order = await tx.order.create({data:{id:orderId,quoteId:quote.id,enquiryId:row.enquiryId,customerId:row.customerId,
      confirmedById:this.staff.sales.id,confirmedAt:row.orderAt,createdAt:row.orderAt,
      packing:{create:quote.lines.filter(l=>l.kind==='COMPONENT').map(l=>({quoteLineId:l.id,productId:l.productId!,quantity:l.quantity}))}}});
    await tx.job.create({data:{id:row.jobId,orderId,createdAt:row.orderAt}});
    await new JobsService(client).ensureJob(tx,{orderId,enquiryId:row.enquiryId,customerId:row.customerId,quoteId:quote.id,capacityKw:row.capacityKw,systemType:row.systemType});
    await tx.order.update({where:{id:orderId},data:{jobId:row.jobId}});
    const invoice = await invoices.ensureSalesInvoice(tx,order,quote,{postedAt:row.orderAt});
    const total = new Prisma.Decimal(invoice.total), unpaid = row.stage==='ORDER' && row.index%3===0;
    if(!unpaid){
      const advance=total.mul('0.30').toDecimalPlaces(2);
      await invoices.recordPayment(tx,invoice.id,{amountInr:advance.toFixed(2),method:row.index%2?'UPI':'BANK_TRANSFER',
        reference:`SAMPLE-450-${row.index}-ADV`,receivedAt:offset(row.orderAt,1).toISOString()},this.staff.sales);
      if(row.stage==='COMPLETED' || row.index%4===0) await invoices.recordPayment(tx,invoice.id,{amountInr:total.sub(advance).toFixed(2),method:'BANK_TRANSFER',
        reference:`SAMPLE-450-${row.index}-FINAL`,receivedAt:offset(row.orderAt,4).toISOString()},this.staff.sales);
    }
    const schedule = ['ORDER','RESERVED'].includes(row.stage)?offset(at(row.anchor,8),row.index-305):row.startedAt;
    await tx.job.update({where:{id:row.jobId},data:{scheduledStart:schedule,scheduledFinish:offset(schedule,1),version:{increment:1}}});
    await tx.jobAssignment.createMany({data:crew.map(t=>({jobId:row.jobId,technicianId:t.id,assignedById:this.staff.sales.id,createdAt:row.orderAt}))});
    if(!hasAllocation(row.stage))return {customerId:row.customerId,orderId,jobId:row.jobId};
    const kit=await catalog.getPackageFacts(tx,packageId);
    const units=await this.receive(tx,row,kit.items.map(i=>({product:i.product,quantity:i.quantity})),ledger);
    const job=await tx.job.findUniqueOrThrow({where:{id:row.jobId}});
    await new AllocationsService(client,commands,ledger,invoices).allocateOrder(this.staff.warehouse.id,`${key}-allocate`,orderId,{expectedVersion:job.version,unitIds:units});
    const dispatch=await tx.dispatch.create({data:{id:demoId(`${key}:dispatch`),orderId,createdById:this.staff.warehouse.id,createdAt:row.dispatchAt}});
    const allocated=await tx.allocation.findMany({where:{jobId:row.jobId},include:{unit:true,product:true},orderBy:{id:'asc'}});
    // Historical manually entered serials. Never claim these records tested hardware.
    await tx.dispatchScan.createMany({data:allocated.filter(a=>a.unit).map(a=>({dispatchId:dispatch.id,allocationId:a.id,
      rawValue:a.unit!.rawSerial,normalizedSerial:a.unit!.normalizedSerial,method:'TYPED',actorId:this.staff.warehouse.id,recordedAt:new Date()}))});
    if(row.stage==='RESERVED')return {customerId:row.customerId,orderId,jobId:row.jobId,dispatchId:dispatch.id};
    const issue=await tx.stockDocument.create({data:{id:demoId(`${key}:issue`),kind:'ISSUE',reference:`DEMO450-HISTORY:${row.index}`,
      payloadHash:createHash('sha256').update(key).digest('hex'),actorId:this.staff.warehouse.id,fromLocationId:this.locationId,occurredAt:row.dispatchAt}});
    for(const [n,a] of allocated.entries())await tx.stockDocumentLine.create({data:{id:demoId(`${key}:issue-line:${n}`),documentId:issue.id,lineNumber:n+1,productId:a.productId,quantity:a.quantity}});
    await tx.stockDocument.update({where:{id:issue.id},data:{status:'DONE',validatedAt:new Date(),validatedById:this.staff.warehouse.id,version:{increment:1}}});
    for(const [n,a] of allocated.entries()){
      const movement=await ledger.post(tx,{documentLineId:demoId(`${key}:issue-line:${n}`),productId:a.productId,fromLocationId:this.locationId,quantity:a.quantity,actorId:this.staff.warehouse.id,occurredAt:row.dispatchAt});
      if(a.unitId){await tx.unitMovement.create({data:{unitId:a.unitId,movementId:movement.id}});await tx.unit.update({where:{id:a.unitId},data:{status:'DISPATCHED',version:{increment:1}}});}
      const basis=await tx.productCostBasis.findUnique({where:{productId:a.productId}});
      const amount=a.unit?a.unit.acquisitionCost:a.quantity.mul(basis!.averageCost).toDecimalPlaces(2);
      await costs.postCost(tx,{uniqueSourceId:`STOCK_MOVEMENT:${movement.id}`,jobId:row.jobId,costType:'MATERIAL_DISPATCH',amount:amount.toFixed(2),
        description:`${a.product.name} dispatched for order ${orderId}`,occurredAt:row.dispatchAt.toISOString()});
    }
    await tx.allocation.updateMany({where:{jobId:row.jobId},data:{status:'DISPATCHED',version:{increment:1}}});
    await tx.dispatch.update({where:{id:dispatch.id},data:{status:'DISPATCHED',issueDocumentId:issue.id,dispatchedAt:row.dispatchAt,dispatchedById:this.staff.warehouse.id,version:{increment:1}}});
    if(!hasDelivery(row.stage))return {customerId:row.customerId,orderId,jobId:row.jobId,dispatchId:dispatch.id};
    await tx.allocation.updateMany({where:{jobId:row.jobId},data:{status:'DELIVERED',version:{increment:1}}});
    await tx.unit.updateMany({where:{id:{in:units}},data:{status:'DELIVERED',version:{increment:1}}});
    await tx.dispatch.update({where:{id:dispatch.id},data:{status:'DELIVERED',deliveredAt:row.deliveredAt,deliveredById:this.staff.warehouse.id,version:{increment:1}}});
    if(row.special){
      const suffix=row.special==='covered'?'1':'2',unitId=`d4510000-0000-4000-8000-00000000003${suffix}`;
      const allocation=allocated.find(a=>a.unitId===unitId)!;
      const line=quote.lines.find(l=>l.id===allocation.quoteLineId)!;
      const policy=line.warrantyPolicySnapshot!;
      await tx.warranty.create({data:{id:`d4510000-0000-4000-8000-00000000004${suffix}`,unitId,startDate:new Date(`${row.deliveryDay}T00:00:00Z`),
        expiryDate:new Date(`${addCalendarMonths(row.deliveryDay,policy.durationMonths)}T00:00:00Z`),policyName:policy.policyName,policyRevision:policy.revision,scope:policy.scope,durationMonths:policy.durationMonths}});
    }
    await activateFromDelivery(tx,{jobId:row.jobId,deliveredAt:row.deliveredAt});
    if(row.stage==='DELIVERED')return {customerId:row.customerId,orderId,jobId:row.jobId,dispatchId:dispatch.id};
    await tx.job.update({where:{id:row.jobId},data:{status:'IN_PROGRESS',startedAt:row.startedAt,startedById:crew[0]!.id,version:{increment:1}}});
    if(row.stage==='IN_PROGRESS')return {customerId:row.customerId,orderId,jobId:row.jobId,dispatchId:dispatch.id};
    if(evidence.length!==2)throw Error('DEMO_EVIDENCE_REQUIRED');
    const files=[];
    for(const [n,item]of evidence.entries())files.push(await tx.file.create({data:{...item,id:demoId(`${key}:file:${n}`),contextType:'JOB',contextId:row.jobId,uploadedById:crew[0]!.id}}));
    await tx.jobPhoto.create({data:{jobId:row.jobId,fileId:files[0]!.id,position:1}});
    for(const t of crew)await tx.installationTimeRecord.create({data:{id:demoId(`${key}:time:${t.id}`),jobId:row.jobId,technicianId:t.id,startedAt:row.startedAt,finishedAt:row.finishedAt,recordedById:t.id}});
    await tx.job.update({where:{id:row.jobId},data:{status:'COMPLETED',finishedAt:row.finishedAt,completedAt:row.finishedAt,completedById:crew[0]!.id,
      installedCapacityKw:row.capacityKw,signatureFileId:files[1]!.id,signerName:`${row.name} (synthetic sample)`,completedChecks:['MOUNTING','PANELS','WIRING','EARTHING','POWER_GENERATION',...(row.systemType==='OFF_GRID'?['BATTERY' as const]:[])],version:{increment:1}}});
    await tx.allocation.updateMany({where:{jobId:row.jobId},data:{status:'INSTALLED',version:{increment:1}}});
    await tx.unit.updateMany({where:{id:{in:units}},data:{status:'INSTALLED',version:{increment:1}}});
    for(const t of crew)await new LabourService(client,commands,costs).approve(this.staff.admin.id,`${key}-labour-${t.id}`,demoId(`${key}:time:${t.id}`),
      {rateRevisionId:demoId(`rate:${t.id}`),note:'Approved synthetic historical installation hours; no payroll transfer implied.'});
    if(row.service){
      const target=allocated.find(a=>a.product.category===(row.special==='expired'?'BATTERY':'INVERTER'))!;
      await tx.$queryRaw`SELECT set_config('sunshine.actor_id',${this.staff.support.id},true)`;
      const suffix=row.special==='covered'?'1':'2';
      await tx.serviceTicket.create({data:{id:row.special?`d4510000-0000-4000-8000-00000000005${suffix}`:demoId(`${key}:ticket`),
        ticketNumber:row.special?`DEMO-D4-${row.special==='covered'?'SHARMA-COVERED':'VERMA-EXPIRED'}-001`:`DEMO450-SVC-${row.index}`,customerId:row.customerId,jobId:row.jobId,unitId:target.unitId!,
        createdAt:at(new Date(offset(at(row.anchor,8),-1)).toISOString().slice(0,10),17),faultDescription:row.special==='covered'?'ERR-04: Ground fault. Synthetic rainy-season complaint.':row.special==='expired'?'Battery fails to hold charge. Synthetic expired-coverage complaint.':
          ['Intermittent inverter fault after rain; inspect component before assigning coverage.','Generation display is blank; investigate wiring and inverter.','Lower output reported; check shade and equipment diagnostics.'][row.index%3]!}});
    }
    if(row.systemType==='ON_GRID'&&row.index%5===0)await tx.subsidyMilestone.create({data:{id:demoId(`${key}:subsidy`),jobId:row.jobId,
      stage:'Sample document review',status:'PENDING',amount:'0.00',pendingDocuments:['Customer identity sample','Electricity bill sample'],responsibleOwnerId:this.staff.sales.id}});
    return {customerId:row.customerId,orderId,jobId:row.jobId,dispatchId:dispatch.id};
  }

  private async receive(tx:Prisma.TransactionClient,row:DemoCustomer,items:{product:{id:string;trackingMode:string;manufacturerId:string|null;unitSalePrice:string;category:string};quantity:string}[],ledger:StockLedgerService){
    const key=`DEMO450-${row.index}`,occurredAt=offset(row.orderAt,-1),unitIds:string[]=[];
    await ledger.lockProducts(tx,items.map(i=>i.product.id));
    const receipt=await tx.stockDocument.create({data:{id:demoId(`${key}:receipt`),kind:'RECEIPT',reference:`DEMO450-RECEIPT-${row.index}`,payloadHash:createHash('sha256').update(key).digest('hex'),actorId:this.staff.warehouse.id,toLocationId:this.locationId,occurredAt}});
    for(const[n,item]of items.entries())await tx.stockDocumentLine.create({data:{id:demoId(`${key}:receipt-line:${n}`),documentId:receipt.id,lineNumber:n+1,productId:item.product.id,quantity:item.quantity,unitCost:new Prisma.Decimal(item.product.unitSalePrice).mul('0.50').toDecimalPlaces(2)}});
    await tx.stockDocument.update({where:{id:receipt.id},data:{status:'DONE',validatedAt:new Date(),version:{increment:1}}});
    for(const[n,item]of items.entries()){
      const cost=new Prisma.Decimal(item.product.unitSalePrice).mul('0.50').toDecimalPlaces(2);
      const movement=await ledger.post(tx,{documentLineId:demoId(`${key}:receipt-line:${n}`),productId:item.product.id,toLocationId:this.locationId,quantity:new Prisma.Decimal(item.quantity),actorId:this.staff.warehouse.id,occurredAt});
      if(item.product.trackingMode==='SERIALIZED'){
        for(let serialIndex=0;serialIndex<Number(item.quantity);serialIndex++){
          const special=row.special&&((row.special==='covered'&&item.product.category==='INVERTER')||(row.special==='expired'&&item.product.category==='BATTERY'));
          const suffix=row.special==='covered'?'1':'2';
          const id=special?`d4510000-0000-4000-8000-00000000003${suffix}`:demoId(`${key}:unit:${n}:${serialIndex}`);
          const rawSerial=special?(row.special==='covered'?'INV-ACTIVE-2025-01':'BAT-EXPIRED-2024-09'):`DEMO450-${row.index}-${n}-${serialIndex+1}`;
          await tx.unit.create({data:{id,productId:item.product.id,manufacturerId:item.product.manufacturerId!,rawSerial,normalizedSerial:rawSerial,acquisitionCost:cost,receiptLineId:demoId(`${key}:receipt-line:${n}`)}});
          await tx.unitMovement.create({data:{unitId:id,movementId:movement.id}});unitIds.push(id);
        }
      }else{
        const existing=await tx.productCostBasis.findUnique({where:{productId:item.product.id}});
        if(existing&&!existing.averageCost.equals(cost))throw Error('DEMO_COST_COLLISION: reserved historical product cost changed');
        if(!existing)await tx.productCostBasis.create({data:{productId:item.product.id,averageCost:cost}});
      }
    }
    return unitIds;
  }
}
