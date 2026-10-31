-- Release audit is stored on each retained allocation, not just in a replay cache.
ALTER TABLE "allocations"
  ADD COLUMN "releasedAt" TIMESTAMPTZ(3),
  ADD COLUMN "releasedById" UUID,
  ADD COLUMN "releaseReason" VARCHAR(500);
CREATE INDEX "allocations_releasedById_idx" ON "allocations"("releasedById");
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Historical RELEASED rows may lack evidence; no release actor or reason is fabricated during upgrade.
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_release_evidence_valid" CHECK (
  ("releasedAt" IS NULL AND "releasedById" IS NULL AND "releaseReason" IS NULL)
  OR ("status" = 'RELEASED' AND "releasedAt" IS NOT NULL AND "releasedById" IS NOT NULL AND "releaseReason" IS NOT NULL
      AND length(btrim("releaseReason")) BETWEEN 5 AND 500 AND "releasedAt" >= "createdAt")
);

CREATE FUNCTION "allocations_check_release"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'RELEASED' AND NEW."status" = 'RELEASED' THEN
    IF NEW."releasedAt" IS NULL OR NEW."releasedById" IS NULL OR NEW."releaseReason" IS NULL THEN
      RAISE EXCEPTION 'a new allocation release needs actor, time and reason' USING ERRCODE = 'restrict_violation';
    END IF;
  ELSIF ROW(NEW."releasedAt", NEW."releasedById", NEW."releaseReason")
    IS DISTINCT FROM ROW(OLD."releasedAt", OLD."releasedById", OLD."releaseReason") THEN
    RAISE EXCEPTION 'release evidence is recorded only when releasing an allocation' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "allocations_release_guarded" BEFORE UPDATE ON "allocations"
  FOR EACH ROW EXECUTE FUNCTION "allocations_check_release"();
