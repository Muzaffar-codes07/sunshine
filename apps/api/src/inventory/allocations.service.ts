import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { allocationListResponseSchema, releaseOrderAllocationsResponseSchema, type AllocateOrderRequest, type ReleaseOrderAllocationsRequest, type RefusalReason } from '@sunshine/contracts';
import { InvoicesService } from '../finance/invoices.service';
import { ApiError, refusal } from '../platform/api-error';
import { IdempotencyService } from '../platform/idempotency';
import { PrismaService } from '../platform/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { StockLedgerService, type LockedProduct } from './stock-ledger.service';

type Requirement = { quoteLineId: string; productId: string; quantity: Prisma.Decimal };

const notAllocatable = (reason: string, nextAction: string): RefusalReason => ({ code: 'NOT_ALLOCATABLE', reason, source: 'INVENTORY', nextAction });
const short = (reason: string): RefusalReason => ({ code: 'INSUFFICIENT_STOCK', reason, source: 'INVENTORY', nextAction: 'Receive more stock, then try again. Nothing was reserved.' });

/** Reserves a paid order's sold requirements, all of them or none. */
@Injectable()
export class AllocationsService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService, private readonly ledger: StockLedgerService, private readonly invoices: InvoicesService) {}

  /** The job's version is the claim, so two callers can't both allocate. Locks then follow the global order. */
  async allocateOrder(actorId: string, key: string, orderId: string, input: AllocateOrderRequest) {
    return this.idempotency.run({ actorId, key, action: 'ORDER_ALLOCATE', payload: { orderId, ...input } }, async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { packing: { include: { quoteLine: { select: { position: true } } } } } });
      if (!order) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found');
      const jobId = order.jobId;
      if (!jobId) throw refusal(notAllocatable('This order has no job yet.', 'Reload the order and try again.'));
      const claimed = await tx.job.updateMany({ where: { id: jobId, version: input.expectedVersion }, data: { version: { increment: 1 } } });
      if (claimed.count !== 1) throw new ApiError(HttpStatus.CONFLICT, 'STALE_VERSION', 'This job was changed by someone else. Reload it and try again.');
      if (await tx.allocation.count({ where: { jobId, status: { not: 'RELEASED' } } })) {
        throw refusal({ code: 'ALREADY_ALLOCATED', reason: 'Stock is already allocated to this job.', source: 'INVENTORY', nextAction: 'Open the existing allocations.' });
      }
      if (!(await this.invoices.getOrderPaymentFacts(tx, orderId)).released) {
        throw refusal({ code: 'ORDER_NOT_RELEASED', reason: 'No payment has been recorded for this order.', source: 'INVENTORY', nextAction: 'Record the customer payment, then allocate.' });
      }
      const requirements: Requirement[] = [...order.packing].sort((a, b) => a.quoteLine.position - b.quoteLine.position);
      if (requirements.length === 0) throw refusal(notAllocatable('This order has no equipment to allocate.', 'Check the accepted quote.'));
      const locationId = await this.usableLocation(tx);
      const products = await this.ledger.lockProducts(tx, requirements.map((line) => line.productId));
      for (const productId of [...products.keys()].sort()) await this.ledger.lockStock(tx, productId, locationId);
      const serialized = requirements.filter((line) => this.stocked(products.get(line.productId)).trackingMode === 'SERIALIZED');
      const bulk = requirements.filter((line) => products.get(line.productId)!.trackingMode !== 'SERIALIZED');
      const names = new Map((await tx.product.findMany({ where: { id: { in: [...products.keys()] } }, select: { id: true, name: true } })).map((row) => [row.id, row.name]));
      const reasons = await this.bulkShortages(tx, bulk, locationId, names);
      const units = await this.chooseUnits(tx, serialized, locationId, input.unitIds, reasons, names);
      if (reasons.length) throw refusal(reasons[0]!, ...reasons.slice(1));
      await this.lockAndCheckUnits(tx, [...units.values()].flat(), locationId);
      for (const line of serialized) {
        const assigned = units.get(line.productId)!.splice(0, line.quantity.toNumber());
        await tx.allocation.createMany({ data: assigned.map((unitId) => ({
          id: randomUUID(), jobId, quoteLineId: line.quoteLineId, productId: line.productId, unitId, locationId, quantity: new Prisma.Decimal(1), actorId,
        })) });
        await tx.unit.updateMany({ where: { id: { in: assigned } }, data: { status: 'RESERVED', version: { increment: 1 } } });
      }
      for (const line of bulk) {
        await tx.allocation.create({ data: { jobId, quoteLineId: line.quoteLineId, productId: line.productId, locationId, quantity: line.quantity, actorId } });
      }
      return this.view(tx, jobId);
    });
  }

  async listForOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { jobId: true } });
    if (!order) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found');
    return order.jobId ? this.view(this.prisma, order.jobId) : allocationListResponseSchema.parse({ data: [] });
  }

  /** Frees the complete pre-dispatch reservation, retaining its source identity and release evidence. */
  async releaseOrder(actorId: string, key: string, orderId: string, input: ReleaseOrderAllocationsRequest) {
    orderId = orderId.toLowerCase();
    return this.idempotency.run({ actorId, key, action: 'ORDER_ALLOCATION_RELEASE', payload: { orderId, ...input } }, async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { jobId: true } });
      if (!order) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found');
      if (!order.jobId) throw notReleasable('This order has no job.');
      const jobId = order.jobId;
      const claimed = await tx.job.updateMany({ where: { id: jobId, version: input.expectedVersion, status: 'SCHEDULED' }, data: { version: { increment: 1 } } });
      if (claimed.count !== 1) {
        const job = await tx.job.findUniqueOrThrow({ where: { id: jobId }, select: { status: true } });
        if (job.status !== 'SCHEDULED') throw notReleasable('This job has started; its stock cannot be freed as an unused reservation.');
        throw new ApiError(HttpStatus.CONFLICT, 'STALE_VERSION', 'This job was changed by someone else. Reload it and try again.');
      }
      const rows = await tx.allocation.findMany({ where: { jobId, status: { not: 'RELEASED' } } });
      if (!rows.length || rows.some((row) => row.status !== 'RESERVED')) {
        throw notReleasable('Only a complete, unused reservation can be released. Dispatched equipment needs a return.');
      }
      await this.ledger.lockProducts(tx, rows.map((row) => row.productId));
      const locations = new Map(rows.map((row) => [`${row.productId}:${row.locationId}`, row]));
      for (const [, row] of [...locations].sort(([a], [b]) => a.localeCompare(b))) await this.ledger.lockStock(tx, row.productId, row.locationId);
      const unitIds = rows.flatMap((row) => row.unitId ? [row.unitId] : []).sort();
      if (unitIds.length) {
        await tx.$queryRaw`SELECT "id" FROM "units" WHERE "id" = ANY(${unitIds}::uuid[]) ORDER BY "id" FOR NO KEY UPDATE`;
        const units = await tx.$queryRaw<{ id: string; productId: string; status: string; locationId: string | null }[]>`
          SELECT u."id", u."productId", u."status"::text AS "status", l."locationId" FROM "units" u
          LEFT JOIN "unit_locations" l ON l."unitId" = u."id" WHERE u."id" = ANY(${unitIds}::uuid[])`;
        const byId = new Map(units.map((unit) => [unit.id, unit]));
        if (units.length !== unitIds.length || rows.some((row) => {
          if (!row.unitId) return false;
          const unit = byId.get(row.unitId);
          return !unit || unit.status !== 'RESERVED' || unit.productId !== row.productId || unit.locationId !== row.locationId;
        })) throw notReleasable('A reserved unit has moved or changed state. Nothing was released.');
      }
      const releasedAt = new Date();
      const changed = await tx.allocation.updateMany({ where: { id: { in: rows.map((row) => row.id) }, status: 'RESERVED' }, data: {
        status: 'RELEASED', version: { increment: 1 }, releasedAt, releasedById: actorId, releaseReason: input.reason,
      } });
      if (changed.count !== rows.length) throw notReleasable('The reservation changed while it was being released.');
      if (unitIds.length) {
        const freed = await tx.unit.updateMany({ where: { id: { in: unitIds }, status: 'RESERVED' }, data: { status: 'AVAILABLE', version: { increment: 1 } } });
        if (freed.count !== unitIds.length) throw notReleasable('A reserved unit changed while it was being released.');
      }
      return releaseOrderAllocationsResponseSchema.parse({ data: {
        jobId, jobVersion: input.expectedVersion + 1, releasedAt: releasedAt.toISOString(), releasedById: actorId,
        reason: input.reason, allocations: (await this.view(tx, jobId)).data,
      } });
    });
  }

  private async usableLocation(tx: Prisma.TransactionClient) {
    const usable = await tx.stockLocation.findMany({ where: { kind: 'USABLE', active: true }, select: { id: true }, take: 2 });
    if (usable.length !== 1) throw refusal(notAllocatable('Allocation needs exactly one active usable location.', 'Check the stock locations.'));
    return usable[0]!.id;
  }

  private stocked(product: LockedProduct | undefined) {
    if (!product || product.kind !== 'HARDWARE' || product.trackingMode === 'NONE') {
      throw refusal(notAllocatable('A requirement on this order is not stocked hardware.', 'Check the accepted quote.'));
    }
    return product;
  }

  /** Runs under the stock lock. Quantities add up per product, because a product can appear on more than one line. */
  private async bulkShortages(tx: Prisma.TransactionClient, lines: Requirement[], locationId: string, names: Map<string, string>) {
    const needed = new Map<string, Prisma.Decimal>();
    for (const line of lines) needed.set(line.productId, (needed.get(line.productId) ?? new Prisma.Decimal(0)).plus(line.quantity));
    const reasons: RefusalReason[] = [];
    for (const [productId, quantity] of needed) {
      const free = (await this.ledger.onHand(tx, productId, locationId)).minus(await this.ledger.reserved(tx, productId, locationId));
      if (free.lessThan(quantity)) reasons.push(short(`${names.get(productId)}: needs ${quantity.toFixed(3)}, but only ${free.toFixed(3)} is free.`));
    }
    return reasons;
  }

  /** Under the Product lock nothing else can reserve or move these products, so the choice stays valid. */
  private async chooseUnits(tx: Prisma.TransactionClient, lines: Requirement[], locationId: string, unitIds: string[] | undefined, reasons: RefusalReason[], names: Map<string, string>) {
    const needed = new Map<string, number>();
    for (const line of lines) {
      if (!line.quantity.isInteger()) throw refusal(notAllocatable('A serialized requirement must be a whole number.', 'Check the accepted quote.'));
      needed.set(line.productId, (needed.get(line.productId) ?? 0) + line.quantity.toNumber());
    }
    const chosen = new Map<string, string[]>();
    if (unitIds) {
      const rows = await tx.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, productId: true } });
      if (rows.length !== unitIds.length || rows.some((row) => !needed.has(row.productId))) {
        throw refusal(notAllocatable('Not every chosen unit is equipment this order needs.', 'Check the units against the order.'));
      }
      for (const row of rows) chosen.set(row.productId, [...(chosen.get(row.productId) ?? []), row.id]);
      for (const [productId, count] of needed) {
        if ((chosen.get(productId)?.length ?? 0) !== count) {
          throw refusal(notAllocatable(`${names.get(productId)}: choose exactly ${count} unit(s).`, 'Choose every unit this order needs, or leave the choice to the system.'));
        }
      }
      return chosen;
    }
    for (const [productId, count] of needed) {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT u."id" FROM "units" u JOIN "unit_locations" l ON l."unitId" = u."id"
        WHERE u."productId" = ${productId}::uuid AND u."status" = 'AVAILABLE' AND l."locationId" = ${locationId}::uuid
        ORDER BY u."createdAt", u."id" LIMIT ${count}::int`;
      if (rows.length < count) reasons.push(short(`${names.get(productId)}: needs ${count} unit(s), but only ${rows.length} are free.`));
      chosen.set(productId, rows.map((row) => row.id));
    }
    return chosen;
  }

  /** Two statements, so status and location are read after any wait for the lock. */
  private async lockAndCheckUnits(tx: Prisma.TransactionClient, unitIds: string[], locationId: string) {
    if (unitIds.length === 0) return;
    await tx.$queryRaw`SELECT "id" FROM "units" WHERE "id" = ANY(${unitIds}::uuid[]) ORDER BY "id" FOR NO KEY UPDATE`;
    const rows = await tx.$queryRaw<{ status: string; locationId: string | null }[]>`
      SELECT u."status"::text AS "status", l."locationId" FROM "units" u LEFT JOIN "unit_locations" l ON l."unitId" = u."id" WHERE u."id" = ANY(${unitIds}::uuid[])`;
    if (rows.length !== unitIds.length || rows.some((row) => row.status !== 'AVAILABLE' || row.locationId !== locationId)) {
      throw refusal(notAllocatable('Not every chosen unit is free in usable stock.', 'Check each unit in the lookup, or leave the choice to the system.'));
    }
  }

  private async view(client: Prisma.TransactionClient, jobId: string) {
    const rows = await client.allocation.findMany({ where: { jobId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    return allocationListResponseSchema.parse({ data: rows.map((row) => ({
      id: row.id, jobId: row.jobId, productId: row.productId, unitId: row.unitId, quantity: row.quantity.toFixed(3), status: row.status,
      source: { kind: 'QUOTE_LINE', quoteLineId: row.quoteLineId },
      releaseEvidence: row.releasedAt && row.releasedById && row.releaseReason ? {
        releasedAt: row.releasedAt.toISOString(), releasedById: row.releasedById, reason: row.releaseReason,
      } : null,
    })) });
  }
}

function notReleasable(reason: string) {
  return refusal({ code: 'ALLOCATION_NOT_RELEASABLE', reason, source: 'INVENTORY', nextAction: 'Reload the order; use the return workflow for issued equipment.' });
}
