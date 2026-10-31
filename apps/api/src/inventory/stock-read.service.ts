import { Injectable } from '@nestjs/common';
import { normalizeEquipmentSerial, stockLevelListResponseSchema, stockLocationListResponseSchema, unitLookupResponseSchema,
  type StockLevelListQuery, type UnitLookupQuery } from '@sunshine/contracts';
import { PrismaService } from '../platform/prisma.service';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class StockReadService {
  constructor(private readonly prisma: PrismaService) {}

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
