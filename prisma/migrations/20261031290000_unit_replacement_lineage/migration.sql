BEGIN;

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "replacesUnitId" UUID;

-- CreateIndex
CREATE INDEX "units_replacesUnitId_idx" ON "units"("replacesUnitId");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_replacesUnitId_fkey" FOREIGN KEY ("replacesUnitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "units" ADD CONSTRAINT "units_lineage_not_self"
  CHECK ("replacesUnitId" IS NULL OR "replacesUnitId" <> "id");

-- Links are immutable once recorded. Serialize the rare graph-edge additions;
-- ordinary receipts and status changes do not take this advisory lock.
CREATE FUNCTION "units_guard_lineage"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."replacesUnitId" IS NOT DISTINCT FROM OLD."replacesUnitId" THEN RETURN NEW; END IF;
    IF OLD."replacesUnitId" IS NOT NULL THEN
      RAISE EXCEPTION 'equipment predecessor history cannot change'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'units_lineage_immutable';
    END IF;
  END IF;
  IF NEW."replacesUnitId" IS NULL OR NEW."replacesUnitId" = NEW."id" THEN RETURN NEW; END IF;
  -- Repeatable-read snapshots cannot see an edge committed while waiting on the mutex.
  -- Mutation callers use the repository's default READ COMMITTED transaction.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'new equipment predecessor links require a READ COMMITTED transaction'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'units_lineage_isolation';
  END IF;
  PERFORM pg_advisory_xact_lock(18461029, 1);
  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT "id", "replacesUnitId" FROM "units" WHERE "id" = NEW."replacesUnitId"
      UNION
      SELECT u."id", u."replacesUnitId" FROM "units" u JOIN ancestors a ON u."id" = a."replacesUnitId"
    ) SELECT 1 FROM ancestors WHERE "id" = NEW."id" OR "replacesUnitId" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'equipment predecessor history cannot contain a cycle'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'units_lineage_acyclic';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "units_lineage_guarded" BEFORE INSERT OR UPDATE OF "replacesUnitId" ON "units"
  FOR EACH ROW EXECUTE FUNCTION "units_guard_lineage"();

COMMIT;
