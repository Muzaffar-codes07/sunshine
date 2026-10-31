import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeEquipmentSerial, stockReceiptViewSchema, type RefusalReason, type StockReceiptView } from '@sunshine/contracts';
import { ApiError, refusal } from '../platform/api-error';
import { IdempotencyService } from '../platform/idempotency';
import { PrismaService } from '../platform/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { StockLedgerService, type LockedProduct } from './stock-ledger.service';

type ReceiveStockInput = {
  reference: string;
  locationId: string;
  receivedAt: string;
  lines: { productId: string; quantity: string; unitCost: string; zeroCostReason?: string; serials: string[] }[];
};

const notReceivable = (reason: string, nextAction: string): RefusalReason => ({ code: 'NOT_RECEIVABLE', reason, source: 'INVENTORY', nextAction });

@Injectable()
export class StockReceiptsService {
  constructor(private readonly idempotency: IdempotencyService, private readonly ledger: StockLedgerService, private readonly prisma: PrismaService) {}

  /** Reload immutable receipt facts, including their original costs rather than today's average. */
  async get(id: string): Promise<{ data: StockReceiptView }> {
    return { data: await this.view(this.prisma, id) };
  }

  /**
   * Records a receipt once. The Idempotency-Key makes a retry return the saved response. The reference and payload
   * hash are the permanent guard: they outlive any key, so the same delivery can't be received twice under a new one.
   */
  async receive(actorId: string, key: string, input: ReceiveStockInput): Promise<{ data: StockReceiptView }> {
    const occurredAt = new Date(input.receivedAt);
    if (occurredAt.getTime() > Date.now()) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_INPUT', 'Some fields need attention', { receivedAt: ['Receipt time cannot be in the future'] });
    }
    const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.idempotency.run({ actorId, key, action: 'STOCK_RECEIPT', payload: input }, async (tx) => {
      const products = await this.ledger.lockProducts(tx, input.lines.map((line) => line.productId));
      const id = randomUUID();
      const claimed = await tx.stockDocument.createMany({ skipDuplicates: true, data: [{
        id, kind: 'RECEIPT', reference: input.reference, payloadHash, actorId, toLocationId: input.locationId, occurredAt,
      }] }).catch((error: unknown) => {
        if (isForeignKeyError(error)) throw refusal(notReceivable('This stock location does not exist.', 'Choose a location from the stock location list.'));
        throw error;
      });
      if (claimed.count === 0) return { data: await this.replay(tx, input.reference, payloadHash) };
      await this.assertLocationReceivable(tx, input.locationId);
      // Lines first, because a DONE document is frozen; then validate; then post, because only DONE documents can post.
      const lines = [];
      for (const [index, line] of input.lines.entries()) {
        lines.push(await this.createLine(tx, id, index + 1, line, products.get(line.productId)));
      }
      await tx.stockDocument.update({ where: { id }, data: { status: 'DONE', validatedAt: new Date(), version: { increment: 1 } } });
      for (const line of lines) await this.postLine(tx, { actorId, occurredAt, locationId: input.locationId, ...line });
      return { data: await this.view(tx, id) };
    });
  }

  private async assertLocationReceivable(tx: Prisma.TransactionClient, locationId: string) {
    const location = await tx.stockLocation.findUniqueOrThrow({ where: { id: locationId } });
    if (!location.active || location.kind !== 'USABLE') {
      throw refusal(notReceivable('Goods can only be received into an active usable location.', 'Choose a usable stock location.'));
    }
  }

  private async createLine(tx: Prisma.TransactionClient, documentId: string, lineNumber: number, line: ReceiveStockInput['lines'][number], product: LockedProduct | undefined) {
    if (!product?.active || product.kind !== 'HARDWARE' || product.trackingMode === 'NONE') {
      throw refusal(notReceivable(`Line ${lineNumber}: this product is not active stocked hardware.`, 'Choose an active hardware product.'));
    }
    const serialized = product.trackingMode === 'SERIALIZED';
    if (serialized && line.serials.length === 0) {
      throw refusal(notReceivable(`Line ${lineNumber}: this product needs a serial for each unit.`, 'Enter or scan every serial, then try again.'));
    }
    if (!serialized && line.serials.length > 0) {
      throw refusal(notReceivable(`Line ${lineNumber}: this product is tracked by quantity and takes no serials.`, 'Remove the serials, then try again.'));
    }
    const quantity = new Prisma.Decimal(line.quantity);
    const unitCost = new Prisma.Decimal(line.unitCost);
    const created = await tx.stockDocumentLine.create({ data: {
      documentId, lineNumber, productId: line.productId, quantity, unitCost, zeroCostReason: line.zeroCostReason,
    } });
    return { lineId: created.id, productId: line.productId, quantity, unitCost, serials: line.serials, manufacturerId: product.manufacturerId };
  }

  private async postLine(tx: Prisma.TransactionClient, args: {
    actorId: string; occurredAt: Date; locationId: string; lineId: string; productId: string; quantity: Prisma.Decimal; unitCost: Prisma.Decimal;
    serials: string[]; manufacturerId: string | null;
  }) {
    if (args.serials.length === 0) await this.updateAverageCost(tx, args.productId, args.quantity, args.unitCost);
    const movement = await this.ledger.post(tx, {
      documentLineId: args.lineId, productId: args.productId, toLocationId: args.locationId, quantity: args.quantity, actorId: args.actorId, occurredAt: args.occurredAt,
    });
    if (args.serials.length === 0) return;
    const units = args.serials.map((rawSerial) => ({
      id: randomUUID(), productId: args.productId, manufacturerId: args.manufacturerId!, rawSerial,
      normalizedSerial: normalizeEquipmentSerial(rawSerial), acquisitionCost: args.unitCost, receiptLineId: args.lineId,
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
    const document = await tx.stockDocument.findFirst({ where: { id, kind: 'RECEIPT', status: 'DONE' }, include: { lines: {
      orderBy: { lineNumber: 'asc' }, include: { movement: { select: { id: true } }, units: { select: { id: true }, orderBy: { normalizedSerial: 'asc' } } },
    } } });
    if (!document) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Stock receipt not found');
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
