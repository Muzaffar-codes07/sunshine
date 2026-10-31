import { HttpStatus, Injectable } from '@nestjs/common';
import { dispatchResponseSchema, normalizeEquipmentSerial, type CreateDispatchRequest, type RecordScanRequest } from '@sunshine/contracts';
import { InvoicesService } from '../finance/invoices.service';
import { ApiError, refusal } from '../platform/api-error';
import { IdempotencyService } from '../platform/idempotency';
import { PrismaService } from '../platform/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { StockLedgerService } from './stock-ledger.service';

/** Draft and evidence only. This service never posts stock, cost, delivery or warranty effects. */
@Injectable()
export class DispatchScansService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly ledger: StockLedgerService, private readonly invoices: InvoicesService) {}

  async create(actorId: string, key: string, orderId: string, input: CreateDispatchRequest) {
    orderId = orderId.toLowerCase();
    return this.idempotency.run({ actorId, key, action: 'DISPATCH_DRAFT', payload: { orderId, ...input } }, async (tx) => {
      const job = await this.lockJob(tx, orderId);
      const source = await this.source(tx, orderId);
      if (!source.valid) throw blocked('DISPATCH_NOT_READY', 'Reserve every component on the order before preparing dispatch.');
      if (!(await this.invoices.getOrderPaymentFacts(tx, orderId)).released) throw blocked('ORDER_NOT_RELEASED', 'Record the customer payment before preparing dispatch.');
      const existing = await tx.dispatch.findUnique({ where: { orderId }, select: { id: true } });
      if (existing) return this.view(tx, existing.id);
      if (job.version !== input.expectedVersion) throw new ApiError(HttpStatus.CONFLICT, 'STALE_VERSION', 'This job changed. Reload it and try again.');
      await tx.job.update({ where: { id: job.id }, data: { version: { increment: 1 } } });
      const draft = await tx.dispatch.create({ data: { orderId, createdById: actorId } });
      return this.view(tx, draft.id);
    });
  }

  async get(id: string) {
    return this.prisma.$transaction((tx) => this.view(tx, id), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async record(actorId: string, key: string, id: string, input: RecordScanRequest) {
    id = id.toLowerCase();
    return this.idempotency.run({ actorId, key, action: 'DISPATCH_SCAN', payload: { id, ...input } }, async (tx) => {
      const dispatch = await tx.dispatch.findUnique({ where: { id }, select: { orderId: true } });
      if (!dispatch) throw notFound();
      // Allocation, release and schedule commands claim this job too, so evidence can't race a reallocation.
      await this.lockJob(tx, dispatch.orderId);
      await tx.$queryRaw`SELECT "id" FROM "dispatches" WHERE "id" = ${id}::uuid FOR NO KEY UPDATE`;
      const source = await this.source(tx, dispatch.orderId);
      if (!source.valid) throw blocked('DISPATCH_NOT_READY', 'The reservation changed. Reserve the complete order before scanning.');
      const normalized = normalizeEquipmentSerial(input.rawValue);
      const matches = source.rows.filter((row) => row.unit?.normalizedSerial === normalized && (!input.unitId || row.unitId === input.unitId));
      if (!matches.length) throw blocked('SCAN_NOT_ALLOCATED', 'This serial is not reserved for this order. Check the selected equipment.');
      if (matches.length > 1) throw blocked('SCAN_AMBIGUOUS', 'This serial matches several reserved products. Select the unit UUID and scan again.');
      const allocation = matches[0]!;
      await this.ledger.lockProducts(tx, [allocation.productId]);
      await this.ledger.lockStock(tx, allocation.productId, allocation.locationId);
      await tx.$queryRaw`SELECT "id" FROM "units" WHERE "id" = ${allocation.unitId}::uuid FOR NO KEY UPDATE`;
      const [current] = await tx.$queryRaw<{ status: string; locationId: string | null }[]>`
        SELECT u."status"::text AS "status", l."locationId" FROM "units" u
        LEFT JOIN "unit_locations" l ON l."unitId"=u."id" WHERE u."id"=${allocation.unitId}::uuid`;
      if (current?.status !== 'RESERVED' || current.locationId !== allocation.locationId) {
        throw blocked('SCAN_NOT_ALLOCATED', 'This unit moved or changed state. Reload the reservation.');
      }
      const prior = await tx.dispatchScan.findUnique({ where: { dispatchId_allocationId_method: { dispatchId: id, allocationId: allocation.id, method: input.method } } });
      if (prior) throw blocked('SCAN_ALREADY_RECORDED', 'This method already recorded the unit. Open the saved scan or reuse the original request key.');
      await tx.dispatchScan.create({ data: { dispatchId: id, allocationId: allocation.id, rawValue: input.rawValue,
        normalizedSerial: normalized, method: input.method, actorId } });
      await tx.dispatch.update({ where: { id }, data: { version: { increment: 1 } } });
      return this.view(tx, id);
    });
  }

  private async lockJob(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { jobId: true } });
    if (!order) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found');
    if (!order.jobId) throw blocked('DISPATCH_NOT_READY', 'This order has no job.');
    const [job] = await tx.$queryRaw<{ id: string; version: number; status: string }[]>`
      SELECT "id","version","status"::text AS "status" FROM "jobs" WHERE "id"=${order.jobId}::uuid FOR NO KEY UPDATE`;
    if (!job || job.status !== 'SCHEDULED') throw blocked('DISPATCH_NOT_READY', 'Only an unstarted job can prepare dispatch scans.');
    return job;
  }

  private async source(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { packing: { include: { product: { select: { trackingMode: true } } } } } });
    const rows = order.jobId ? await tx.allocation.findMany({ where: { jobId: order.jobId, status: { not: 'RELEASED' } },
      include: { unit: true, location: true }, orderBy: { id: 'asc' } }) : [];
    const requirements = new Map(order.packing.map((line) => [line.quoteLineId, line]));
    const unitIds = rows.flatMap((row) => row.unitId ? [row.unitId] : []);
    const located = await tx.$queryRaw<{ unitId: string; locationId: string | null }[]>`
      SELECT "unitId","locationId" FROM "unit_locations" WHERE "unitId"=ANY(${unitIds}::uuid[])`;
    const locations = new Map(located.map((row) => [row.unitId, row.locationId]));
    const totals = new Map<string, Prisma.Decimal>();
    let valid = !!order.jobId && requirements.size > 0 && rows.length > 0;
    for (const row of rows) {
      const line = row.quoteLineId ? requirements.get(row.quoteLineId) : undefined;
      if (!line || line.productId !== row.productId || row.status !== 'RESERVED' || !row.location.active || row.location.kind !== 'USABLE'
        || (line.product.trackingMode === 'SERIALIZED' ? !row.unit || row.unit.status !== 'RESERVED' || locations.get(row.unit.id) !== row.locationId || !row.quantity.equals(1) : row.unitId !== null)) valid = false;
      if (row.quoteLineId) totals.set(row.quoteLineId, (totals.get(row.quoteLineId) ?? new Prisma.Decimal(0)).plus(row.quantity));
    }
    if (order.packing.some((line) => !totals.get(line.quoteLineId)?.equals(line.quantity))) valid = false;
    // A physical count may truthfully put on-hand below reservations. Scan completeness must not hide that shortage.
    const stockKeys = new Set(rows.map((row) => `${row.productId}:${row.locationId}`));
    const balances = await tx.$queryRaw<{ productId: string; locationId: string; onHand: Prisma.Decimal; reserved: Prisma.Decimal }[]>`
      SELECT a."productId",a."locationId",SUM(a."quantity") AS "reserved",COALESCE(s."quantity",0) AS "onHand"
      FROM "allocations" a LEFT JOIN "stock_on_hand" s ON s."productId"=a."productId" AND s."locationId"=a."locationId"
      WHERE a."status"='RESERVED' AND a."productId"=ANY(${[...new Set(rows.map((row) => row.productId))]}::uuid[])
        AND a."locationId"=ANY(${[...new Set(rows.map((row) => row.locationId))]}::uuid[])
      GROUP BY a."productId",a."locationId",s."quantity"`;
    if (balances.some((row) => stockKeys.has(`${row.productId}:${row.locationId}`) && new Prisma.Decimal(row.onHand).lessThan(row.reserved))) valid = false;
    return { order, rows, valid };
  }

  private async view(tx: Prisma.TransactionClient, id: string) {
    const dispatch = await tx.dispatch.findUnique({ where: { id }, include: { scans: { include: { allocation: { include: { unit: true } } }, orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }] } } });
    if (!dispatch) throw notFound();
    const source = await this.source(tx, dispatch.orderId);
    const activeIds = new Set(source.rows.map((row) => row.id));
    const scans = dispatch.scans.map((scan) => ({ id: scan.id, unitId: scan.allocation.unitId!, rawValue: scan.rawValue,
      normalizedSerial: scan.normalizedSerial, method: scan.method, actorId: scan.actorId, recordedAt: scan.recordedAt.toISOString(),
      countsForDispatch: scan.method !== 'TYPED' && activeIds.has(scan.allocationId) && scan.allocation.status === 'RESERVED' && scan.allocation.unit?.status === 'RESERVED',
    }));
    const requiredUnitIds = source.rows.flatMap((row) => row.unitId ? [row.unitId] : []).sort();
    const scanned = new Set(scans.filter((scan) => scan.countsForDispatch).map((scan) => scan.unitId));
    const missingUnitIds = requiredUnitIds.filter((unitId) => !scanned.has(unitId));
    return dispatchResponseSchema.parse({ data: {
      id: dispatch.id, orderId: dispatch.orderId, jobId: source.order.jobId, status: 'DRAFT', version: dispatch.version,
      dispatchedAt: null, deliveredAt: null,
      allocations: source.rows.map((row) => ({ id: row.id, jobId: row.jobId, productId: row.productId, unitId: row.unitId,
        quantity: row.quantity.toFixed(3), status: row.status, source: { kind: 'QUOTE_LINE', quoteLineId: row.quoteLineId },
      })), scans, scanReadiness: { reservationValid: source.valid, requiredUnitIds, missingUnitIds, complete: source.valid && missingUnitIds.length === 0 },
    } });
  }
}

function blocked(code: string, reason: string) {
  return refusal({ code, reason, source: 'INVENTORY', nextAction: 'Check the order reservation and equipment before trying again.' });
}
function notFound() { return new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Dispatch draft not found'); }
