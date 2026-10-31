const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createQuoteSchema, reviseQuoteSchema, acceptQuoteSchema, sendQuoteSchema, quoteSchema } = require('../dist');
const id = n => 'c0010000-0000-4000-8000-' + String(n).padStart(12,'0');
const product = (n, category) => ({ id:id(n),sku:'QUOTE-'+n,name:'Frozen '+category,kind:'HARDWARE',category,trackingMode:'SERIALIZED',unitOfMeasure:'PCS',
  manufacturerId:id(1),manufacturer:{id:id(1),name:'Frozen manufacturer'},unitSalePrice:'100.00',active:true });
const fixture = () => {
  const categories=['PANEL','INVERTER','CHARGE_CONTROLLER','MOUNTING','WIRING_BOX','SWITCHGEAR','CABLE','EARTHING','CONNECTOR'];
  const service={...product(100,'INSTALLATION'),kind:'SERVICE',trackingMode:'NONE',unitOfMeasure:'JOB',manufacturerId:null,manufacturer:null};
  const base=(n,kind,price)=>({id:id(n),position:n,kind,description:'Frozen line',quantity:'1.000',unitPrice:price,lineTotal:price,
    productId:null,productSnapshot:null,policyStatus:'NOT_APPLICABLE',warrantyPolicySnapshot:null});
  const lines=[base(1,'PACKAGE','0.10'),...categories.map((category,i)=>({...base(i+2,'COMPONENT','0.00'),productId:id(i+10),productSnapshot:product(i+10,category),policyStatus:'UNCONFIGURED'})),
    {...base(20,'SERVICE','0.20'),productId:service.id,productSnapshot:service,policyStatus:'UNCONFIGURED'}];
  return {id:id(200),enquiryId:id(201),surveyId:id(202),packageId:id(203),customerId:id(204),revision:1,version:1,status:'DRAFT',supersedesQuoteId:null,revisionReason:null,isLatest:true,
    customerSnapshot:{contactName:'Quote Test',phone:'9876543210',addressLine:'1 Snapshot Road',city:'Pune',pincode:'411001'},
    packageSnapshot:{code:'KIT-1-R1',name:'Frozen kit',capacityKw:1,systemType:'ON_GRID',revision:1},
    hardwarePrice:'0.10',installationPrice:'0.20',totalPrice:'0.30',lines,createdById:id(205),createdAt:'2026-10-31T12:00:00.000Z',updatedAt:'2026-10-31T12:00:00.000Z',
    sentAt:null,sentById:null,sentChannel:null,decidedAt:null,decidedById:null,acceptedByName:null,decisionChannel:null,decisionReference:null,decisionReason:null};
};
test('quote commands accept only selections and recorded evidence, never client prices/BOM or actor',()=>{
  assert.deepEqual(createQuoteSchema.parse({surveyId:id(2),packageId:id(3)}),{surveyId:id(2),packageId:id(3)});
  assert.equal(createQuoteSchema.safeParse({surveyId:id(2),packageId:id(3),totalPrice:'0.01'}).success,false);
  assert.equal(reviseQuoteSchema.safeParse({surveyId:id(2),packageId:id(3),version:1}).success,false);
  assert.equal(sendQuoteSchema.safeParse({version:1,channel:'WHATSAPP',sentAt:'2026-10-31'}).success,false);
  assert.equal(acceptQuoteSchema.parse({version:2,acceptedByName:' Test Customer ',channel:'PHONE'}).acceptedByName,'Test Customer');
  assert.equal(acceptQuoteSchema.safeParse({version:2,acceptedByName:'Test Customer',channel:'PHONE',decidedById:id(99)}).success,false);
});
test('complete quote reconciles exact decimal charges and explicitly unconfigured product policies',()=>{
  assert.ok(quoteSchema.safeParse(fixture()).success);
  const row=fixture(); row.lines[1].policyStatus='CONFIGURED';
  assert.equal(quoteSchema.safeParse(row).success,false);
  row.lines[1].warrantyPolicySnapshot={policyName:'Fictional demo policy',revision:'r1',scope:'Equipment defects',durationMonths:24};
  assert.ok(quoteSchema.safeParse(row).success);
});
test('quote snapshot rejects missing BOM, component double charging, money drift and nonfinite data',()=>{
  for(const change of [
    row=>row.lines.splice(2,1),
    row=>row.lines[1].lineTotal='0.10',
    row=>row.lines[1].quantity='1.500',
    row=>row.totalPrice='0.31',
    row=>row.hardwarePrice='NaN',
    row=>row.lines[0].lineTotal='0.20',
    row=>row.lines[1].productId=id(999),
    row=>row.lines[1].policyStatus='NOT_APPLICABLE',
  ]) { const row=fixture();change(row);assert.equal(quoteSchema.safeParse(row).success,false); }
});
test('quote sent and decision states require the saved staff/customer evidence',()=>{
  const row=fixture(); row.status='SENT';
  assert.equal(quoteSchema.safeParse(row).success,false);
  Object.assign(row,{sentAt:row.createdAt,sentById:id(205),sentChannel:'PRINT'});
  assert.ok(quoteSchema.safeParse(row).success);
  Object.assign(row,{status:'ACCEPTED',version:3,decidedAt:row.createdAt,decidedById:id(205)});
  assert.equal(quoteSchema.safeParse(row).success,false);
  Object.assign(row,{acceptedByName:'Test customer',decisionChannel:'IN_PERSON'});
  assert.ok(quoteSchema.safeParse(row).success);
});
