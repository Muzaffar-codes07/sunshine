import { createHash } from 'node:crypto';
import { addCalendarMonths, istDate } from '../warranty/warranty-activation';

export const DEMO_VERSION = 'sunshine-450-v1';
export const demoId = (key: string) => {
  const hex = createHash('sha256').update(`${DEMO_VERSION}:${key}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
};
export type Stage = 'NEW' | 'QUALIFIED' | 'SURVEY_SCHEDULED' | 'SURVEY_SUBMITTED' | 'SURVEY_APPROVED' | 'SURVEY_REJECTED'
  | 'QUOTE_DRAFT' | 'QUOTE_SENT' | 'QUOTE_REJECTED' | 'QUOTE_ACCEPTED' | 'ORDER' | 'RESERVED' | 'DISPATCHED' | 'DELIVERED' | 'IN_PROGRESS' | 'COMPLETED';
export const STAGES: [Stage, number][] = [['NEW',100],['QUALIFIED',80],['SURVEY_SCHEDULED',20],['SURVEY_SUBMITTED',20],
  ['SURVEY_APPROVED',20],['SURVEY_REJECTED',10],['QUOTE_DRAFT',15],['QUOTE_SENT',25],['QUOTE_REJECTED',10],['QUOTE_ACCEPTED',5],
  ['ORDER',45],['RESERVED',10],['DISPATCHED',10],['DELIVERED',10],['IN_PROGRESS',10],['COMPLETED',60]];
export const offset = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);
export const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2,'0')}:00:00+05:30`);
export const dayOf = (date: Date) => istDate(date);
export const hasQuote = (s: Stage) => s.startsWith('QUOTE_') || ['ORDER','RESERVED','DISPATCHED','DELIVERED','IN_PROGRESS','COMPLETED'].includes(s);
export const hasOrder = (s: Stage) => ['ORDER','RESERVED','DISPATCHED','DELIVERED','IN_PROGRESS','COMPLETED'].includes(s);
export const hasAllocation = (s: Stage) => ['RESERVED','DISPATCHED','DELIVERED','IN_PROGRESS','COMPLETED'].includes(s);
export const hasDelivery = (s: Stage) => ['DELIVERED','IN_PROGRESS','COMPLETED'].includes(s);

export interface DemoCustomer {
  index: number; stage: Stage; anchor: string; customerId: string; enquiryId: string; jobId: string;
  name: string; phone: string; email: string; addressLine: string; city: string; pincode: string;
  capacityKw: number; systemType: 'ON_GRID' | 'OFF_GRID'; source: 'WEB' | 'PHONE' | 'WHATSAPP';
  deliveryDay: string; enquiryAt: Date; surveyAt: Date; quoteAt: Date; orderAt: Date; dispatchAt: Date;
  deliveredAt: Date; startedAt: Date; finishedAt: Date; technicianIndexes: number[];
  service: boolean; special?: 'covered' | 'expired';
}

/** Reproducible fictional profiles. The anchor is persisted in the seed's database command. */
export function buildManifest(anchor = istDate(new Date())): DemoCustomer[] {
  const check = new Date(`${anchor}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || !Number.isFinite(check.getTime()) || check.toISOString().slice(0,10) !== anchor || anchor < '2024-01-01' || anchor > istDate(new Date())) {
    throw new Error('DEMO_INVALID_ANCHOR: use a valid date from 2024-01-01 through today in IST');
  }
  const first = ['Aarav','Aditi','Akash','Ananya','Arjun','Bhavna','Deepak','Divya','Farhan','Gauri','Harish','Isha','Kabir','Kavya','Manish',
    'Meera','Nikhil','Nisha','Pankaj','Pooja','Rahul','Ritu','Rohan','Sakshi','Sameer','Shreya','Suresh','Tanvi','Varun','Vidya'];
  const last = ['Agarwal','Bansal','Chauhan','Desai','Gupta','Jain','Joshi','Kapoor','Kulkarni','Mehta','Nair','Patel','Rao','Singh','Trivedi'];
  const places = [{city:'Jaipur',pincode:'302001'},{city:'Nagpur',pincode:'440001'},{city:'Bengaluru',pincode:'560001'}];
  const stages = STAGES.flatMap(([stage,count]) => Array<Stage>(count).fill(stage));
  return stages.map((stage, n) => {
    const index = n + 1, special = index === 391 ? 'covered' : index === 441 ? 'expired' : undefined;
    let deliveryDay = dayOf(offset(at(anchor,8), -(n % 60 + 2)));
    if (index >= 391 && index <= 420) deliveryDay = dayOf(offset(at(anchor,8), -(index - 390)));
    if (index >= 421 && index <= 440) deliveryDay = dayOf(offset(at(addCalendarMonths(anchor, -(13 + (index-421)%11)),8), -(index-420)));
    if (index >= 441) deliveryDay = dayOf(offset(at(addCalendarMonths(anchor, -(25 + index-441)),8), -(index-440)));
    if (special) deliveryDay = addCalendarMonths(anchor, special === 'covered' ? -18 : -28);
    // For early stages this is a proposed delivery day, not a persisted delivery.
    // Keep new leads recent and include genuine current-day invoices/receipts.
    if(stage==='NEW')deliveryDay=dayOf(offset(at(anchor,0),24-(n%14)));
    if(stage==='QUALIFIED')deliveryDay=dayOf(offset(at(anchor,0),24-(n%30+1)));
    if(stage.startsWith('SURVEY_')||stage.startsWith('QUOTE_'))deliveryDay=dayOf(offset(at(anchor,0),24-(15+n%30)));
    if([306,309,312].includes(index))deliveryDay=dayOf(offset(at(anchor,0),14));
    if(index===307)deliveryDay=dayOf(offset(at(anchor,0),13));
    const deliveredAt = at(deliveryDay,stage==='NEW'||[306,307,309,312].includes(index)?0:7), startedAt = at(deliveryDay,8), finishedAt = at(deliveryDay,16);
    const systemType = (n%10 < 7 || index === 448) && index !== 441 ? 'ON_GRID' : 'OFF_GRID';
    const name = special === 'covered' ? 'Anita Sharma' : special === 'expired' ? 'Rajesh Verma' : `${first[n%30]} ${last[Math.floor(n/30)]}`;
    const place = special ? places[0]! : places[n%places.length]!;
    const suffix = special === 'covered' ? '1' : '2';
    return { index, stage, anchor, special, name, ...place,
      customerId: special ? `d4510000-0000-4000-8000-00000000001${suffix}` : demoId(`customer:${index}`),
      enquiryId: demoId(`enquiry:${index}`), jobId: special ? `d4510000-0000-4000-8000-00000000002${suffix}` : demoId(`job:${index}`),
      phone: special ? `900000050${suffix}` : `900001${String(index).padStart(4,'0')}`,
      email: `customer-${String(index).padStart(3,'0')}@example.invalid`, addressLine: `${100+index}, Sample ${['Garden','Lake','Market','Temple','Station'][n%5]} Lane (synthetic)`,
      capacityKw: special === 'covered' ? 3 : special === 'expired' ? 5 : [1,2,3,3,2,4,3,5,2,3][n%10]!, systemType,
      source: (['WEB','PHONE','WHATSAPP'] as const)[n%3]!, deliveryDay, deliveredAt, startedAt, finishedAt,
      enquiryAt: offset(deliveredAt,-24), surveyAt: offset(deliveredAt,-20), quoteAt: offset(deliveredAt,-17), orderAt: offset(deliveredAt,-14), dispatchAt: offset(deliveredAt,-1),
      technicianIndexes: [n%3*2, n%3*2+1], service: (index>=391 && index<=404) || index===441,
    };
  });
}

export function manifestSummary(rows: DemoCustomer[]) {
  return { version: DEMO_VERSION, anchor: rows[0]!.anchor, customers: rows.length,
    cohorts: Object.fromEntries(STAGES.map(([s])=>[s,rows.filter(r=>r.stage===s).length])),
    expected: { enquiries:450, surveys:270, quotes:200, orders:145, jobs:145, salesInvoices:145, completedJobs:60, serviceTickets:15 },
    systemTypes: { ON_GRID:rows.filter(r=>r.systemType==='ON_GRID').length, OFF_GRID:rows.filter(r=>r.systemType==='OFF_GRID').length },
    demo: { sales: rows[200]!.customerId, warehouse: rows[357]!.customerId, field: rows[380]!.customerId, covered: rows[390]!.customerId, expired: rows[440]!.customerId } };
}
