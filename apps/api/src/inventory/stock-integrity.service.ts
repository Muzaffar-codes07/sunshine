import { Injectable } from '@nestjs/common';
import { stockIntegrityResponseSchema, type StockIntegrityCheck } from '@sunshine/contracts';
import { PrismaService } from '../platform/prisma.service';
import { Prisma } from '../generated/prisma/client';

const SAMPLES = 20;

/** Each query returns one "ref" per finding, so an empty result means the check passed. */
const CHECKS: { code: string; description: string; findings: Prisma.Sql }[] = [
  {
    code: 'VIEW_MATCHES_MOVEMENTS', description: 'The on-hand view equals movements in minus movements out.',
    findings: Prisma.sql`
      WITH "recomputed" AS (
        SELECT m."productId", l."id" AS "locationId", SUM(CASE WHEN m."toLocationId" = l."id" THEN m."quantity" ELSE -m."quantity" END) AS "quantity"
        FROM "stock_movements" m JOIN "stock_locations" l ON l."id" IN (m."fromLocationId", m."toLocationId")
        GROUP BY m."productId", l."id"
      )
      SELECT COALESCE(v."productId", r."productId")::text || ':' || COALESCE(v."locationId", r."locationId")::text AS "ref"
      FROM "stock_on_hand" v FULL JOIN "recomputed" r ON r."productId" = v."productId" AND r."locationId" = v."locationId"
      WHERE v."quantity" IS DISTINCT FROM r."quantity"`,
  },
  {
    code: 'NO_NEGATIVE_BALANCE', description: 'No location holds less than zero of a product.',
    findings: Prisma.sql`SELECT "productId"::text || ':' || "locationId"::text AS "ref" FROM "stock_on_hand" WHERE "quantity" < 0`,
  },
  {
    code: 'DONE_DOCUMENT_POSTED', description: 'Each line of a DONE document posted its movement exactly once. A count that matched expects none.',
    findings: Prisma.sql`
      SELECT l."id"::text AS "ref"
      FROM "stock_document_lines" l JOIN "stock_documents" d ON d."id" = l."documentId" LEFT JOIN "stock_movements" m ON m."documentLineId" = l."id"
      WHERE d."status" = 'DONE'
      GROUP BY l."id", l."quantity"
      HAVING COUNT(m."id") <> CASE WHEN l."quantity" > 0 THEN 1 ELSE 0 END`,
  },
  {
    code: 'MOVEMENT_ON_DONE_DOCUMENT', description: 'No movement sits on a document that is not DONE.',
    findings: Prisma.sql`
      SELECT m."id"::text AS "ref"
      FROM "stock_movements" m JOIN "stock_document_lines" l ON l."id" = m."documentLineId" JOIN "stock_documents" d ON d."id" = l."documentId"
      WHERE d."status" <> 'DONE'`,
  },
  {
    code: 'MOVEMENT_WELL_FORMED', description: 'Every movement has a positive quantity, valid locations, and matches its document line.',
    findings: Prisma.sql`
      SELECT m."id"::text AS "ref"
      FROM "stock_movements" m JOIN "stock_document_lines" l ON l."id" = m."documentLineId" JOIN "stock_documents" d ON d."id" = l."documentId"
      WHERE m."quantity" <= 0 OR m."quantity" = 'NaN' OR m."productId" <> l."productId" OR m."quantity" <> l."quantity"
        OR m."occurredAt" <> d."occurredAt" OR m."actorId" <> COALESCE(d."validatedById", d."actorId")
        OR m."fromLocationId" IS NOT DISTINCT FROM m."toLocationId"
        OR m."fromLocationId" IS DISTINCT FROM CASE WHEN d."kind" = 'ADJUSTMENT' THEN CASE WHEN l."countedQuantity" < l."measuredQuantity" THEN d."toLocationId" END ELSE d."fromLocationId" END
        OR m."toLocationId" IS DISTINCT FROM CASE WHEN d."kind" = 'ADJUSTMENT' AND l."countedQuantity" < l."measuredQuantity" THEN NULL ELSE d."toLocationId" END`,
  },
  {
    code: 'SERIAL_COUNT_MATCHES_VIEW', description: 'For serialized products, the units at each location equal the on-hand view.',
    findings: Prisma.sql`
      WITH "located" AS (
        SELECT u."productId", ul."locationId", COUNT(*) AS "units"
        FROM "units" u JOIN "unit_locations" ul ON ul."unitId" = u."id"
        WHERE ul."locationId" IS NOT NULL
        GROUP BY u."productId", ul."locationId"
      ), "held" AS (
        SELECT v."productId", v."locationId", v."quantity" FROM "stock_on_hand" v JOIN "products" p ON p."id" = v."productId" WHERE p."trackingMode" = 'SERIALIZED'
      )
      SELECT COALESCE(h."productId", u."productId")::text || ':' || COALESCE(h."locationId", u."locationId")::text AS "ref"
      FROM "held" h FULL JOIN "located" u ON u."productId" = h."productId" AND u."locationId" = h."locationId"
      WHERE COALESCE(h."quantity", 0) <> COALESCE(u."units", 0)`,
  },
  {
    code: 'RESERVED_WITHIN_ON_HAND', description: 'What jobs have reserved at a location is not more than it holds. A count can cause this; it blocks readiness.',
    findings: Prisma.sql`
      SELECT a."productId"::text || ':' || a."locationId"::text AS "ref"
      FROM "allocations" a LEFT JOIN "stock_on_hand" v ON v."productId" = a."productId" AND v."locationId" = a."locationId"
      WHERE a."status" = 'RESERVED'
      GROUP BY a."productId", a."locationId", v."quantity"
      HAVING SUM(a."quantity") > COALESCE(v."quantity", 0)`,
  },
];

/** Read-only. It reports problems and repairs nothing: a correction is a new document. */
@Injectable()
export class StockIntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async report() {
    return this.prisma.$transaction((tx) => this.check(tx), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
  }

  /** Every check must see the same data, so the caller supplies one repeatable-read transaction. */
  async check(tx: Prisma.TransactionClient) {
    const checks: StockIntegrityCheck[] = [];
    for (const { code, description, findings } of CHECKS) {
      const rows = await tx.$queryRaw<{ ref: string; total: bigint }[]>`
        SELECT "ref", COUNT(*) OVER () AS "total" FROM (${findings}) AS "found" ORDER BY "ref" LIMIT ${SAMPLES}::int`;
      const count = Number(rows[0]?.total ?? 0);
      checks.push({ code, description, ok: count === 0, count, samples: rows.map((row) => row.ref) });
    }
    return stockIntegrityResponseSchema.parse({ data: { checkedAt: new Date().toISOString(), ok: checks.every((item) => item.ok), checks } });
  }
}
