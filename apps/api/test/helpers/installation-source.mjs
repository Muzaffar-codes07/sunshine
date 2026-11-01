import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
const require=createRequire(new URL('../../package.json',import.meta.url));
const {catalogueDemoId:id}=require('./dist/catalog/demo-catalogue');
const {SurveysService}=require('./dist/sales/surveys.service'),{QuotesService}=require('./dist/quotes/quotes.service');
const {OrdersService}=require('./dist/orders/orders.service'),{InvoicesService}=require('./dist/finance/invoices.service');
const {IdempotencyService}=require('./dist/platform/idempotency'),{JobsService}=require('./dist/field/jobs.service');
const {InstallationService}=require('./dist/field/installation.service'),{FilesService}=require('./dist/files/files.service');

// Real domain services and HTTP stock writes; no fabricated outcome or moved production clock.
export function installationFixture({app,prisma,staff,main,send,ok,actor,post:directPost}) {
  let fixtureCounter=0;
  const post=directPost??((path,body,status=200)=>ok(send(path,body),status));
  const version=async jobId=>(await prisma.job.findUniqueOrThrow({where:{id:jobId}})).version;
  return async function completeRealInstallation(){
  const customer=await prisma.customer.create({data:{name:'Labour Source Customer',phone:'7'+String(randomInt(1e9)).padStart(9,'0'),addressLine:'1 Wage Road',city:'Nagpur',pincode:'440001'}});
  const enquiry=await prisma.enquiry.create({data:{customerId:customer.id,source:'PHONE',status:'QUALIFIED',requestedCapacityKw:1,contactName:customer.name,siteAddressLine:customer.addressLine,siteCity:customer.city,sitePincode:customer.pincode}});
  const surveys=app.get(SurveysService),quotes=app.get(QuotesService);
  const survey=(await surveys.schedule(enquiry.id,{technicianId:staff.TECHNICIAN.id,scheduledFor:new Date(Date.now()+86400000).toISOString()})).data;
  await surveys.submit(survey.id,{version:1,roofDirection:'S',roofTiltDeg:'18.5',cableDistanceM:'22.00',usableRoofAreaSqm:'30.00'},actor('TECHNICIAN'));
  await surveys.approve(survey.id,{version:2},actor('SALES'));
  const quote=(await quotes.create(enquiry.id,{surveyId:survey.id,packageId:id(1001)},actor('SALES'))).data;
  await quotes.send(quote.id,{version:1,channel:'PRINT'},actor('SALES'));await quotes.accept(quote.id,{version:2,acceptedByName:customer.name,channel:'IN_PERSON'},actor('SALES'));
  const order=(await app.get(OrdersService).confirm({quoteId:quote.id},randomUUID(),actor('SALES'))).data;
  const payment={amountInr:'1000.00',method:'UPI',reference:randomUUID(),receivedAt:new Date().toISOString()};
  await app.get(IdempotencyService).run({actorId:staff.ADMIN.id,key:randomUUID(),action:'PAYMENT_RECEIPT',payload:payment},tx=>app.get(InvoicesService).recordPayment(tx,order.invoice.id,payment,actor('ADMIN')));
  for(const line of order.packing){
    const product=await prisma.product.findUniqueOrThrow({where:{id:line.productId}});
    await post('/stock/receipts',{reference:'LAB-'+randomUUID(),locationId:main.id,receivedAt:new Date().toISOString(),lines:[{productId:line.productId,quantity:line.quantity,unitCost:'10.00',serials:product.trackingMode==='SERIALIZED'?Array.from({length:Number(line.quantity)},()=> 'L-'+randomUUID()):[]}]},201);
  }
  await post(`/orders/${order.id}/allocations`,{expectedVersion:await version(order.jobId)},201);
  const draft=await post(`/orders/${order.id}/dispatches`,{expectedVersion:await version(order.jobId)},201);
  for(const row of await prisma.allocation.findMany({where:{jobId:order.jobId,unitId:{not:null}},include:{unit:true}})) await post(`/dispatches/${draft.id}/scans`,{rawValue:row.unit.rawSerial,method:'SCANNER',unitId:row.unitId},201);
  const header=await prisma.dispatch.findUniqueOrThrow({where:{id:draft.id}});
  const posted=await post(`/dispatches/${draft.id}/dispatch`,{expectedVersion:header.version});
  await post(`/dispatches/${draft.id}/deliver`,{expectedVersion:posted.version,deliveredAt:new Date().toISOString()});
  const scheduled=Date.now()+86400000+(fixtureCounter++)*7200000;
  await app.get(JobsService).schedule(order.jobId,{expectedVersion:await version(order.jobId),scheduledStart:new Date(scheduled).toISOString(),scheduledFinish:new Date(scheduled+3600000).toISOString(),technicianIds:[staff.TECHNICIAN.id]},actor('ADMIN'));
  const startedAt=new Date().toISOString();
  await app.get(InstallationService).start(actor('ADMIN'),randomUUID(),order.jobId,{expectedVersion:await version(order.jobId),startedAt});
  const files=[];const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUi5rGwMDAxMDAwMDAAAAMWgESNbkt0AAAAABJRU5ErkJggg==','base64');
  for(const name of ['roof.png','signature.png']) files.push((await app.get(FilesService).upload({buffer:png,size:png.length,mimetype:'image/png',originalname:name},{contextType:'JOB',contextId:order.jobId},actor('ADMIN'))).data.id);
  const finishedAt=new Date().toISOString();
  await app.get(InstallationService).complete(actor('ADMIN'),randomUUID(),order.jobId,{expectedVersion:await version(order.jobId),startedAt,finishedAt,installedCapacityKw:1,photoFileIds:[files[0]],signatureFileId:files[1],signerName:customer.name,completedChecks:['MOUNTING','PANELS','WIRING','EARTHING','POWER_GENERATION'],timeRecords:[{technicianId:staff.TECHNICIAN.id,startedAt,finishedAt}]});
  return prisma.installationTimeRecord.findFirstOrThrow({where:{jobId:order.jobId}});
};
}

// Direct domain-service variant for isolated invoice/migration suites without an HTTP listener.
// Business results are produced by the actual writers; no response/status or success fixture is fabricated.
export function installationCommands(app,actorId){
  const {StockReceiptsService}=require('./dist/inventory/stock-receipts.service');
  const {AllocationsService}=require('./dist/inventory/allocations.service');
  const {DispatchScansService}=require('./dist/inventory/dispatch-scans.service');
  const {DispatchPostingService}=require('./dist/inventory/dispatch-posting.service');
  return async(path,body)=>{
    const key=randomUUID();let result;
    if(path==='/stock/receipts') result=await app.get(StockReceiptsService).receive(actorId,key,body);
    else if(/^\/orders\/[^/]+\/allocations$/.test(path)) result=await app.get(AllocationsService).allocateOrder(actorId,key,path.split('/')[2],body);
    else if(/^\/orders\/[^/]+\/dispatches$/.test(path)) result=await app.get(DispatchScansService).create(actorId,key,path.split('/')[2],body);
    else if(path.endsWith('/scans')) result=await app.get(DispatchScansService).record(actorId,key,path.split('/')[2],body);
    else if(path.endsWith('/dispatch')) result=await app.get(DispatchPostingService).dispatch(actorId,key,path.split('/')[2],body);
    else if(path.endsWith('/deliver')) result=await app.get(DispatchPostingService).deliver(actorId,key,path.split('/')[2],body);
    else throw Error('Unknown installation fixture command: '+path);
    return result.data;
  };
}
