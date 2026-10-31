import { quotePolicySnapshotSchema } from '@sunshine/contracts';
import { Prisma } from '../generated/prisma/client';

/** The calendar date in India. Warranty periods are IST dates, kept apart from the delivery instant. */
export function istDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** The same day some months later, or the month's last day when that day doesn't exist (31 Jan + 1 month = 28 Feb). */
export function addCalendarMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Starts each delivered unit's warranty from the terms frozen on its accepted quote line. Runs once per delivery, in
 * its transaction. An existing warranty is left alone, so a replacement's continued coverage is never restarted.
 * D4 owns this helper (#53). D3's delivery command only calls it.
 */
export async function activateFromDelivery(tx: Prisma.TransactionClient, { jobId, deliveredAt }: { jobId: string; deliveredAt: Date }) {
  const rows = await tx.allocation.findMany({
    where: { jobId, status: 'DELIVERED', unitId: { not: null } },
    select: { unitId: true, quoteLine: { select: { policyStatus: true, warrantyPolicySnapshot: true } } },
  });
  const startDate = istDate(deliveredAt);
  const data = rows.flatMap((row) => {
    const policy = row.quoteLine?.policyStatus === 'CONFIGURED' ? quotePolicySnapshotSchema.safeParse(row.quoteLine.warrantyPolicySnapshot) : null;
    if (!policy?.success) return [];
    return [{
      unitId: row.unitId!, startDate: new Date(`${startDate}T00:00:00.000Z`), expiryDate: new Date(`${addCalendarMonths(startDate, policy.data.durationMonths)}T00:00:00.000Z`),
      policyName: policy.data.policyName, policyRevision: policy.data.revision, scope: policy.data.scope, durationMonths: policy.data.durationMonths,
    }];
  });
  if (data.length) await tx.warranty.createMany({ data, skipDuplicates: true });
}
