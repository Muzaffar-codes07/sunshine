import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeEquipmentSerial, stockReceiptViewSchema, type RefusalReason, type StockReceiptView } from '@sunshine/contracts';
import { ApiError, refusal } from '../platform/api-error';
import { PrismaService } from '../platform/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { StockLedgerService } from './stock-ledger.service';

type ReceiveStockInput = {
  reference: string;
  locationId: string;
  receivedAt: string;
  lines: { productId: string; quantity: string; unitCost: string; zeroCostReason?: string; serials: string[] }[];
};

const notReceivable = (reason: string, nextAction: string): RefusalReason => ({ code: 'NOT_RECEIVABLE', reason, source: 'INVENTORY', nextAction });

@Injectable()
export class StockReceiptsService {
  constructor(private readonly prisma: PrismaService, private readonly ledger: StockLedgerService) {}

  /** Records a receipt once: a retry with the same reference and body returns the saved result. */
  async receive(actorId: string, input: ReceiveStockInput): Promise<{ data: StockReceiptView }> {
    const occurredAt = new Date(input.receivedAt);
    if (occurredAt.getTime() > Date.now()) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_INPUT', 'Some fields need attention', { receivedAt: ['Receipt time cannot be in the future'] });
    }
    const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const products = await this.lockProducts(tx, input.lines.map((line) => line.productId));
      const id = randomUUID();
      const claimed = await tx.stockDocument.createMany({ skipDuplicates: true, data: [{
        id, kind: 'RECEIPT', reference: input.reference, payloadHash, actorId, toLocationId: input.locationId, occurredAt,
      }] }).catch((error: unknown) => {
        if (isForeignKeyError(error)) throw refusal(notReceivable('This stock location does not exist.', 'Choose a location from the stock location list.'));
        throw error;
      });
      if (claimed.count === 0) return { data: await this.replay(tx, input.reference, payloadHash) };
      await this.assertLocationReceivable(tx, input.locationId);
      await tx.stockDocument.update({ where: { id }, data: { status: 'DONE', validatedAt: new Date(), version: { increment: 1 } } });
      for (const [index, line] of input.lines.entries()) {
        await this.receiveLine(tx, { id, actorId, occurredAt, locationId: input.locationId, lineNumber: index + 1, line, product: products.get(line.productId) });
      }
      return { data: await this.view(tx, id) };
    }, { timeout: 20_000 });
  }

  /** Product rows first, in sorted order: the start of the global lock order. No KEY lock, so FK inserts aren't blocked. */
  private async lockProducts(tx: Prisma.TransactionClient, ids: string[]) {
    const unique = [...new Set(ids)].sort();
    const rows = await tx.$queryRaw<{ id: string; kind: string; trackingMode: string; active: boolean; manufacturerId: string | null }[]>`
      SELECT "id", "kind"::text AS "kind", "trackingMode"::text AS "trackingMode", "active", "manufacturerId" FROM "products"
      WHERE "id" = ANY(${unique}::uuid[]) ORDER BY "id" FOR NO KEY UPDATE`;
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async assertLocationReceivable(tx: Prisma.TransactionClient, locationId: string) {
    const location = await tx.stockLocation.findUniqueOrThrow({ where: { id: locationId } });
    if (!location.active || location.kind !== 'USABLE') {
      throw refusal(notReceivable('Goods can only be received into an active usable location.', 'Choose a usable stock location.'));
    }
  }

  private async receiveLine(tx: Prisma.TransactionClient, args: {
    id: string; actorId: string; occurredAt: Date; locationId: string; lineNumber: number; line: ReceiveStockInput['lines'][number];
    product: { kind: string; trackingMode: string; active: boolean; manufacturerId: string | null } | undefined;
  }) {
    const { line, product } = args;
    if (!product?.active || product.kind !== 'HARDWARE' || product.trackingMode === 'NONE') {
      throw refusal(notReceivable(`Line ${args.lineNumber}: this product is not active stocked hardware.`, 'Choose an active hardware product.'));
    }
    const serialized = product.trackingMode === 'SERIALIZED';
    if (serialized && line.serials.length === 0) {
      throw refusal(notReceivable(`Line ${args.lineNumber}: this product needs a serial for each unit.`, 'Enter or scan every serial, then try again.'));
    }
    if (!serialized && line.serials.length > 0) {
      throw refusal(notReceivable(`Line ${args.lineNumber}: this product is tracked by quantity and takes no serials.`, 'Remove the serials, then try again.'));
    }
    const quantity = new Prisma.Decimal(line.quantity);
    const unitCost = new Prisma.Decimal(line.unitCost);
    const created = await tx.stockDocumentLine.create({ data: {
      documentId: args.id, lineNumber: args.lineNumber, productId: line.productId, quantity, unitCost, zeroCostReason: line.zeroCostReason,
    } });
    if (!serialized) await this.updateAverageCost(tx, line.productId, quantity, unitCost);
    const movement = await this.ledger.post(tx, {
      documentLineId: created.id, productId: line.productId, toLocationId: args.locationId, quantity, actorId: args.actorId, occurredAt: args.occurredAt,
    });
    if (!serialized) return;
    const units = line.serials.map((rawSerial) => ({
      id: randomUUID(), productId: line.productId, manufacturerId: product.manufacturerId!, rawSerial,
      normalizedSerial: normalizeEquipmentSerial(rawSerial), acquisitionCost: unitCost, receiptLineId: created.id,
    }));
    await tx.unit.createMany({ data: units });
    await tx.unitMovement.createMany({ data: units.map((unit) => ({ unitId: unit.id, movementId: movement.id })) });
  }

  /** Runs under the Product lock, in posting order, before this line's stock is added. Backdating doesn't rewrite it. */
  private async updateAverageCost(tx: Prisma.TransactionClient, productId: string, quantity: Prisma.Decimal, unitCost: Prisma.Decimal) {
    const held = await this.ledger.usableOnHand(tx, productId);
    const current = await tx.productCostBasis.findUnique({ where: { productId } });
    const averageCost = current && held.greaterThan(0)
      ? held.times(current.averageCost).plus(quantity.times(unitCost)).dividedBy(held.plus(quantity)).toDecimalPlaces(6)
      : unitCost;
    await tx.productCostBasis.upsert({ where: { productId }, update: { averageCost }, create: { productId, averageCost } });
  }

  private async replay(tx: Prisma.TransactionClient, reference: string, payloadHash: string) {
    const existing = await tx.stockDocument.findUniqueOrThrow({ where: { kind_reference: { kind: 'RECEIPT', reference } } });
    if (existing.payloadHash !== payloadHash) {
      throw refusal({
        code: 'IDEMPOTENCY_CONFLICT', reason: 'This receipt reference was already used for different goods.', source: 'INVENTORY',
        nextAction: 'Use the correct reference, or open the existing receipt.',
      });
    }
    return this.view(tx, existing.id);
  }

  private async view(tx: Prisma.TransactionClient, id: string): Promise<StockReceiptView> {
    const document = await tx.stockDocument.findUniqueOrThrow({ where: { id }, include: { lines: {
      orderBy: { lineNumber: 'asc' }, include: { movement: { select: { id: true } }, units: { select: { id: true }, orderBy: { normalizedSerial: 'asc' } } },
    } } });
    return stockReceiptViewSchema.parse({
      id: document.id, reference: document.reference, status: document.status, locationId: document.toLocationId, actorId: document.actorId,
      receivedAt: document.occurredAt.toISOString(), recordedAt: document.recordedAt.toISOString(),
      lines: document.lines.map((line) => ({
        id: line.id, productId: line.productId, quantity: line.quantity.toFixed(3), unitCost: line.unitCost?.toFixed(2),
        zeroCostReason: line.zeroCostReason, movementId: line.movement?.id, unitIds: line.units.map((unit) => unit.id),
      })),
    });
  }
}

function isForeignKeyError(error: unknown) {
  return (error as { code?: string } | null)?.code === 'P2003';
}
