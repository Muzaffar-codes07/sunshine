import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { DeliverDispatchRequest, DispatchRequest } from '@sunshine/contracts';
import { CostWriterService } from '../finance/cost-writer.service';
import { ApiError, refusal } from '../platform/api-error';
import { IdempotencyService } from '../platform/idempotency';
import { Prisma } from '../generated/prisma/client';
import { DispatchScansService } from './dispatch-scans.service';
import { StockLedgerService } from './stock-ledger.service';
import { activateFromDelivery } from '../warranty/warranty-activation';

const notFound = () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Dispatch not found');
const stale = () => new ApiError(HttpStatus.CONFLICT, 'STALE_VERSION', 'This dispatch was changed by someone else. Reload it and try again.');
const blocked = (code: string, reason: string, nextAction: string) => refusal({ code, reason, source: 'INVENTORY', nextAction });
const invalidTime = (message: string) => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_INPUT', 'Some fields need attention', { deliveredAt: [message] });

/** Takes goods out of the ledger and hands them over. Each command changes stock, cost and status together or not at all. */
@Injectable()
export class DispatchPostingService {
  constructor(private readonly idempotency: IdempotencyService, private readonly scans: DispatchScansService, private readonly ledger: StockLedgerService, private readonly costs: CostWriterService) {}

  async dispatch(actorId: string, key: string, rawId: string, input: DispatchRequest) {
    const id = rawId.toLowerCase();
    return this.idempotency.run({ actorId, key, action: 'DISPATCH_POST', payload: { id, ...input } }, async (tx) => {
      const head = await tx.dispatch.findUnique({ where: { id }, select: { orderId: true } });
      if (!head) throw notFound();
      const job = await this.scans.lockJob(tx, head.orderId);
      const claimed = await tx.dispatch.updateMany({ where: { id, version: input.expectedVersion, status: 'DRAFT' }, data: { version: { increment: 1 } } });
      if (claimed.count !== 1) {
        const current = await tx.dispatch.findUniqueOrThrow({ where: { id }, select: { status: true } });
        if (current.status === 'DRAFT') throw stale();
        throw blocked('DISPATCH_ALREADY_POSTED', 'This dispatch has already left the warehouse.', 'Reload the order.');
      }
      await this.lockEverything(tx, head.orderId);
      // Read after the locks, so nothing below can change before the commit.
      const { rows, valid, order } = await this.scans.source(tx, head.orderId);
      if (!valid) throw blocked('DISPATCH_NOT_READY', 'The reservation no longer covers the whole order, or stock is short.', 'Check the order\'s reservation and stock, then try again.');
      const scanned = await tx.dispatchScan.findMany({ where: { dispatchId: id, method: { not: 'TYPED' }, allocationId: { in: rows.map((row) => row.id) } }, select: { allocationId: true } });
      const done = new Set(scanned.map((scan) => scan.allocationId));
      const missing = rows.filter((row) => row.unitId && !done.has(row.id)).length;
      if (missing) throw blocked('SCANS_MISSING', `${missing} required unit(s) haven't been scanned.`, 'Scan every required unit, then dispatch.');

      const products = new Map((await tx.product.findMany({ where: { id: { in: rows.map((row) => row.productId) } }, select: { id: true, name: true, costBasis: { select: { averageCost: true } } } })).map((row) => [row.id, row]));
      const priced = rows.map((row) => {
        const product = products.get(row.productId)!;
        // Actual cost for a serial unit; the moving average, frozen now, for bulk. Later price changes never touch this.
        const amount = row.unit ? row.unit.acquisitionCost : product.costBasis ? row.quantity.times(product.costBasis.averageCost).toDecimalPlaces(2) : null;
        if (amount === null) throw blocked('DISPATCH_COST_UNKNOWN', `${product.name} has no recorded cost.`, 'Receive it with its actual cost, then dispatch.');
        return { row, product, amount };
      });
      const now = new Date();
      const locationId = rows[0]!.locationId;
      const documentId = randomUUID();
      await tx.stockDocument.create({ data: {
        id: documentId, kind: 'ISSUE', reference: `DISPATCH:${id}`, payloadHash: createHash('sha256').update(id).digest('hex'), actorId, fromLocationId: locationId, occurredAt: now,
      } });
      const lines = priced.map((item, index) => ({ id: randomUUID(), documentId, lineNumber: index + 1, productId: item.row.productId, quantity: item.row.quantity }));
      await tx.stockDocumentLine.createMany({ data: lines });
      await tx.stockDocument.update({ where: { id: documentId }, data: { status: 'DONE', validatedAt: now, validatedById: actorId, version: { increment: 1 } } });
      for (const [index, item] of priced.entries()) {
        const movement = await this.ledger.post(tx, { documentLineId: lines[index]!.id, productId: item.row.productId, fromLocationId: locationId, quantity: item.row.quantity, actorId, occurredAt: now });
        if (item.row.unitId) {
          await tx.unitMovement.create({ data: { unitId: item.row.unitId, movementId: movement.id } });
          await tx.unit.update({ where: { id: item.row.unitId }, data: { status: 'DISPATCHED', version: { increment: 1 } } });
        }
        await tx.allocation.update({ where: { id: item.row.id }, data: { status: 'DISPATCHED', version: { increment: 1 } } });
        await this.costs.postCost(tx, {
          uniqueSourceId: `STOCK_MOVEMENT:${movement.id}`, costType: 'MATERIAL_DISPATCH', jobId: job.id, amount: item.amount.toFixed(2),
          description: `${item.product.name} dispatched for order ${order.id}`, occurredAt: now.toISOString(),
        });
      }
      await tx.dispatch.update({ where: { id }, data: { status: 'DISPATCHED', dispatchedAt: now, dispatchedById: actorId, issueDocumentId: documentId, version: { increment: 1 } } });
      return this.scans.view(tx, id);
    });
  }

  async deliver(actorId: string, key: string, rawId: string, input: DeliverDispatchRequest) {
    const id = rawId.toLowerCase();
    const deliveredAt = new Date(input.deliveredAt);
    if (deliveredAt.getTime() > Date.now()) throw invalidTime('This time has not happened yet');
    return this.idempotency.run({ actorId, key, action: 'DISPATCH_DELIVER', payload: { id, ...input } }, async (tx) => {
      const claimed = await tx.dispatch.updateMany({ where: { id, version: input.expectedVersion, status: 'DISPATCHED' }, data: { version: { increment: 1 } } });
      const current = await tx.dispatch.findUnique({ where: { id }, select: { status: true, dispatchedAt: true, order: { select: { jobId: true } } } });
      if (!current) throw notFound();
      if (claimed.count !== 1) {
        if (current.status === 'DISPATCHED') throw stale();
        throw current.status === 'DELIVERED'
          ? blocked('DISPATCH_ALREADY_DELIVERED', 'This dispatch is already delivered, and its dates are final.', 'Reload the order.')
          : blocked('DISPATCH_NOT_POSTED', 'This dispatch hasn\'t left the warehouse yet.', 'Dispatch it first.');
      }
      if (deliveredAt < current.dispatchedAt!) throw invalidTime('Delivery can\'t be before the dispatch');
      const jobId = current.order.jobId!;
      const units = await tx.allocation.findMany({ where: { jobId, status: 'DISPATCHED' }, select: { unitId: true } });
      await tx.allocation.updateMany({ where: { jobId, status: 'DISPATCHED' }, data: { status: 'DELIVERED', version: { increment: 1 } } });
      await tx.unit.updateMany({ where: { id: { in: units.flatMap((row) => row.unitId ? [row.unitId] : []) } }, data: { status: 'DELIVERED', version: { increment: 1 } } });
      await activateFromDelivery(tx, { jobId, deliveredAt });
      await tx.dispatch.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt, deliveredById: actorId, version: { increment: 1 } } });
      return this.scans.view(tx, id);
    });
  }

  /** The global lock order: Product rows, then sorted (product, location), then Unit rows. */
  private async lockEverything(tx: Prisma.TransactionClient, orderId: string) {
    const { rows } = await this.scans.source(tx, orderId);
    await this.ledger.lockProducts(tx, rows.map((row) => row.productId));
    for (const [productId, locationId] of [...new Set(rows.map((row) => `${row.productId}|${row.locationId}`))].sort().map((pair) => pair.split('|') as [string, string])) {
      await this.ledger.lockStock(tx, productId, locationId);
    }
    const unitIds = rows.flatMap((row) => row.unitId ? [row.unitId] : []).sort();
    if (unitIds.length) await tx.$queryRaw`SELECT "id" FROM "units" WHERE "id" = ANY(${unitIds}::uuid[]) ORDER BY "id" FOR NO KEY UPDATE`;
  }
}
