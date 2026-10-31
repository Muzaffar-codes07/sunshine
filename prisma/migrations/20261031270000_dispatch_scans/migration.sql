-- Draft and scan evidence only: no issue, inventory deduction, cost or warranty posting.
CREATE TYPE "ScanMethod" AS ENUM ('CAMERA', 'SCANNER', 'TYPED');
CREATE TABLE "dispatches" (
  "id" UUID PRIMARY KEY,
  "orderId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "dispatches_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dispatches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dispatches_version_positive" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "dispatches_orderId_key" ON "dispatches"("orderId");
CREATE INDEX "dispatches_createdById_idx" ON "dispatches"("createdById");
CREATE TABLE "dispatch_scans" (
  "id" UUID PRIMARY KEY,
  "dispatchId" UUID NOT NULL,
  "allocationId" UUID NOT NULL,
  "rawValue" VARCHAR(512) NOT NULL,
  "normalizedSerial" VARCHAR(128) NOT NULL,
  "method" "ScanMethod" NOT NULL,
  "actorId" UUID NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispatch_scans_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dispatch_scans_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dispatch_scans_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dispatch_scans_values_not_blank" CHECK (length(btrim("rawValue")) > 0 AND length(btrim("normalizedSerial")) > 0)
);
CREATE UNIQUE INDEX "dispatch_scans_dispatchId_allocationId_method_key" ON "dispatch_scans"("dispatchId", "allocationId", "method");
CREATE INDEX "dispatch_scans_allocationId_idx" ON "dispatch_scans"("allocationId");
CREATE INDEX "dispatch_scans_actorId_idx" ON "dispatch_scans"("actorId");

CREATE FUNCTION "dispatches_guard_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR ROW(NEW."id",NEW."orderId",NEW."createdById",NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."id",OLD."orderId",OLD."createdById",OLD."createdAt")
    OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'dispatch identity is fixed and changes need the next version' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "dispatches_identity_frozen" BEFORE UPDATE OR DELETE ON "dispatches"
  FOR EACH ROW EXECUTE FUNCTION "dispatches_guard_identity"();

CREATE FUNCTION "dispatch_scans_check_source"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source RECORD;
BEGIN
  -- This lock also serializes inserts against the dispatch's version update.
  PERFORM "id" FROM "dispatches" WHERE "id" = NEW."dispatchId" FOR SHARE;
  SELECT d."orderId" AS dispatch_order, j."orderId" AS allocated_order, a."status" AS allocation_status,
    u."status" AS unit_status, u."normalizedSerial", a."createdAt" INTO source
  FROM "allocations" a JOIN "jobs" j ON j."id"=a."jobId" JOIN "units" u ON u."id"=a."unitId"
  JOIN "dispatches" d ON d."id"=NEW."dispatchId" WHERE a."id"=NEW."allocationId" FOR SHARE OF a,u;
  IF NOT FOUND OR source.dispatch_order <> source.allocated_order OR source.allocation_status <> 'RESERVED'
    OR source.unit_status <> 'RESERVED' OR source."normalizedSerial" <> NEW."normalizedSerial"
    OR NEW."recordedAt" < source."createdAt" THEN
    RAISE EXCEPTION 'a dispatch scan must match its reserved equipment and order' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "dispatch_scans_source_valid" BEFORE INSERT ON "dispatch_scans"
  FOR EACH ROW EXECUTE FUNCTION "dispatch_scans_check_source"();

CREATE FUNCTION "dispatch_scans_refuse_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'dispatch scan evidence is append-only' USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER "dispatch_scans_append_only" BEFORE UPDATE OR DELETE ON "dispatch_scans"
  FOR EACH ROW EXECUTE FUNCTION "dispatch_scans_refuse_change"();
CREATE TRIGGER "dispatch_scans_no_truncate" BEFORE TRUNCATE ON "dispatch_scans"
  FOR EACH STATEMENT EXECUTE FUNCTION "dispatch_scans_refuse_change"();
