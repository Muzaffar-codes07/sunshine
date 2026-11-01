BEGIN;

CREATE TABLE technician_rate_revisions (
  id UUID NOT NULL PRIMARY KEY,
  "technicianId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "hourlyRate" DECIMAL(14,2) NOT NULL,
  reference VARCHAR(500) NOT NULL,
  "createdById" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT technician_rate_revisions_valid CHECK (
    "hourlyRate" >= 0 AND "hourlyRate" <> 'NaN'::numeric AND length(btrim(reference)) >= 5)
);
CREATE INDEX "technician_rate_revisions_technicianId_createdAt_idx" ON technician_rate_revisions("technicianId","createdAt");
CREATE INDEX "technician_rate_revisions_createdById_idx" ON technician_rate_revisions("createdById");

CREATE TABLE installation_labour_approvals (
  "timeRecordId" UUID NOT NULL PRIMARY KEY REFERENCES installation_time_records(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "rateRevisionId" UUID NOT NULL REFERENCES technician_rate_revisions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "costEntryId" UUID NOT NULL REFERENCES cost_entries(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "elapsedMs" BIGINT NOT NULL,
  hours DECIMAL(12,3) NOT NULL,
  "hourlyRate" DECIMAL(14,2) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  "approvedById" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "approvedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(500) NOT NULL,
  CONSTRAINT installation_labour_approvals_valid CHECK (
    "elapsedMs" > 0 AND hours = round("elapsedMs"::numeric/3600000,3) AND
    "hourlyRate" >= 0 AND "hourlyRate" <> 'NaN'::numeric AND amount = round("elapsedMs"::numeric*"hourlyRate"/3600000,2) AND
    length(btrim(note)) >= 5)
);
CREATE UNIQUE INDEX "installation_labour_approvals_costEntryId_key" ON installation_labour_approvals("costEntryId");
CREATE INDEX "installation_labour_approvals_approvedAt_idx" ON installation_labour_approvals("approvedAt");
CREATE INDEX "installation_labour_approvals_rateRevisionId_idx" ON installation_labour_approvals("rateRevisionId");
CREATE INDEX "installation_labour_approvals_approvedById_idx" ON installation_labour_approvals("approvedById");

CREATE FUNCTION labour_preserve_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'violates check constraint "labour_preserve_evidence": approved rate/time facts cannot change or be removed'
    USING ERRCODE='23514', CONSTRAINT='labour_preserve_evidence';
END;
$$;
CREATE TRIGGER technician_rates_frozen BEFORE UPDATE OR DELETE ON technician_rate_revisions
  FOR EACH ROW EXECUTE FUNCTION labour_preserve_evidence();
CREATE TRIGGER technician_rates_no_truncate BEFORE TRUNCATE ON technician_rate_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION labour_preserve_evidence();
CREATE TRIGGER labour_approvals_frozen BEFORE UPDATE OR DELETE ON installation_labour_approvals
  FOR EACH ROW EXECUTE FUNCTION labour_preserve_evidence();
CREATE TRIGGER labour_approvals_no_truncate BEFORE TRUNCATE ON installation_labour_approvals
  FOR EACH STATEMENT EXECUTE FUNCTION labour_preserve_evidence();

CREATE FUNCTION labour_check_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='technician_rate_revisions' THEN
    IF NOT EXISTS (SELECT 1 FROM users t, users a WHERE t.id=NEW."technicianId" AND t.role='TECHNICIAN'
      AND a.id=NEW."createdById" AND a.role='ADMIN' AND a.active AND NEW."createdAt"<=clock_timestamp()) THEN
      RAISE EXCEPTION 'violates check constraint "labour_check_source": rate needs a technician and active administrator'
        USING ERRCODE='23514', CONSTRAINT='labour_check_source';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM installation_time_records t JOIN jobs j ON j.id=t."jobId"
      JOIN technician_rate_revisions r ON r.id=NEW."rateRevisionId" AND r."technicianId"=t."technicianId"
      JOIN cost_entries c ON c.id=NEW."costEntryId" AND c."jobId"=t."jobId"
      JOIN users a ON a.id=NEW."approvedById" AND a.role='ADMIN' AND a.active
      WHERE t.id=NEW."timeRecordId" AND j.status='COMPLETED' AND j."completedAt" IS NOT NULL
        AND t."startedAt">=j."startedAt" AND t."finishedAt"<=j."finishedAt"
        AND EXISTS (SELECT 1 FROM job_assignments a WHERE a."jobId"=j.id AND a."technicianId"=t."technicianId"
          AND (a."removedAt" IS NULL OR a."removedAt">=t."finishedAt"))
        AND NEW."elapsedMs"=(extract(epoch FROM t."finishedAt"-t."startedAt")*1000)::bigint
        AND NEW."hourlyRate"=r."hourlyRate" AND c.amount=NEW.amount AND c."costType"='INSTALLATION_LABOUR'
        AND c."uniqueSourceId"='TIME_RECORD:'||t.id::text AND c."reversalOfId" IS NULL AND c."occurredAt"=t."finishedAt"
        AND NEW."approvedAt">=greatest(t."finishedAt",t."createdAt",j."completedAt",r."createdAt") AND NEW."approvedAt"<=clock_timestamp()
    ) THEN
      RAISE EXCEPTION 'violates check constraint "labour_check_source": approved time, rate, actor and posted cost must agree'
        USING ERRCODE='23514', CONSTRAINT='labour_check_source';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER technician_rates_source BEFORE INSERT ON technician_rate_revisions
  FOR EACH ROW EXECUTE FUNCTION labour_check_source();
CREATE TRIGGER labour_approvals_source BEFORE INSERT ON installation_labour_approvals
  FOR EACH ROW EXECUTE FUNCTION labour_check_source();

COMMIT;
