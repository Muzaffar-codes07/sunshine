import type { Prisma, PrismaClient } from '../../apps/api/src/generated/prisma/client';

export class D4SeedError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export interface D4Scenario {
  key: 'sharma-covered' | 'verma-expired';
  customer: { id: string; name: string; phone: string; email: string;
    addressLine: string; city: string; pincode: string };
  jobId: string;
  unitId: string;
  warrantyId: string;
  ticketId: string;
  ticketNumber: string;
  capacityKw: number;
  systemType: 'ON_GRID' | 'OFF_GRID';
  component: 'INVERTER' | 'BATTERY';
  serial: string;
  installedOn: string;
  expiryDate: string;
  faultDescription: string;
}

type InstallationIdentity = Pick<D4Scenario,
  'key' | 'jobId' | 'unitId' | 'capacityKw' | 'systemType' | 'component' | 'serial'> & { customerId: string };

/** D2/D3/D4 integration seam, NOT a production implementation.
 * Persist/verify the real order, completed job (including historical evidence),
 * product/unit, receipt/allocation/dispatch/delivery and their actual cost facts.
 * Use ONLY tx. Stable seed IDs/serials must conflict with unrelated records.
 * On replay return the ORIGINAL installation/delivery date; never re-age history.
 * Completion/delivery below describe historical events, not a unit's current state.
 * Do not activate warranty separately: this seed writes the frozen demo policy.
 */
export interface D4DemoInstallationWriter {
  ensureInstallation(tx: Prisma.TransactionClient, input: InstallationIdentity & { proposedInstalledOn: string }):
    Promise<InstallationIdentity & { installedOn: string; delivered: true; installationCompleted: true }>;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function calendarDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!datePattern.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new D4SeedError('D4_SEED_INVALID_DATE', 'Expected a valid YYYY-MM-DD calendar date');
  }
  return date;
}

/** Month anniversaries clamp at month end, without host timezone/DST arithmetic. */
export function shiftCalendarMonths(value: string, months: number): string {
  const date = calendarDate(value);
  const monthIndex = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  if (!Number.isSafeInteger(months) || !Number.isSafeInteger(monthIndex) || monthIndex < 0 || monthIndex >= 10_000 * 12) {
    throw new D4SeedError('D4_SEED_INVALID_DATE', 'Expected an integer month offset within the four-digit calendar range');
  }
  // Date.UTC coerces years 0..99 into 1900..1999; setUTCFullYear preserves them.
  const target = new Date(0);
  target.setUTCFullYear(Math.floor(monthIndex / 12), monthIndex % 12, 1);
  const monthEnd = new Date(target);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  const lastDay = monthEnd.getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}

function istToday(now: Date): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new D4SeedError('D4_SEED_INVALID_DATE', 'Expected a valid seed reference instant');
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
  const result = `${part('year')}-${part('month')}-${part('day')}`;
  calendarDate(result);
  return result;
}

/** Pure preview. These are synthetic contacts, not real customer information.
 * Serial suffixes are fixed demo identifiers, not the source of installation dates.
 */
export function buildD4Scenarios(now: Date = new Date()): D4Scenario[] {
  const today = istToday(now);
  return ([
    { key: 'sharma-covered', name: 'Anita Sharma', phone: '9000000501', months: 18,
      capacityKw: 3, systemType: 'ON_GRID', component: 'INVERTER', serial: 'INV-ACTIVE-2025-01',
      faultDescription: 'ERR-04: Ground fault. Rainy-season breakdown reported by Mrs. Sharma.', suffix: '1' },
    { key: 'verma-expired', name: 'Rajesh Verma', phone: '9000000502', months: 28,
      capacityKw: 5, systemType: 'OFF_GRID', component: 'BATTERY', serial: 'BAT-EXPIRED-2024-09',
      faultDescription: 'Battery fails to hold charge. Assess chargeable parts and labour for Mr. Verma.', suffix: '2' },
  ] as const).map(row => {
    const id = (kind: number) => `d4510000-0000-4000-8000-0000000000${kind}${row.suffix}`;
    const installedOn = shiftCalendarMonths(today, -row.months);
    return {
      key: row.key, customer: { id: id(1), name: row.name, phone: row.phone,
        email: `${row.key}@example.invalid`, addressLine: `D4 demo home ${row.suffix} (synthetic)`,
        city: 'Jaipur', pincode: '302001' },
      jobId: id(2), unitId: id(3), warrantyId: id(4), ticketId: id(5),
      ticketNumber: `DEMO-D4-${row.key.toUpperCase()}-001`, capacityKw: row.capacityKw,
      systemType: row.systemType, component: row.component, serial: row.serial,
      installedOn, expiryDate: shiftCalendarMonths(installedOn, 24), faultDescription: row.faultDescription,
    };
  });
}

export function assertD4SeedReady(writer?: D4DemoInstallationWriter): asserts writer is D4DemoInstallationWriter {
  if (!writer || typeof writer.ensureInstallation !== 'function') {
    throw new D4SeedError('D4_SEED_INTEGRATION_REQUIRED',
      'D4 demo seed requires the real historical Job/Unit/order/dispatch installation adapter and coordinated D4 migration. No records were written. See prisma/seed/README.md.');
  }
}

function conflict(): never {
  throw new D4SeedError('D4_SEED_CONFLICT', 'Existing demo identity, installation or warranty differs; no history will be overwritten');
}

/** Explicit opt-in only. All scenarios commit together or throw/roll back together.
 * The advisory lock serializes seed invocations; normal application writes still
 * require upstream FKs, uniqueness and concurrency checks in the supplied writer.
 */
export async function seedD4Scenarios(prisma: PrismaClient, options: {
  installations?: D4DemoInstallationWriter; now?: Date;
} = {}): Promise<D4Scenario[]> {
  const writer = options.installations;
  assertD4SeedReady(writer); // BEFORE connecting, opening a transaction or writing customers.
  const now = options.now ?? new Date();
  const today = istToday(now);
  const scenarios = buildD4Scenarios(now);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(71404, 51)::text`;
    const saved: D4Scenario[] = [];
    for (const scenario of scenarios) {
      const customer = await tx.customer.upsert({ where: { id: scenario.customer.id },
        create: scenario.customer, update: {} });
      if (Object.entries(scenario.customer).some(([key, value]) => customer[key as keyof typeof customer] !== value)) conflict();
      const identity: InstallationIdentity = { key: scenario.key, customerId: customer.id,
        jobId: scenario.jobId, unitId: scenario.unitId, capacityKw: scenario.capacityKw,
        systemType: scenario.systemType, component: scenario.component, serial: scenario.serial };
      const installation = await writer.ensureInstallation(tx, {
        ...identity, proposedInstalledOn: scenario.installedOn,
      });
      if (!installation || Object.entries(identity).some(([key, value]) => installation[key as keyof typeof installation] !== value) ||
        installation.delivered !== true || installation.installationCompleted !== true) conflict();
      const startDate = calendarDate(installation.installedOn);
      if (installation.installedOn > today) conflict();
      const expiryDate = calendarDate(shiftCalendarMonths(installation.installedOn, 24));
      const policy = { unitId: scenario.unitId, policyName: `Demo ${scenario.component.toLowerCase()} component warranty`,
        policyRevision: 'demo-v1', scope: 'Component replacement', durationMonths: 24 };
      const warranty = await tx.warranty.upsert({ where: { unitId: scenario.unitId }, update: {},
        create: { id: scenario.warrantyId, ...policy, startDate, expiryDate, active: true } });
      if (warranty.id !== scenario.warrantyId || Object.entries(policy).some(([key, value]) => warranty[key as keyof typeof warranty] !== value) ||
        warranty.startDate.getTime() !== startDate.getTime() || warranty.expiryDate.getTime() !== expiryDate.getTime()) conflict();
      const ticket = await tx.serviceTicket.upsert({ where: { id: scenario.ticketId }, update: {},
        create: { id: scenario.ticketId, ticketNumber: scenario.ticketNumber, customerId: customer.id,
          unitId: scenario.unitId, jobId: scenario.jobId, status: 'OPEN', faultDescription: scenario.faultDescription } });
      if (ticket.ticketNumber !== scenario.ticketNumber || ticket.customerId !== customer.id ||
          ticket.unitId !== scenario.unitId || ticket.jobId !== scenario.jobId ||
          ticket.faultDescription !== scenario.faultDescription) conflict();
      // Never reopen/reset progressed tickets, billing/confirmation, replacement or voided coverage.
      saved.push({ ...scenario, installedOn: installation.installedOn, expiryDate: expiryDate.toISOString().slice(0, 10) });
    }
    return saved;
  }, { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 60_000 });
}
