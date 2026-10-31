import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeEquipmentSerial, stockDocumentViewSchema, type CreateStockCountRequest, type CreateStockTransferRequest,
  type RefusalReason, type StockDocumentCommandRequest, type StockDocumentView } from '@sunshine/contracts';
import { ApiError, refusal } from '../platform/api-error';
import { IdempotencyService } from '../platform/idempotency';
import { PrismaService } from '../platform/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { StockLedgerService, type LockedProduct } from './stock-ledger.service';

type Document = Prisma.StockDocumentGetPayload<{ include: { lines: { include: { plannedUnits: true } } } }>;

const notMovable = (reason: string, nextAction: string): RefusalReason => ({ code: 'NOT_MOVABLE', reason, source: 'INVENTORY', nextAction });

/** Transfers and counts: a draft that changes nothing, then one validation that posts every line or none. */
@Injectable()
export class StockDocumentsService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService, private readonly ledger: StockLedgerService) {}

  async createTransfer(actorId: string, key: string, input: CreateStockTransferRequest): Promise<{ data: StockDocumentView }> {
    return this.idempotency.run({ actorId, key, action: 'STOCK_TRANSFER_DRAFT', payload: input }, async (tx) => {
      const id = await this.claim(tx, 'TRANSFER', actorId, input, { fromLocationId: input.fromLocationId, toLocationId: input.toLocationId });
      if (!id.created) return { data: await this.view(tx, id.id) };
      this.assertNotQuarantine(await this.assertLocationsActive(tx, [input.fromLocationId, input.toLocationId]), input.fromLocationId);
      const products = await this.readProducts(tx, input.lines.map((line) => line.productId));
      for (const [index, line] of input.lines.entries()) {
        const product = this.stocked(products.get(line.productId), index + 1);
        const serialized = product.trackingMode === 'SERIALIZED';
        if (serialized && line.serials.length === 0) {
          throw refusal(notMovable(`Line ${index + 1}: this product needs a serial for each unit.`, 'Enter or scan every serial, then try again.'));
        }
        if (!serialized && line.serials.length > 0) {
          throw refusal(notMovable(`Line ${index + 1}: this product is tracked by quantity and takes no serials.`, 'Remove the serials, then try again.'));
        }
        const created = await tx.stockDocumentLine.create({ data: { documentId: id.id, lineNumber: index + 1, productId: line.productId, quantity: new Prisma.Decimal(line.quantity) } });
        if (!serialized) continue;
        const normalized = line.serials.map(normalizeEquipmentSerial);
        const units = await tx.unit.findMany({ where: { productId: line.productId, normalizedSerial: { in: normalized } }, select: { id: true } });
        if (units.length !== normalized.length) {
          throw refusal(notMovable(`Line ${index + 1}: not every serial belongs to this product.`, 'Check the serials against the unit lookup.'));
        }
        await tx.stockDocumentLineUnit.createMany({ data: units.map((unit) => ({ id: randomUUID(), lineId: created.id, unitId: unit.id })) });
      }
      return { data: await this.view(tx, id.id) };
    });
  }

  async createCount(actorId: string, key: string, input: CreateStockCountRequest): Promise<{ data: StockDocumentView }> {
    return this.idempotency.run({ actorId, key, action: 'STOCK_COUNT_DRAFT', payload: input }, async (tx) => {
      const id = await this.claim(tx, 'ADJUSTMENT', actorId, input, { toLocationId: input.locationId });
      if (!id.created) return { data: await this.view(tx, id.id) };
      await this.assertLocationsActive(tx, [input.locationId]);
      const products = await this.readProducts(tx, input.lines.map((line) => line.productId));
      for (const [index, line] of input.lines.entries()) {
        if (this.stocked(products.get(line.productId), index + 1).trackingMode === 'SERIALIZED') {
          throw refusal(notMovable(`Line ${index + 1}: serialized stock can't be counted by quantity yet.`, 'Use the unit lookup to check each serial, and move a damaged unit to quarantine.'));
        }
        await tx.stockDocumentLine.create({ data: {
          documentId: id.id, lineNumber: index + 1, productId: line.productId, quantity: new Prisma.Decimal(0), countedQuantity: new Prisma.Decimal(line.countedQuantity),
        } });
      }
      return { data: await this.view(tx, id.id) };
    });
  }

  async get(id: string): Promise<{ data: StockDocumentView }> {
    return { data: await this.view(this.prisma, id) };
  }

  /** Claiming first makes one caller the winner. A refusal later rolls the claim back, so the draft stays open. */
  async validate(actorId: string, key: string, id: string, input: StockDocumentCommandRequest): Promise<{ data: StockDocumentView }> {
    return this.idempotency.run({ actorId, key, action: 'STOCK_DOCUMENT_VALIDATE', payload: { id, ...input } }, async (tx) => {
      await this.claimForChange(tx, id, input.expectedVersion, 'READY');
      const document = await tx.stockDocument.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { lineNumber: 'asc' }, include: { plannedUnits: true } } } });
      const products = await this.ledger.lockProducts(tx, document.lines.map((line) => line.productId));
      // A count locks its one location for every line, because it measures even where it only adds.
      const lockedLocation = document.kind === 'TRANSFER' ? document.fromLocationId! : document.toLocationId!;
      for (const productId of [...new Set(document.lines.map((line) => line.productId))].sort()) await this.ledger.lockStock(tx, productId, lockedLocation);
      const validatedAt = new Date();
      if (document.kind === 'TRANSFER') await this.postTransfer(tx, actorId, document, products, validatedAt);
      else await this.postCount(tx, actorId, document, products, validatedAt);
      return { data: await this.view(tx, id) };
    });
  }

  async cancel(actorId: string, key: string, id: string, input: StockDocumentCommandRequest): Promise<{ data: StockDocumentView }> {
    return this.idempotency.run({ actorId, key, action: 'STOCK_DOCUMENT_CANCEL', payload: { id, ...input } }, async (tx) => {
      await this.claimForChange(tx, id, input.expectedVersion, 'CANCELED');
      return { data: await this.view(tx, id) };
    });
  }

  private async claim(tx: Prisma.TransactionClient, kind: 'TRANSFER' | 'ADJUSTMENT', actorId: string, input: { reference: string }, locations: { fromLocationId?: string; toLocationId: string }) {
    const id = randomUUID();
    const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const claimed = await tx.stockDocument.createMany({ skipDuplicates: true, data: [{ id, kind, reference: input.reference, payloadHash, actorId, occurredAt: new Date(), ...locations }] }).catch((error: unknown) => {
      if ((error as { code?: string } | null)?.code === 'P2003') throw refusal(notMovable('This stock location does not exist.', 'Choose a location from the stock location list.'));
      throw error;
    });
    if (claimed.count === 1) return { id, created: true };
    const existing = await tx.stockDocument.findUniqueOrThrow({ where: { kind_reference: { kind, reference: input.reference } } });
    if (existing.payloadHash !== payloadHash) {
      throw refusal({
        code: 'IDEMPOTENCY_CONFLICT', reason: 'This reference was already used for a different document.', source: 'INVENTORY',
        nextAction: 'Use a new reference, or open the existing document.',
      });
    }
    return { id: existing.id, created: false };
  }

  /** The conditional update is the claim: a second caller waits here, then finds the status or version changed. */
  private async claimForChange(tx: Prisma.TransactionClient, id: string, expectedVersion: number, status: 'READY' | 'CANCELED') {
    const claimed = await tx.stockDocument.updateMany({
      where: { id, status: 'DRAFT', version: expectedVersion, kind: { in: ['TRANSFER', 'ADJUSTMENT'] } },
      data: { status, version: { increment: 1 } },
    });
    if (claimed.count === 1) return;
    const current = await tx.stockDocument.findUnique({ where: { id } });
    if (!current) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Stock document not found');
    if (current.status === 'DRAFT' && current.version !== expectedVersion && current.kind !== 'RECEIPT' && current.kind !== 'ISSUE') {
      throw new ApiError(HttpStatus.CONFLICT, 'STALE_VERSION', 'This document was changed by someone else. Reload it and try again.');
    }
    throw refusal({
      code: 'DOCUMENT_NOT_OPEN', reason: `This ${current.kind.toLowerCase()} document is ${current.status.toLowerCase()} and can't change here.`, source: 'INVENTORY',
      nextAction: 'Reload the document. A posted document is corrected with a new one.',
    });
  }

  private async postTransfer(tx: Prisma.TransactionClient, actorId: string, document: Document, products: Map<string, LockedProduct>, validatedAt: Date) {
    const from = document.fromLocationId!;
    const to = document.toLocationId!;
    const locations = await this.assertLocationsActive(tx, [from, to]);
    this.assertNotQuarantine(locations, from);
    const unitIds = document.lines.flatMap((line) => line.plannedUnits.map((planned) => planned.unitId)).sort();
    const nextStatus = locations.get(to) === 'QUARANTINE' ? 'QUARANTINED' : 'AVAILABLE';
    if (unitIds.length) {
      // Two statements, so the location is read after any wait for the lock.
      await tx.$queryRaw`SELECT "id" FROM "units" WHERE "id" = ANY(${unitIds}::uuid[]) ORDER BY "id" FOR NO KEY UPDATE`;
      const units = await tx.$queryRaw<{ id: string; productId: string; status: string; locationId: string | null }[]>`
        SELECT u."id", u."productId", u."status"::text AS "status", l."locationId" FROM "units" u LEFT JOIN "unit_locations" l ON l."unitId" = u."id"
        WHERE u."id" = ANY(${unitIds}::uuid[])`;
      const byId = new Map(units.map((unit) => [unit.id, unit]));
      const fits = byId.size === unitIds.length && new Set(unitIds).size === unitIds.length && document.lines.every((line) => line.plannedUnits.every((planned) => {
        const unit = byId.get(planned.unitId);
        return unit?.productId === line.productId && unit.locationId === from && unit.status === 'AVAILABLE';
      }));
      if (!fits) throw refusal(notMovable("Not every unit on this draft is free to move from this location.", 'Check each unit in the lookup, then cancel this draft and make a new one.'));
    }
    // Serialized stock moves only with its units, and bulk never has any, so a line can't move quantity without them.
    for (const line of document.lines) {
      const serialized = this.stocked(products.get(line.productId), line.lineNumber).trackingMode === 'SERIALIZED';
      if (serialized ? !line.quantity.equals(line.plannedUnits.length) : line.plannedUnits.length > 0) {
        throw refusal(notMovable(`Line ${line.lineNumber}: its quantity doesn't match its units.`, 'Cancel this draft and make a new one.'));
      }
    }
    await tx.stockDocument.update({ where: { id: document.id }, data: { status: 'DONE', validatedAt, validatedById: actorId, occurredAt: validatedAt, version: { increment: 1 } } });
    for (const line of document.lines) {
      const movement = await this.ledger.post(tx, {
        documentLineId: line.id, productId: line.productId, fromLocationId: from, toLocationId: to, quantity: line.quantity, actorId, occurredAt: validatedAt,
      });
      const lineUnits = line.plannedUnits.map((planned) => planned.unitId);
      if (lineUnits.length === 0) continue;
      await tx.unitMovement.createMany({ data: lineUnits.map((unitId) => ({ id: randomUUID(), unitId, movementId: movement.id })) });
      await tx.unit.updateMany({ where: { id: { in: lineUnits } }, data: { status: nextStatus, version: { increment: 1 } } });
    }
  }

  /** Measures under the lock and posts only the difference. A surplus adds at the current average, which doesn't change it. */
  private async postCount(tx: Prisma.TransactionClient, actorId: string, document: Document, products: Map<string, LockedProduct>, validatedAt: Date) {
    const location = document.toLocationId!;
    await this.assertLocationsActive(tx, [location]);
    const postings: { lineId: string; productId: string; quantity: Prisma.Decimal; shortage: boolean }[] = [];
    for (const line of document.lines) {
      if (this.stocked(products.get(line.productId), line.lineNumber).trackingMode === 'SERIALIZED') {
        throw refusal(notMovable(`Line ${line.lineNumber}: serialized stock can't be counted by quantity yet.`, 'Cancel this count.'));
      }
      const measured = await this.ledger.onHand(tx, line.productId, location);
      const counted = line.countedQuantity!;
      const difference = counted.minus(measured).abs();
      if (counted.greaterThan(measured) && !(await tx.productCostBasis.findUnique({ where: { productId: line.productId } }))) {
        throw refusal(notMovable(`Line ${line.lineNumber}: this product has no cost yet, so a surplus has no value.`, 'Receive it with its actual cost instead.'));
      }
      await tx.stockDocumentLine.update({ where: { id: line.id }, data: { measuredQuantity: measured, quantity: difference } });
      if (difference.greaterThan(0)) postings.push({ lineId: line.id, productId: line.productId, quantity: difference, shortage: counted.lessThan(measured) });
    }
    await tx.stockDocument.update({ where: { id: document.id }, data: { status: 'DONE', validatedAt, validatedById: actorId, occurredAt: validatedAt, version: { increment: 1 } } });
    for (const posting of postings) {
      await this.ledger.post(tx, {
        documentLineId: posting.lineId, productId: posting.productId, quantity: posting.quantity, actorId, occurredAt: validatedAt,
        ...(posting.shortage ? { fromLocationId: location } : { toLocationId: location }),
      });
    }
  }

  private async readProducts(tx: Prisma.TransactionClient, ids: string[]) {
    const rows = await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, kind: true, trackingMode: true, active: true, manufacturerId: true } });
    return new Map<string, LockedProduct>(rows.map((row) => [row.id, row]));
  }

  /** Discontinued products still count: their remaining stock can be moved and counted. */
  private stocked(product: LockedProduct | undefined, lineNumber: number) {
    if (!product || product.kind !== 'HARDWARE' || product.trackingMode === 'NONE') {
      throw refusal(notMovable(`Line ${lineNumber}: this product is not stocked hardware.`, 'Choose a hardware product.'));
    }
    return product;
  }

  /** Leaving quarantine needs an inspection, and bulk needs its quarantine value carried back; neither exists yet. */
  private assertNotQuarantine(locations: Map<string, string>, from: string) {
    if (locations.get(from) === 'QUARANTINE') {
      throw refusal(notMovable("Stock can't leave quarantine by transfer yet.", 'Keep it in quarantine until the inspection and release step is available.'));
    }
  }

  private async assertLocationsActive(tx: Prisma.TransactionClient, ids: string[]) {
    const rows = await tx.stockLocation.findMany({ where: { id: { in: ids } } });
    if (rows.length !== new Set(ids).size || rows.some((row) => !row.active)) {
      throw refusal(notMovable('Stock can only move through active locations.', 'Choose a location from the stock location list.'));
    }
    return new Map(rows.map((row) => [row.id, row.kind]));
  }

  private async view(client: Prisma.TransactionClient, id: string): Promise<StockDocumentView> {
    const document = await client.stockDocument.findUnique({ where: { id }, include: { lines: {
      orderBy: { lineNumber: 'asc' }, include: { movement: { select: { id: true } }, plannedUnits: { select: { unitId: true }, orderBy: { unitId: 'asc' } }, units: { select: { id: true }, orderBy: { id: 'asc' } } },
    } } });
    if (!document) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Stock document not found');
    return stockDocumentViewSchema.parse({
      id: document.id, kind: document.kind, reference: document.reference, status: document.status, version: document.version,
      fromLocationId: document.fromLocationId, toLocationId: document.toLocationId, actorId: document.actorId, validatedById: document.validatedById,
      occurredAt: document.occurredAt.toISOString(), recordedAt: document.recordedAt.toISOString(), validatedAt: document.validatedAt?.toISOString() ?? null,
      lines: document.lines.map((line) => ({
        id: line.id, lineNumber: line.lineNumber, productId: line.productId, quantity: line.quantity.toFixed(3),
        countedQuantity: line.countedQuantity?.toFixed(3) ?? null, measuredQuantity: line.measuredQuantity?.toFixed(3) ?? null, movementId: line.movement?.id ?? null,
        unitIds: line.units.length ? line.units.map((unit) => unit.id) : line.plannedUnits.map((planned) => planned.unitId),
      })),
    });
  }
}
