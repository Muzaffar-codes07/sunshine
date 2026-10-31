-- Draft, validate and cancel for transfers and counts. Stock still only moves through validated documents.
ALTER TABLE "stock_documents" ADD COLUMN "validatedById" UUID;
ALTER TABLE "stock_document_lines" ADD COLUMN "countedQuantity" DECIMAL(12,3), ADD COLUMN "measuredQuantity" DECIMAL(12,3);

CREATE TABLE "stock_document_line_units" (
    "id" UUID NOT NULL,
    "lineId" UUID NOT NULL,
    "unitId" UUID NOT NULL,

    CONSTRAINT "stock_document_line_units_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_document_line_units_unitId_idx" ON "stock_document_line_units"("unitId");
CREATE UNIQUE INDEX "stock_document_line_units_lineId_unitId_key" ON "stock_document_line_units"("lineId", "unitId");

ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_document_line_units" ADD CONSTRAINT "stock_document_line_units_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "stock_document_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_document_line_units" ADD CONSTRAINT "stock_document_line_units_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A count line's quantity is its difference, so it alone may be zero: a count that matches posts nothing.
ALTER TABLE "stock_document_lines" DROP CONSTRAINT "stock_document_lines_quantity_positive";
ALTER TABLE "stock_document_lines"
  ADD CONSTRAINT "stock_document_lines_quantity_valid" CHECK ("quantity" <> 'NaN' AND ("quantity" > 0 OR ("quantity" = 0 AND "countedQuantity" IS NOT NULL))),
  ADD CONSTRAINT "stock_document_lines_counted_valid" CHECK ("countedQuantity" IS NULL OR ("countedQuantity" >= 0 AND "countedQuantity" <> 'NaN')),
  ADD CONSTRAINT "stock_document_lines_measured_valid" CHECK ("measuredQuantity" IS NULL OR ("countedQuantity" IS NOT NULL AND "measuredQuantity" >= 0 AND "measuredQuantity" <> 'NaN')),
  ADD CONSTRAINT "stock_document_lines_count_difference" CHECK ("measuredQuantity" IS NULL OR "quantity" = abs("countedQuantity" - "measuredQuantity"));

-- A count names its one location in toLocationId; the difference decides which way its movements go.
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_locations_match_kind" CHECK (CASE "kind"
  WHEN 'RECEIPT' THEN "fromLocationId" IS NULL AND "toLocationId" IS NOT NULL
  WHEN 'ISSUE' THEN "fromLocationId" IS NOT NULL AND "toLocationId" IS NULL
  WHEN 'TRANSFER' THEN "fromLocationId" IS NOT NULL AND "toLocationId" IS NOT NULL AND "fromLocationId" <> "toLocationId"
  WHEN 'ADJUSTMENT' THEN "fromLocationId" IS NULL AND "toLocationId" IS NOT NULL
END);

CREATE OR REPLACE FUNCTION "stock_movements_check_source"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source RECORD;
  expected_from uuid;
  expected_to uuid;
BEGIN
  SELECT d."kind", d."status", COALESCE(d."validatedById", d."actorId") AS "actorId", d."occurredAt", d."fromLocationId", d."toLocationId",
         l."productId", l."quantity", l."countedQuantity", l."measuredQuantity" INTO source
  FROM "stock_document_lines" l JOIN "stock_documents" d ON d."id" = l."documentId"
  WHERE l."id" = NEW."documentLineId";
  IF NOT FOUND OR source."status" <> 'DONE' THEN
    RAISE EXCEPTION 'a stock movement needs a validated document' USING ERRCODE = 'restrict_violation';
  END IF;
  expected_from := source."fromLocationId";
  expected_to := source."toLocationId";
  IF source."kind" = 'ADJUSTMENT' AND source."countedQuantity" < source."measuredQuantity" THEN
    expected_from := source."toLocationId";
    expected_to := NULL;
  END IF;
  IF source."productId" <> NEW."productId" OR source."quantity" <> NEW."quantity" OR source."actorId" <> NEW."actorId"
    OR source."occurredAt" <> NEW."occurredAt" OR expected_from IS DISTINCT FROM NEW."fromLocationId"
    OR expected_to IS DISTINCT FROM NEW."toLocationId" THEN
    RAISE EXCEPTION 'a stock movement must match its document line' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "stock_documents_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF NEW."status" = 'DONE' AND EXISTS (
    SELECT 1 FROM "stock_document_lines" WHERE "documentId" = NEW."id" AND "countedQuantity" IS NOT NULL AND "measuredQuantity" IS NULL
  ) THEN
    RAISE EXCEPTION 'a count must be measured before validation' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "stock_document_lines_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_document uuid;
  new_document uuid;
  parent RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_document := OLD."documentId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_document := NEW."documentId"; END IF;
  FOR parent IN
    SELECT "id", "kind", "status" FROM "stock_documents" WHERE "id" IN (old_document, new_document) ORDER BY "id" FOR SHARE
  LOOP
    IF parent."status" IN ('DONE', 'CANCELED') THEN
      RAISE EXCEPTION 'lines of a closed stock document cannot change' USING ERRCODE = 'restrict_violation';
    END IF;
    IF parent."id" = new_document AND (parent."kind" = 'ADJUSTMENT') <> (NEW."countedQuantity" IS NOT NULL) THEN
      RAISE EXCEPTION 'only a count line, and every count line, has a counted quantity' USING ERRCODE = 'restrict_violation';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Planned units close with their document, for the same reason its lines do.
CREATE FUNCTION "stock_document_line_units_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent RECORD;
BEGIN
  FOR parent IN
    SELECT d."status" FROM "stock_documents" d JOIN "stock_document_lines" l ON l."documentId" = d."id"
    WHERE l."id" IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD."lineId" END, CASE WHEN TG_OP <> 'DELETE' THEN NEW."lineId" END)
    ORDER BY d."id" FOR SHARE OF d
  LOOP
    IF parent."status" IN ('DONE', 'CANCELED') THEN
      RAISE EXCEPTION 'units of a closed stock document cannot change' USING ERRCODE = 'restrict_violation';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "stock_document_line_units_guarded" BEFORE INSERT OR UPDATE OR DELETE ON "stock_document_line_units"
  FOR EACH ROW EXECUTE FUNCTION "stock_document_line_units_guard"();
