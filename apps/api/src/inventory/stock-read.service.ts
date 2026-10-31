import { HttpStatus, Injectable } from '@nestjs/common';
import { normalizeEquipmentSerial, stockAsOfResponseSchema, stockLevelListResponseSchema, stockLocationListResponseSchema, stockMovementListResponseSchema, stockValueResponseSchema,
  unitDetailResponseSchema, unitLookupResponseSchema, type StockAsOfQuery, type StockLevelListQuery, type StockMovementListQuery, type StockValueQuery, type UnitLookupQuery } from '@sunshine/contracts';
import { PrismaService } from '../platform/prisma.service';
import { ApiError } from '../platform/api-error';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class StockReadService {
  constructor(private readonly prisma: PrismaService) {}

  /** Identity, physical location and customer assignment must describe one database snapshot. */
  async getUnit(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const unit = await tx.unit.findUnique({ where: { id }, include: {
        manufacturer: { select: { name: true } }, receiptLine: { select: { documentId: true } },
        allocations: { where: { status: { not: 'RELEASED' } }, take: 1, select: {
          id: true, status: true, jobId: true, job: { select: { order: { select: { id: true, customerId: true } } } },
        } },
      } });
      if (!unit) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Equipment unit not found');
      const locations = await tx.$queryRaw<{ locationId: string | null }[]>`
        SELECT "locationId" FROM "unit_locations" WHERE "unitId" = ${id}::uuid`;
      const assignment = unit.allocations[0];
      return unitDetailResponseSchema.parse({ data: {
        id: unit.id, productId: unit.productId, manufacturerId: unit.manufacturerId, manufacturer: unit.manufacturer.name,
        serial: unit.rawSerial, normalizedSerial: unit.normalizedSerial, status: unit.status,
        locationId: locations[0]?.locationId ?? null, receiptId: unit.receiptLine.documentId, replacesUnitId: unit.replacesUnitId,
        activeAssignment: assignment ? {
          allocationId: assignment.id, status: assignment.status, jobId: assignment.jobId,
          orderId: assignment.job.order.id, customerId: assignment.job.order.customerId,
        } : null,
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async listLocations() {
    const rows = await this.prisma.stockLocation.findMany({ where: { active: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, kind: true } });
    return stockLocationListResponseSchema.parse({ data: rows });
  }

  /** Exact on-hand per product and location, always derived from the ledger. */
  async listLevels(query: StockLevelListQuery) {
    const productId = query.productId ?? null;
    const locationId = query.locationId ?? null;
    const offset = (query.page - 1) * query.pageSize;
    const [{ total }] = await this.prisma.$queryRaw<[{ total: bigint }]>`
      SELECT COUNT(*) AS "total" FROM "stock_on_hand" s
      WHERE (${productId}::uuid IS NULL OR s."productId" = ${productId}::uuid)
        AND (${locationId}::uuid IS NULL OR s."locationId" = ${locationId}::uuid)`;
    const rows = await this.prisma.$queryRaw<{
      productId: string; sku: string; productName: string; locationId: string; locationCode: string; locationKind: string; onHand: Prisma.Decimal; reserved: Prisma.Decimal;
    }[]>`
      SELECT s."productId", p."sku", p."name" AS "productName", s."locationId", l."code" AS "locationCode", l."kind"::text AS "locationKind",
             s."quantity" AS "onHand", COALESCE(a."reserved", 0) AS "reserved"
      FROM "stock_on_hand" s
      JOIN "products" p ON p."id" = s."productId"
      JOIN "stock_locations" l ON l."id" = s."locationId"
      LEFT JOIN (
        SELECT "productId", "locationId", SUM("quantity") AS "reserved" FROM "allocations" WHERE "status" = 'RESERVED' GROUP BY "productId", "locationId"
      ) a ON a."productId" = s."productId" AND a."locationId" = s."locationId"
      WHERE (${productId}::uuid IS NULL OR s."productId" = ${productId}::uuid)
        AND (${locationId}::uuid IS NULL OR s."locationId" = ${locationId}::uuid)
      ORDER BY p."sku", l."code"
      LIMIT ${query.pageSize}::int OFFSET ${offset}::int`;
    return stockLevelListResponseSchema.parse({ data: {
      items: rows.map(({ onHand, reserved, ...row }) => ({
        ...row, onHand: onHand.toFixed(3), reserved: new Prisma.Decimal(reserved).toFixed(3),
        free: row.locationKind === 'USABLE' ? onHand.minus(reserved).toFixed(3) : '0.000',
      })),
      total: Number(total), page: query.page, pageSize: query.pageSize,
    } });
  }

  /** Newest first by business time. Posting order breaks ties, because a document's lines share one time. */
  async listMovements(query: StockMovementListQuery) {
    const where: Prisma.StockMovementWhereInput = {
      productId: query.productId,
      occurredAt: { gte: query.from ? new Date(query.from) : undefined, lt: query.to ? new Date(query.to) : undefined },
      documentLine: query.kind ? { document: { kind: query.kind } } : undefined,
      OR: query.locationId ? [{ fromLocationId: query.locationId }, { toLocationId: query.locationId }] : undefined,
    };
    return this.prisma.$transaction(async (tx) => {
      const [total, rows] = [await tx.stockMovement.count({ where }), await tx.stockMovement.findMany({
        where, orderBy: [{ occurredAt: 'desc' }, { sequence: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { product: { select: { sku: true, name: true } }, documentLine: { select: { document: { select: { id: true, kind: true, reference: true } } } } },
      })];
      return stockMovementListResponseSchema.parse({ data: {
        items: rows.map((row) => ({
          id: row.id, productId: row.productId, sku: row.product.sku, productName: row.product.name,
          fromLocationId: row.fromLocationId, toLocationId: row.toLocationId, quantity: row.quantity.toFixed(3), actorId: row.actorId,
          occurredAt: row.occurredAt.toISOString(), recordedAt: row.recordedAt.toISOString(), documentId: row.documentLine.document.id,
          documentKind: row.documentLine.document.kind, reference: row.documentLine.document.reference,
        })),
        total, page: query.page, pageSize: query.pageSize,
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  /** On-hand from every movement that had occurred by this time. A product with none by then isn't listed. */
  async stockAsOf(query: StockAsOfQuery) {
    const at = new Date(query.at);
    if (at.getTime() > Date.now()) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_INPUT', 'Some fields need attention', { at: ['Choose a time that has passed'] });
    }
    const productId = query.productId ?? null;
    const locationId = query.locationId ?? null;
    const balances = Prisma.sql`
      WITH "balances" AS (
        SELECT "productId", "locationId", SUM("delta") AS "onHand" FROM (
          SELECT "productId", "toLocationId" AS "locationId", "quantity" AS "delta" FROM "stock_movements" WHERE "toLocationId" IS NOT NULL AND "occurredAt" <= ${at.toISOString()}::timestamptz
          UNION ALL
          SELECT "productId", "fromLocationId", -"quantity" FROM "stock_movements" WHERE "fromLocationId" IS NOT NULL AND "occurredAt" <= ${at.toISOString()}::timestamptz
        ) AS "legs"
        WHERE (${productId}::uuid IS NULL OR "productId" = ${productId}::uuid) AND (${locationId}::uuid IS NULL OR "locationId" = ${locationId}::uuid)
        GROUP BY "productId", "locationId"
      )`;
    return this.prisma.$transaction(async (tx) => {
      const [{ total }] = await tx.$queryRaw<[{ total: bigint }]>`${balances} SELECT COUNT(*) AS "total" FROM "balances"`;
      const rows = await tx.$queryRaw<{
        productId: string; sku: string; productName: string; locationId: string; locationCode: string; locationKind: string; onHand: Prisma.Decimal;
      }[]>`${balances}
        SELECT b."productId", p."sku", p."name" AS "productName", b."locationId", l."code" AS "locationCode", l."kind"::text AS "locationKind", b."onHand"
        FROM "balances" b JOIN "products" p ON p."id" = b."productId" JOIN "stock_locations" l ON l."id" = b."locationId"
        ORDER BY p."sku", l."code" LIMIT ${query.pageSize}::int OFFSET ${(query.page - 1) * query.pageSize}::int`;
      return stockAsOfResponseSchema.parse({ data: {
        at: at.toISOString(), items: rows.map((row) => ({ ...row, onHand: new Prisma.Decimal(row.onHand).toFixed(3) })),
        total: Number(total), page: query.page, pageSize: query.pageSize,
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  /** Each product's value rounds to paise once, so the totals equal the sum of the rows. */
  async stockValue(query: StockValueQuery) {
    const productId = query.productId ?? null;
    const valued = Prisma.sql`
      WITH "levels" AS (
        SELECT s."productId", l."kind", SUM(s."quantity") AS "quantity"
        FROM "stock_on_hand" s JOIN "stock_locations" l ON l."id" = s."locationId"
        WHERE (${productId}::uuid IS NULL OR s."productId" = ${productId}::uuid)
        GROUP BY s."productId", l."kind"
      ), "unit_values" AS (
        SELECT u."productId", l."kind", SUM(u."acquisitionCost") AS "value"
        FROM "units" u JOIN "unit_locations" ul ON ul."unitId" = u."id" JOIN "stock_locations" l ON l."id" = ul."locationId"
        GROUP BY u."productId", l."kind"
      ), "priced" AS (
        SELECT lv."productId", lv."kind", lv."quantity",
          CASE WHEN p."trackingMode" = 'SERIALIZED' THEN COALESCE(uv."value", 0) ELSE ROUND(lv."quantity" * COALESCE(b."averageCost", 0), 2) END AS "value",
          p."trackingMode" <> 'SERIALIZED' AND b."productId" IS NULL AND lv."quantity" > 0 AS "uncosted"
        FROM "levels" lv JOIN "products" p ON p."id" = lv."productId"
        LEFT JOIN "unit_values" uv ON uv."productId" = lv."productId" AND uv."kind" = lv."kind"
        LEFT JOIN "product_cost_bases" b ON b."productId" = lv."productId"
      ), "valued" AS (
        SELECT "productId",
          COALESCE(SUM("quantity") FILTER (WHERE "kind" = 'USABLE'), 0) AS "usableQuantity", COALESCE(SUM("quantity") FILTER (WHERE "kind" = 'QUARANTINE'), 0) AS "quarantineQuantity",
          COALESCE(SUM("value") FILTER (WHERE "kind" = 'USABLE'), 0) AS "usableValue", COALESCE(SUM("value") FILTER (WHERE "kind" = 'QUARANTINE'), 0) AS "quarantineValue",
          bool_or("uncosted") AS "uncosted"
        FROM "priced" GROUP BY "productId" HAVING bool_or("quantity" <> 0)
      )`;
    const amount = (value: Prisma.Decimal) => new Prisma.Decimal(value).toFixed(2);
    return this.prisma.$transaction(async (tx) => {
      const [totals] = await tx.$queryRaw<[{ total: bigint; usableValue: Prisma.Decimal; quarantineValue: Prisma.Decimal; uncosted: bigint }]>`${valued}
        SELECT COUNT(*) AS "total", COALESCE(SUM("usableValue"), 0) AS "usableValue", COALESCE(SUM("quarantineValue"), 0) AS "quarantineValue", COUNT(*) FILTER (WHERE "uncosted") AS "uncosted" FROM "valued"`;
      const rows = await tx.$queryRaw<{
        productId: string; sku: string; productName: string; usableQuantity: Prisma.Decimal; quarantineQuantity: Prisma.Decimal; usableValue: Prisma.Decimal; quarantineValue: Prisma.Decimal; uncosted: boolean;
      }[]>`${valued}
        SELECT v.*, p."sku", p."name" AS "productName" FROM "valued" v JOIN "products" p ON p."id" = v."productId"
        ORDER BY p."sku" LIMIT ${query.pageSize}::int OFFSET ${(query.page - 1) * query.pageSize}::int`;
      return stockValueResponseSchema.parse({ data: {
        usableValue: amount(totals.usableValue), quarantineValue: amount(totals.quarantineValue), uncostedProducts: Number(totals.uncosted),
        items: rows.map((row) => ({
          productId: row.productId, sku: row.sku, productName: row.productName,
          usableQuantity: new Prisma.Decimal(row.usableQuantity).toFixed(3), quarantineQuantity: new Prisma.Decimal(row.quarantineQuantity).toFixed(3),
          usableValue: amount(row.usableValue), quarantineValue: amount(row.quarantineValue), costKnown: !row.uncosted,
        })),
        total: Number(totals.total), page: query.page, pageSize: query.pageSize,
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async lookupUnits(query: UnitLookupQuery) {
    const units = await this.prisma.unit.findMany({
      where: { normalizedSerial: normalizeEquipmentSerial(query.serial), productId: query.productId },
      include: { manufacturer: { select: { name: true } } }, orderBy: { productId: 'asc' }, take: 20,
    });
    const located = await this.prisma.$queryRaw<{ unitId: string; locationId: string | null }[]>`
      SELECT "unitId", "locationId" FROM "unit_locations" WHERE "unitId" = ANY(${units.map((unit) => unit.id)}::uuid[])`;
    const locations = new Map(located.map((row) => [row.unitId, row.locationId]));
    return unitLookupResponseSchema.parse({ data: units.map((unit) => ({
      id: unit.id, productId: unit.productId, manufacturerId: unit.manufacturerId, manufacturer: unit.manufacturer.name, serial: unit.rawSerial,
      normalizedSerial: unit.normalizedSerial, status: unit.status, locationId: locations.get(unit.id) ?? null,
    })) });
  }
}
