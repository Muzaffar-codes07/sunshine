-- CreateEnum
CREATE TYPE "StockLocationKind" AS ENUM ('USABLE', 'QUARANTINE');

-- CreateEnum
CREATE TYPE "StockDocumentKind" AS ENUM ('RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StockDocumentStatus" AS ENUM ('DRAFT', 'WAITING', 'READY', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'DISPATCHED', 'DELIVERED', 'INSTALLED', 'QUARANTINED', 'RETURNED');

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" "StockLocationKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_documents" (
    "id" UUID NOT NULL,
    "kind" "StockDocumentKind" NOT NULL,
    "reference" VARCHAR(128) NOT NULL,
    "status" "StockDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "payloadHash" VARCHAR(64) NOT NULL,
    "actorId" UUID NOT NULL,
    "fromLocationId" UUID,
    "toLocationId" UUID,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "stock_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_document_lines" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(14,2),
    "zeroCostReason" VARCHAR(500),

    CONSTRAINT "stock_document_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "documentLineId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "fromLocationId" UUID,
    "toLocationId" UUID,
    "quantity" DECIMAL(12,3) NOT NULL,
    "actorId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "manufacturerId" UUID NOT NULL,
    "rawSerial" VARCHAR(128) NOT NULL,
    "normalizedSerial" VARCHAR(128) NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "acquisitionCost" DECIMAL(14,2) NOT NULL,
    "receiptLineId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_movements" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "movementId" UUID NOT NULL,

    CONSTRAINT "unit_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_cost_bases" (
    "productId" UUID NOT NULL,
    "averageCost" DECIMAL(18,6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_cost_bases_pkey" PRIMARY KEY ("productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_code_key" ON "stock_locations"("code");

-- CreateIndex
CREATE INDEX "stock_documents_status_kind_idx" ON "stock_documents"("status", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "stock_documents_kind_reference_key" ON "stock_documents"("kind", "reference");

-- CreateIndex
CREATE INDEX "stock_document_lines_productId_idx" ON "stock_document_lines"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_document_lines_documentId_lineNumber_key" ON "stock_document_lines"("documentId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_sequence_key" ON "stock_movements"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_documentLineId_key" ON "stock_movements"("documentLineId");

-- CreateIndex
CREATE INDEX "stock_movements_productId_occurredAt_idx" ON "stock_movements"("productId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_fromLocationId_idx" ON "stock_movements"("fromLocationId");

-- CreateIndex
CREATE INDEX "stock_movements_toLocationId_idx" ON "stock_movements"("toLocationId");

-- CreateIndex
CREATE INDEX "units_normalizedSerial_idx" ON "units"("normalizedSerial");

-- CreateIndex
CREATE INDEX "units_receiptLineId_idx" ON "units"("receiptLineId");

-- CreateIndex
CREATE UNIQUE INDEX "units_identity_key" ON "units"("manufacturerId", "productId", "normalizedSerial");

-- CreateIndex
CREATE INDEX "unit_movements_movementId_idx" ON "unit_movements"("movementId");

-- CreateIndex
CREATE UNIQUE INDEX "unit_movements_unitId_movementId_key" ON "unit_movements"("unitId", "movementId");

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_document_lines" ADD CONSTRAINT "stock_document_lines_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "stock_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_document_lines" ADD CONSTRAINT "stock_document_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_documentLineId_fkey" FOREIGN KEY ("documentLineId") REFERENCES "stock_document_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "stock_document_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_movements" ADD CONSTRAINT "unit_movements_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_movements" ADD CONSTRAINT "unit_movements_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_cost_bases" ADD CONSTRAINT "product_cost_bases_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written rules: registered in prisma/required-constraints.json and verified by npm run db:check.
ALTER TABLE "stock_locations"
  ADD CONSTRAINT "stock_locations_code_not_blank" CHECK (length(btrim("code")) > 0),
  ADD CONSTRAINT "stock_locations_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "stock_documents"
  ADD CONSTRAINT "stock_documents_reference_not_blank" CHECK (length(btrim("reference")) > 0),
  ADD CONSTRAINT "stock_documents_version_positive" CHECK ("version" >= 1),
  ADD CONSTRAINT "stock_documents_done_has_time" CHECK ("status" <> 'DONE' OR "validatedAt" IS NOT NULL);
ALTER TABLE "stock_document_lines"
  ADD CONSTRAINT "stock_document_lines_number_positive" CHECK ("lineNumber" >= 1),
  ADD CONSTRAINT "stock_document_lines_quantity_positive" CHECK ("quantity" > 0 AND "quantity" <> 'NaN'),
  ADD CONSTRAINT "stock_document_lines_cost_nonnegative" CHECK ("unitCost" IS NULL OR ("unitCost" >= 0 AND "unitCost" <> 'NaN')),
  ADD CONSTRAINT "stock_document_lines_zero_cost_reason" CHECK ("unitCost" IS NULL OR "unitCost" > 0 OR "zeroCostReason" IS NOT NULL);
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_quantity_positive" CHECK ("quantity" > 0 AND "quantity" <> 'NaN'),
  ADD CONSTRAINT "stock_movements_has_location" CHECK ("fromLocationId" IS NOT NULL OR "toLocationId" IS NOT NULL),
  ADD CONSTRAINT "stock_movements_locations_differ" CHECK ("fromLocationId" IS DISTINCT FROM "toLocationId");
ALTER TABLE "units"
  ADD CONSTRAINT "units_serial_not_blank" CHECK (length(btrim("rawSerial")) > 0 AND length(btrim("normalizedSerial")) > 0),
  ADD CONSTRAINT "units_cost_nonnegative" CHECK ("acquisitionCost" >= 0 AND "acquisitionCost" <> 'NaN'),
  ADD CONSTRAINT "units_version_positive" CHECK ("version" >= 1);
ALTER TABLE "product_cost_bases"
  ADD CONSTRAINT "product_cost_bases_average_nonnegative" CHECK ("averageCost" >= 0 AND "averageCost" <> 'NaN');

-- The ledger is append-only. A correction is a new movement.
CREATE FUNCTION "stock_ledger_refuse_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock ledger table % is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER "stock_movements_append_only" BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION "stock_ledger_refuse_change"();
CREATE TRIGGER "stock_movements_no_truncate" BEFORE TRUNCATE ON "stock_movements"
  FOR EACH STATEMENT EXECUTE FUNCTION "stock_ledger_refuse_change"();
CREATE TRIGGER "unit_movements_append_only" BEFORE UPDATE OR DELETE ON "unit_movements"
  FOR EACH ROW EXECUTE FUNCTION "stock_ledger_refuse_change"();
CREATE TRIGGER "unit_movements_no_truncate" BEFORE TRUNCATE ON "unit_movements"
  FOR EACH STATEMENT EXECUTE FUNCTION "stock_ledger_refuse_change"();

-- A movement must match the validated document line it posts. This is the database's copy of the writer's contract.
CREATE FUNCTION "stock_movements_check_source"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source RECORD;
BEGIN
  SELECT d."status", d."actorId", d."occurredAt", d."fromLocationId", d."toLocationId", l."productId", l."quantity" INTO source
  FROM "stock_document_lines" l JOIN "stock_documents" d ON d."id" = l."documentId"
  WHERE l."id" = NEW."documentLineId";
  IF NOT FOUND OR source."status" <> 'DONE' THEN
    RAISE EXCEPTION 'a stock movement needs a validated document' USING ERRCODE = 'restrict_violation';
  END IF;
  IF source."productId" <> NEW."productId" OR source."quantity" <> NEW."quantity" OR source."actorId" <> NEW."actorId"
    OR source."occurredAt" <> NEW."occurredAt" OR source."fromLocationId" IS DISTINCT FROM NEW."fromLocationId"
    OR source."toLocationId" IS DISTINCT FROM NEW."toLocationId" THEN
    RAISE EXCEPTION 'a stock movement must match its document line' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "stock_movements_source_valid" BEFORE INSERT ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION "stock_movements_check_source"();

-- A document starts as a draft. Once validated or cancelled it is closed for good: corrections are new documents.
CREATE FUNCTION "stock_documents_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'a stock document starts as a draft' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."status" IN ('DONE', 'CANCELED') THEN
    RAISE EXCEPTION 'a closed stock document cannot change' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW."status" = 'DONE' AND NOT EXISTS (SELECT 1 FROM "stock_document_lines" WHERE "documentId" = NEW."id") THEN
    RAISE EXCEPTION 'a stock document needs lines before validation' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "stock_documents_guarded" BEFORE INSERT OR UPDATE OR DELETE ON "stock_documents"
  FOR EACH ROW EXECUTE FUNCTION "stock_documents_guard"();
-- The share lock makes a line change and validation of its document wait for each other, in either order.
CREATE FUNCTION "stock_document_lines_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_document uuid;
  new_document uuid;
  parent RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_document := OLD."documentId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_document := NEW."documentId"; END IF;
  FOR parent IN
    SELECT "status" FROM "stock_documents" WHERE "id" IN (old_document, new_document) ORDER BY "id" FOR SHARE
  LOOP
    IF parent."status" IN ('DONE', 'CANCELED') THEN
      RAISE EXCEPTION 'lines of a closed stock document cannot change' USING ERRCODE = 'restrict_violation';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "stock_document_lines_guarded" BEFORE INSERT OR UPDATE OR DELETE ON "stock_document_lines"
  FOR EACH ROW EXECUTE FUNCTION "stock_document_lines_guard"();

-- A unit's identity and acquisition cost are fixed at receipt. Only its lifecycle status moves on.
CREATE FUNCTION "units_freeze_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW."productId" <> OLD."productId" OR NEW."manufacturerId" <> OLD."manufacturerId"
    OR NEW."rawSerial" <> OLD."rawSerial" OR NEW."normalizedSerial" <> OLD."normalizedSerial"
    OR NEW."acquisitionCost" <> OLD."acquisitionCost" OR NEW."receiptLineId" <> OLD."receiptLineId" THEN
    RAISE EXCEPTION 'a unit''s identity and cost cannot change' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "units_identity_frozen" BEFORE UPDATE OR DELETE ON "units"
  FOR EACH ROW EXECUTE FUNCTION "units_freeze_identity"();

-- On-hand per product and location: movements in minus movements out. Includes quarantine; readers filter on kind.
CREATE VIEW "stock_on_hand" AS
  SELECT "productId", "locationId", SUM("delta") AS "quantity"
  FROM (
    SELECT "productId", "toLocationId" AS "locationId", "quantity" AS "delta" FROM "stock_movements" WHERE "toLocationId" IS NOT NULL
    UNION ALL
    SELECT "productId", "fromLocationId", -"quantity" FROM "stock_movements" WHERE "fromLocationId" IS NOT NULL
  ) AS "legs"
  GROUP BY "productId", "locationId";

-- A unit is where its latest movement put it; a null location means it has left company stock.
CREATE VIEW "unit_locations" AS
  SELECT DISTINCT ON (um."unitId") um."unitId", m."toLocationId" AS "locationId"
  FROM "unit_movements" um JOIN "stock_movements" m ON m."id" = um."movementId"
  ORDER BY um."unitId", m."sequence" DESC;

-- One warehouse (ADR-06) with one usable and one quarantine location.
INSERT INTO "stock_locations" ("id", "code", "name", "kind", "updatedAt") VALUES
  (gen_random_uuid(), 'MAIN', 'Main store', 'USABLE', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'QUARANTINE', 'Quarantine', 'QUARANTINE', CURRENT_TIMESTAMP);
