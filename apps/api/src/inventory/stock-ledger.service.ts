import { Injectable } from '@nestjs/common';
import { refusal } from '../platform/api-error';
import { Prisma } from '../generated/prisma/client';

export type LockedProduct = { id: string; kind: string; trackingMode: string; active: boolean; manufacturerId: string | null };

export interface PostMovementInput {
  documentLineId: string;
  productId: string;
  fromLocationId?: string;
  toLocationId?: string;
  quantity: Prisma.Decimal;
  actorId: string;
  occurredAt: Date;
}

/**
 * The only code that writes stock_movements. It always uses the caller's transaction, so stock, cost and any
 * follow-on effects commit together. Callers take Product row locks first; see the global lock order in the data model.
 */
@Injectable()
export class StockLedgerService {
  async post(tx: Prisma.TransactionClient, input: PostMovementInput) {
    if (input.fromLocationId) {
      await this.lockStock(tx, input.productId, input.fromLocationId);
      const onHand = await this.onHand(tx, input.productId, input.fromLocationId);
      if (onHand.lessThan(input.quantity)) {
        throw refusal({
          code: 'INSUFFICIENT_STOCK', reason: `Only ${onHand.toFixed(3)} is on hand at this location.`, source: 'INVENTORY',
          nextAction: 'Receive more stock or choose another location, then try again.',
        });
      }
    }
    return tx.stockMovement.create({ data: input });
  }

  /** Product rows first, in sorted order: the start of the global lock order. No KEY lock, so FK inserts aren't blocked. */
  async lockProducts(tx: Prisma.TransactionClient, ids: string[]) {
    const rows = await tx.$queryRaw<LockedProduct[]>`
      SELECT "id", "kind"::text AS "kind", "trackingMode"::text AS "trackingMode", "active", "manufacturerId" FROM "products"
      WHERE "id" = ANY(${[...new Set(ids)].sort()}::uuid[]) ORDER BY "id" FOR NO KEY UPDATE`;
    return new Map(rows.map((row) => [row.id, row]));
  }

  /** Serialises everything that removes this product from this location until the transaction ends. */
  async lockStock(tx: Prisma.TransactionClient, productId: string, locationId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${productId}:${locationId}`}::text, 0))`;
  }

  async onHand(tx: Prisma.TransactionClient, productId: string, locationId: string) {
    const rows = await tx.$queryRaw<{ quantity: Prisma.Decimal }[]>`
      SELECT "quantity" FROM "stock_on_hand" WHERE "productId" = ${productId}::uuid AND "locationId" = ${locationId}::uuid`;
    return rows[0]?.quantity ?? new Prisma.Decimal(0);
  }

  /** Total across usable locations; quarantined stock can't be sold, so it doesn't affect the average. */
  async usableOnHand(tx: Prisma.TransactionClient, productId: string) {
    const rows = await tx.$queryRaw<{ quantity: Prisma.Decimal | null }[]>`
      SELECT SUM(s."quantity") AS "quantity" FROM "stock_on_hand" s JOIN "stock_locations" l ON l."id" = s."locationId"
      WHERE s."productId" = ${productId}::uuid AND l."kind" = 'USABLE'`;
    return rows[0]?.quantity ?? new Prisma.Decimal(0);
  }
}
