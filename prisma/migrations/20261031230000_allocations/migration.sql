-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('RESERVED', 'DISPATCHED', 'DELIVERED', 'INSTALLED', 'RELEASED');

-- CreateTable
CREATE TABLE "allocations" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "quoteLineId" UUID,
    "productId" UUID NOT NULL,
    "unitId" UUID,
    "locationId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'RESERVED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "allocations_jobId_status_idx" ON "allocations"("jobId", "status");

-- CreateIndex
CREATE INDEX "allocations_productId_locationId_status_idx" ON "allocations"("productId", "locationId", "status");

-- CreateIndex
CREATE INDEX "allocations_quoteLineId_idx" ON "allocations"("quoteLineId");

-- CreateIndex
CREATE INDEX "allocations_unitId_idx" ON "allocations"("unitId");

-- CreateIndex
CREATE INDEX "allocations_locationId_idx" ON "allocations"("locationId");

-- CreateIndex
CREATE INDEX "allocations_actorId_idx" ON "allocations"("actorId");

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_quoteLineId_fkey" FOREIGN KEY ("quoteLineId") REFERENCES "quote_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "allocations"
  ADD CONSTRAINT "allocations_quantity_positive" CHECK ("quantity" > 0 AND "quantity" <> 'NaN'),
  ADD CONSTRAINT "allocations_unit_is_one" CHECK ("unitId" IS NULL OR "quantity" = 1),
  ADD CONSTRAINT "allocations_has_source" CHECK ("quoteLineId" IS NOT NULL),
  ADD CONSTRAINT "allocations_version_positive" CHECK ("version" >= 1);

-- A unit belongs to one job from reservation until it is released, including after it leaves the warehouse.
CREATE UNIQUE INDEX "allocations_one_active_unit" ON "allocations"("unitId") WHERE "unitId" IS NOT NULL AND "status" <> 'RELEASED';
-- A bulk requirement is reserved once.
CREATE UNIQUE INDEX "allocations_one_active_bulk_line" ON "allocations"("quoteLineId") WHERE "unitId" IS NULL AND "status" <> 'RELEASED';

-- An allocation must match what was sold on this job's order. Product mode spans tables, so a CHECK can't hold it.
CREATE FUNCTION "allocations_check_source"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  sold RECORD;
  unit_product uuid;
BEGIN
  IF NEW."status" <> 'RESERVED' THEN
    RAISE EXCEPTION 'an allocation starts as reserved' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT ql."kind", ql."productId", p."trackingMode" INTO sold
  FROM "quote_lines" ql
  JOIN "orders" o ON o."quoteId" = ql."quoteId"
  JOIN "jobs" j ON j."orderId" = o."id"
  JOIN "products" p ON p."id" = ql."productId"
  WHERE ql."id" = NEW."quoteLineId" AND j."id" = NEW."jobId";
  IF NOT FOUND OR sold."kind" <> 'COMPONENT' OR sold."productId" <> NEW."productId" THEN
    RAISE EXCEPTION 'an allocation must match a component sold on its job''s order' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (sold."trackingMode" = 'SERIALIZED') <> (NEW."unitId" IS NOT NULL) THEN
    RAISE EXCEPTION 'serialized stock is allocated by unit, and bulk stock by quantity' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."unitId" IS NOT NULL THEN
    SELECT "productId" INTO unit_product FROM "units" WHERE "id" = NEW."unitId";
    IF unit_product IS DISTINCT FROM NEW."productId" THEN
      RAISE EXCEPTION 'an allocated unit must be the sold product' USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "allocations_source_valid" BEFORE INSERT ON "allocations"
  FOR EACH ROW EXECUTE FUNCTION "allocations_check_source"();

-- What was reserved never changes. Only the status moves on, and a released allocation stays released.
CREATE FUNCTION "allocations_freeze_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW."jobId" <> OLD."jobId" OR NEW."quoteLineId" IS DISTINCT FROM OLD."quoteLineId" OR NEW."productId" <> OLD."productId"
    OR NEW."unitId" IS DISTINCT FROM OLD."unitId" OR NEW."locationId" <> OLD."locationId" OR NEW."quantity" <> OLD."quantity"
    OR NEW."actorId" <> OLD."actorId" OR OLD."status" = 'RELEASED' THEN
    RAISE EXCEPTION 'an allocation''s identity cannot change' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "allocations_identity_frozen" BEFORE UPDATE OR DELETE ON "allocations"
  FOR EACH ROW EXECUTE FUNCTION "allocations_freeze_identity"();
