import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { quotePolicySnapshotSchema, type WarrantyEquipment, type WarrantyLookupQuery } from '@sunshine/contracts';
import { AuthService } from '../auth/auth.service';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../platform/api-error';
import { PrismaService } from '../platform/prisma.service';
import { addCalendarMonths, istDate } from './warranty-activation';
import { WarrantyEquipmentReader, WarrantyLookupAccess } from './warranty-readers';
import { WarrantyReader, type SavedWarranty } from './warranty.repository';

const invalid = () => new ApiError(503, 'INVALID_WARRANTY_RECORD', 'Equipment, delivery or frozen warranty evidence needs review');

@Injectable()
export class StaffWarrantyLookupAccess extends WarrantyLookupAccess {
  constructor(private readonly auth: AuthService) { super(); }
  async assertCanLookup(request: Request) {
    const id = request.session?.staffUserId;
    const staff = id ? await this.auth.findActiveStaff(id) : null;
    if (!staff) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue');
    if (staff.role !== 'ADMIN' && staff.role !== 'SUPPORT') {
      throw new ApiError(403, 'FORBIDDEN', 'Only administrators and support staff can look up customer warranties');
    }
  }
}

const unitSourceInclude = {
  product: { select: { manufacturerId: true } },
  replacementUnits: { select: { id: true }, take: 1 },
  allocations: { where: { status: { in: ['DELIVERED', 'INSTALLED'] } }, take: 2,
    include: { quoteLine: true, job: { include: { order: {
      include: { customer: { select: { id: true, name: true } }, enquiry: { select: { customerId: true } },
        quote: { select: { id: true, enquiryId: true, customerId: true } }, dispatch: true },
    } } } } },
} satisfies Prisma.UnitInclude;
type UnitSource = Prisma.UnitGetPayload<{ include: typeof unitSourceInclude }>;

/** Follow persisted equipment ancestry to the original delivered sale, never a ticket's customer claim. */
async function installation(tx: Prisma.TransactionClient, unitId: string) {
  const seen = new Set<string>();
  const chain: UnitSource[] = [];
  let currentId: string | null = unitId.toLowerCase();
  while (currentId) {
    if (seen.has(currentId) || seen.size >= 32) throw invalid();
    seen.add(currentId);
    const unit: UnitSource | null = await tx.unit.findUnique({ where: { id: currentId }, include: unitSourceInclude });
    if (!unit) { if (!chain.length) return null; throw invalid(); }
    if (unit.product.manufacturerId !== unit.manufacturerId || unit.allocations.length > 1) throw invalid();
    chain.push(unit);
    currentId = unit.replacesUnitId;
  }
  const root = chain.at(-1)!;
  const allocation = root.allocations[0];
  if (chain.length > 1 && (!allocation || chain.slice(0, -1).some(unit => unit.allocations.length))) throw invalid();
  if (!allocation) return { chain, equipment: equipmentProjection(chain[0]!, null, null), policy: null, deliveredAt: null };
  const { job, quoteLine } = allocation, { order } = job;
  if (allocation.productId !== root.productId || !allocation.quantity.equals(1) || !quoteLine ||
    quoteLine.productId !== root.productId || quoteLine.quoteId !== order.quoteId ||
    order.jobId !== job.id || order.enquiry.customerId !== order.customerId ||
    order.quote.customerId !== order.customerId || order.quote.enquiryId !== order.enquiryId ||
    order.dispatch?.status !== 'DELIVERED' || !order.dispatch.deliveredAt) throw invalid();
  const parsed = quoteLine.policyStatus === 'CONFIGURED' ? quotePolicySnapshotSchema.safeParse(quoteLine.warrantyPolicySnapshot) : null;
  if (parsed && !parsed.success) throw invalid();
  return { chain, equipment: equipmentProjection(chain[0]!, order.customer, { id: job.id }),
    policy: parsed?.success ? parsed.data : null, deliveredAt: order.dispatch.deliveredAt };
}

function equipmentProjection(unit: { id: string; rawSerial: string; manufacturerId: string; productId: string },
  customer: WarrantyEquipment['customer'], job: WarrantyEquipment['job']): WarrantyEquipment {
  return { unit: { id: unit.id, serial: unit.rawSerial, manufacturerId: unit.manufacturerId, productId: unit.productId }, customer, job };
}

@Injectable()
export class PersistedWarrantyEquipmentReader extends WarrantyEquipmentReader {
  constructor(private readonly prisma: PrismaService) { super(); }
  async findById(unitId: string, tx?: Prisma.TransactionClient): Promise<WarrantyEquipment | null> {
    if (tx) return (await installation(tx, unitId))?.equipment ?? null;
    return this.prisma.$transaction(async tx => (await installation(tx, unitId))?.equipment ?? null,
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async findBySerial(query: WarrantyLookupQuery): Promise<WarrantyEquipment[]> {
    return this.prisma.$transaction(async tx => {
      const matches = await tx.unit.findMany({ where: { normalizedSerial: query.serial,
        ...(query.productId ? { productId: query.productId.toLowerCase() } : {}),
        ...(query.manufacturerId ? { manufacturerId: query.manufacturerId.toLowerCase() } : {}) },
        select: { id: true, rawSerial: true, manufacturerId: true, productId: true }, orderBy: { id: 'asc' }, take: 2 });
      // Ambiguity must be resolved before examining either customer's installation.
      if (matches.length > 1) return matches.map(unit => equipmentProjection(unit, null, null));
      const rows = [];
      for (const row of matches) rows.push((await installation(tx, row.id))!.equipment);
      return rows;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}

/** Verify frozen sale and delivery provenance before promising coverage. Current catalogue terms never participate. */
@Injectable()
export class ValidatedWarrantyReader extends WarrantyReader {
  constructor(private readonly prisma: PrismaService) { super(); }
  async findByUnitId(unitId: string, callerTx?: Prisma.TransactionClient): Promise<SavedWarranty | null> {
    const read = async (tx: Prisma.TransactionClient) => {
      const source = await installation(tx, unitId);
      if (!source) return null;
      // A lineage field alone does not prove the replacement was consumed, costed and delivered.
      // The service/stock adapter must verify those facts before enabling replacement coverage.
      if (source.chain.length > 1) throw new ApiError(503, 'WARRANTY_REPLACEMENT_UNAVAILABLE', 'Replacement coverage awaits verified service issue and billing evidence');
      const warranty = await tx.warranty.findUnique({ where: { unitId: unitId.toLowerCase() } });
      if (!warranty) { if (source.policy) throw invalid(); return null; }
      if (!source.policy || !source.deliveredAt) throw invalid();
      const start = istDate(source.deliveredAt), expiry = addCalendarMonths(start, source.policy.durationMonths);
      const expected = { startDate: start, expiryDate: expiry, policyName: source.policy.policyName,
        policyRevision: source.policy.revision, scope: source.policy.scope, durationMonths: source.policy.durationMonths };
      for (const unit of source.chain) {
        const row = unit.id === warranty.unitId ? warranty : await tx.warranty.findUnique({ where: { unitId: unit.id } });
        if (!row || row.startDate.toISOString().slice(0, 10) !== expected.startDate ||
          row.expiryDate.toISOString().slice(0, 10) !== expected.expiryDate || row.policyName !== expected.policyName ||
          row.policyRevision !== expected.policyRevision || row.scope !== expected.scope || row.durationMonths !== expected.durationMonths) throw invalid();
      }
      // Even a partially migrated replacement must never leave the defective serial eligible for another free repair.
      return { ...warranty, active: warranty.active && source.chain[0]!.replacementUnits.length === 0 };
    };
    return callerTx ? read(callerTx) : this.prisma.$transaction(read, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
