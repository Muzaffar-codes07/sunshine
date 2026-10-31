-- CreateEnum
CREATE TYPE "InstallationCheck" AS ENUM ('MOUNTING', 'PANELS', 'WIRING', 'EARTHING', 'POWER_GENERATION', 'BATTERY');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "completedAt" TIMESTAMPTZ(3),
ADD COLUMN     "completedById" UUID,
ADD COLUMN     "completedChecks" "InstallationCheck"[] DEFAULT ARRAY[]::"InstallationCheck"[],
ADD COLUMN     "finishedAt" TIMESTAMPTZ(3),
ADD COLUMN     "installedCapacityKw" INTEGER,
ADD COLUMN     "signatureFileId" UUID,
ADD COLUMN     "signerName" VARCHAR(120),
ADD COLUMN     "startedAt" TIMESTAMPTZ(3),
ADD COLUMN     "startedById" UUID;

-- CreateTable
CREATE TABLE "job_photos" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "job_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installation_time_records" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "technicianId" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installation_time_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_photos_fileId_key" ON "job_photos"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "job_photos_jobId_position_key" ON "job_photos"("jobId", "position");

-- CreateIndex
CREATE INDEX "installation_time_records_jobId_idx" ON "installation_time_records"("jobId");

-- CreateIndex
CREATE INDEX "installation_time_records_technicianId_startedAt_idx" ON "installation_time_records"("technicianId", "startedAt");

-- CreateIndex
CREATE INDEX "installation_time_records_recordedById_idx" ON "installation_time_records"("recordedById");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_signatureFileId_key" ON "jobs"("signatureFileId");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_signatureFileId_fkey" FOREIGN KEY ("signatureFileId") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_time_records" ADD CONSTRAINT "installation_time_records_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_time_records" ADD CONSTRAINT "installation_time_records_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installation_time_records" ADD CONSTRAINT "installation_time_records_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "jobs"
  ADD CONSTRAINT "jobs_started_has_time" CHECK ("status" = 'SCHEDULED' OR ("startedAt" IS NOT NULL AND "startedById" IS NOT NULL)),
  ADD CONSTRAINT "jobs_finished_after_start" CHECK ("finishedAt" IS NULL OR "startedAt" < "finishedAt"),
  ADD CONSTRAINT "jobs_capacity_range" CHECK ("installedCapacityKw" IS NULL OR "installedCapacityKw" BETWEEN 1 AND 5),
  ADD CONSTRAINT "jobs_signer_not_blank" CHECK ("signerName" IS NULL OR length(btrim("signerName")) > 0),
  ADD CONSTRAINT "jobs_completed_has_evidence" CHECK ("status" <> 'COMPLETED' OR ("finishedAt" IS NOT NULL AND "completedAt" IS NOT NULL AND "completedById" IS NOT NULL
    AND "installedCapacityKw" IS NOT NULL AND "signatureFileId" IS NOT NULL AND "signerName" IS NOT NULL AND cardinality("completedChecks") > 0));
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_position_positive" CHECK ("position" >= 1);
ALTER TABLE "installation_time_records" ADD CONSTRAINT "installation_time_records_ordered" CHECK ("startedAt" < "finishedAt");

-- A job only moves forward, its start can't be rewritten, and once COMPLETED its evidence is final.
CREATE FUNCTION "jobs_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" <> OLD."status" AND NOT (
    (OLD."status" = 'SCHEDULED' AND NEW."status" = 'IN_PROGRESS')
    OR (OLD."status" = 'IN_PROGRESS' AND NEW."status" IN ('AWAITING_ACCEPTANCE', 'COMPLETED'))
    OR (OLD."status" = 'AWAITING_ACCEPTANCE' AND NEW."status" = 'COMPLETED')
  ) THEN
    RAISE EXCEPTION 'a job cannot move from % to %', OLD."status", NEW."status" USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."startedAt" IS NOT NULL AND (NEW."startedAt" IS DISTINCT FROM OLD."startedAt" OR NEW."startedById" IS DISTINCT FROM OLD."startedById") THEN
    RAISE EXCEPTION 'a job''s start cannot change' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."status" = 'COMPLETED' AND (NEW."finishedAt" IS DISTINCT FROM OLD."finishedAt" OR NEW."completedAt" IS DISTINCT FROM OLD."completedAt"
    OR NEW."completedById" IS DISTINCT FROM OLD."completedById" OR NEW."installedCapacityKw" IS DISTINCT FROM OLD."installedCapacityKw"
    OR NEW."signatureFileId" IS DISTINCT FROM OLD."signatureFileId" OR NEW."signerName" IS DISTINCT FROM OLD."signerName"
    OR NEW."completedChecks" IS DISTINCT FROM OLD."completedChecks") THEN
    RAISE EXCEPTION 'a completed job''s evidence cannot change' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."status" = 'COMPLETED' AND OLD."status" <> 'COMPLETED' THEN
    IF NOT EXISTS (SELECT 1 FROM "job_photos" WHERE "jobId" = NEW."id") OR NOT EXISTS (SELECT 1 FROM "installation_time_records" WHERE "jobId" = NEW."id") THEN
      RAISE EXCEPTION 'a completed job needs photos and time records' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "files" WHERE "id" = NEW."signatureFileId" AND "contextType" = 'JOB' AND "contextId" = NEW."id")
      OR EXISTS (SELECT 1 FROM "job_photos" WHERE "fileId" = NEW."signatureFileId") THEN
      RAISE EXCEPTION 'a job''s signature must be its own separate file' USING ERRCODE = 'restrict_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM "installation_time_records" WHERE "jobId" = NEW."id" AND ("startedAt" < NEW."startedAt" OR "finishedAt" > NEW."finishedAt")) THEN
      RAISE EXCEPTION 'time records must fall within the installation' USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "jobs_guarded" BEFORE UPDATE ON "jobs" FOR EACH ROW EXECUTE FUNCTION "jobs_guard"();

-- Evidence is added while the job is in progress, then never changed. A photo must be a file bound to that job.
CREATE FUNCTION "job_evidence_check_insert"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  job_status "JobStatus";
BEGIN
  SELECT "status" INTO job_status FROM "jobs" WHERE "id" = NEW."jobId" FOR SHARE;
  IF job_status IS DISTINCT FROM 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'evidence can only be added to a job in progress' USING ERRCODE = 'restrict_violation';
  END IF;
  -- Nested, because the time records table has no fileId for this to read.
  IF TG_TABLE_NAME = 'job_photos' THEN
    IF NOT EXISTS (SELECT 1 FROM "files" WHERE "id" = NEW."fileId" AND "contextType" = 'JOB' AND "contextId" = NEW."jobId") THEN
      RAISE EXCEPTION 'a job photo must be a file bound to that job' USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION "job_evidence_refuse_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'job evidence table % is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER "job_photos_check_insert" BEFORE INSERT ON "job_photos" FOR EACH ROW EXECUTE FUNCTION "job_evidence_check_insert"();
CREATE TRIGGER "job_photos_append_only" BEFORE UPDATE OR DELETE ON "job_photos" FOR EACH ROW EXECUTE FUNCTION "job_evidence_refuse_change"();
CREATE TRIGGER "job_photos_no_truncate" BEFORE TRUNCATE ON "job_photos" FOR EACH STATEMENT EXECUTE FUNCTION "job_evidence_refuse_change"();
CREATE TRIGGER "installation_time_records_check_insert" BEFORE INSERT ON "installation_time_records" FOR EACH ROW EXECUTE FUNCTION "job_evidence_check_insert"();
CREATE TRIGGER "installation_time_records_append_only" BEFORE UPDATE OR DELETE ON "installation_time_records" FOR EACH ROW EXECUTE FUNCTION "job_evidence_refuse_change"();
CREATE TRIGGER "installation_time_records_no_truncate" BEFORE TRUNCATE ON "installation_time_records" FOR EACH STATEMENT EXECUTE FUNCTION "job_evidence_refuse_change"();

-- One technician can't be in two places. The lock makes two jobs' records wait for each other, so neither misses the other.
CREATE FUNCTION "installation_time_records_check_overlap"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('time:' || NEW."technicianId"::text, 0));
  IF EXISTS (
    SELECT 1 FROM "installation_time_records"
    WHERE "technicianId" = NEW."technicianId" AND "startedAt" < NEW."finishedAt" AND "finishedAt" > NEW."startedAt"
  ) THEN
    RAISE EXCEPTION 'violates check constraint "installation_time_records_no_overlap"' USING ERRCODE = '23514', CONSTRAINT = 'installation_time_records_no_overlap';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "installation_time_records_no_overlap" BEFORE INSERT ON "installation_time_records" FOR EACH ROW EXECUTE FUNCTION "installation_time_records_check_overlap"();
