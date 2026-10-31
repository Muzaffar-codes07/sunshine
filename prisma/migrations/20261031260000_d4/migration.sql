-- D4: coordinated warranty/service/cost/subsidy migration after Files 20261031255000.
-- D3 allocation ticketLineId/XOR and unit predecessor changes are separate.
BEGIN;

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ASSESSED', 'IN_PROGRESS', 'AWAITING_CUSTOMER_CONFIRMATION', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketLineType" AS ENUM ('PART', 'LABOUR');

-- CreateEnum
CREATE TYPE "ConfirmationChannel" AS ENUM ('PHONE', 'WHATSAPP', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('MATERIAL_DISPATCH', 'INSTALLATION_LABOUR', 'SERVICE_LABOUR', 'REPAIR_PARTS');

-- CreateEnum
CREATE TYPE "SubsidyMilestoneStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RECEIVED');

-- CreateTable
CREATE TABLE "warranties" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "expiryDate" DATE NOT NULL,
    "policyName" TEXT NOT NULL,
    "policyRevision" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "warranties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_entries" (
    "id" UUID NOT NULL,
    "uniqueSourceId" TEXT NOT NULL,
    "jobId" UUID NOT NULL,
    "costType" "CostType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "reversalOfId" UUID,
    "postedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_tickets" (
    "id" UUID NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "faultDescription" TEXT NOT NULL,
    "assessmentSnapshot" JSONB,
    "billingSnapshot" JSONB,
    "replacedUnitId" UUID,
    "newUnitId" UUID,
    "replacementSnapshot" JSONB,
    "resolutionDetails" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "confirmedBy" TEXT,
    "confirmationChannel" "ConfirmationChannel",
    "confirmedAt" TIMESTAMPTZ(3),
    "confirmationNotes" TEXT,
    "closedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_lines" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "lineType" "TicketLineType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "billableToCustomer" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subsidy_milestones" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "status" "SubsidyMilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "submissionDate" TIMESTAMPTZ(3),
    "approvalDate" TIMESTAMPTZ(3),
    "amount" DECIMAL(14,2) NOT NULL,
    "evidenceFileId" UUID,
    "pendingDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responsibleOwnerId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subsidy_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warranties_unitId_key" ON "warranties"("unitId");

-- CreateIndex
CREATE INDEX "warranties_active_expiryDate_idx" ON "warranties"("active", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "cost_entries_reversalOfId_key" ON "cost_entries"("reversalOfId");

-- CreateIndex
CREATE INDEX "cost_entries_jobId_occurredAt_idx" ON "cost_entries"("jobId", "occurredAt");

-- CreateIndex
CREATE INDEX "cost_entries_occurredAt_idx" ON "cost_entries"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "cost_entries_uniqueSourceId_costType_key" ON "cost_entries"("uniqueSourceId", "costType");

-- CreateIndex
CREATE UNIQUE INDEX "service_tickets_ticketNumber_key" ON "service_tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "service_tickets_customerId_idx" ON "service_tickets"("customerId");

-- CreateIndex
CREATE INDEX "service_tickets_unitId_status_idx" ON "service_tickets"("unitId", "status");

-- CreateIndex
CREATE INDEX "service_tickets_jobId_status_idx" ON "service_tickets"("jobId", "status");

-- CreateIndex
CREATE INDEX "service_tickets_replacedUnitId_idx" ON "service_tickets"("replacedUnitId");

-- CreateIndex
CREATE INDEX "service_tickets_newUnitId_idx" ON "service_tickets"("newUnitId");

-- CreateIndex
CREATE INDEX "service_tickets_status_createdAt_idx" ON "service_tickets"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_lines_ticketId_idx" ON "ticket_lines"("ticketId");

-- CreateIndex
CREATE INDEX "subsidy_milestones_jobId_status_idx" ON "subsidy_milestones"("jobId", "status");

-- CreateIndex
CREATE INDEX "subsidy_milestones_status_stage_idx" ON "subsidy_milestones"("status", "stage");

-- CreateIndex
CREATE INDEX "subsidy_milestones_evidenceFileId_idx" ON "subsidy_milestones"("evidenceFileId");

-- CreateIndex
CREATE INDEX "subsidy_milestones_responsibleOwnerId_status_idx" ON "subsidy_milestones"("responsibleOwnerId", "status");

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "cost_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_replacedUnitId_fkey" FOREIGN KEY ("replacedUnitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_newUnitId_fkey" FOREIGN KEY ("newUnitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_lines" ADD CONSTRAINT "ticket_lines_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "service_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subsidy_milestones" ADD CONSTRAINT "subsidy_milestones_responsibleOwnerId_fkey" FOREIGN KEY ("responsibleOwnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subsidy_milestones" ADD CONSTRAINT "subsidy_milestones_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subsidy_milestones" ADD CONSTRAINT "subsidy_milestones_evidenceFileId_fkey"
  FOREIGN KEY ("evidenceFileId") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "warranties"
  ADD CONSTRAINT "warranties_dates_ordered" CHECK ("expiryDate" > "startDate"),
  ADD CONSTRAINT "warranties_duration_positive" CHECK ("durationMonths" > 0),
  ADD CONSTRAINT "warranties_version_positive" CHECK ("version" >= 1),
  ADD CONSTRAINT "warranties_policy_not_blank" CHECK (
    length(btrim("policyName")) > 0 AND length(btrim("policyRevision")) > 0 AND length(btrim("scope")) > 0);

ALTER TABLE "cost_entries"
  ADD CONSTRAINT "cost_entries_amount_finite" CHECK ("amount" <> 'NaN'::numeric),
  ADD CONSTRAINT "cost_entries_text_not_blank" CHECK (length(btrim("uniqueSourceId")) > 0 AND length(btrim("description")) > 0),
  ADD CONSTRAINT "cost_entries_reversal_shape" CHECK (
    ("reversalOfId" IS NULL AND "amount" >= 0 AND upper("uniqueSourceId") NOT LIKE 'REVERSAL:%') OR
    ("reversalOfId" IS NOT NULL AND "reversalOfId" <> "id" AND "amount" <= 0 AND
      "uniqueSourceId" = 'REVERSAL:' || "reversalOfId"::text));

ALTER TABLE "service_tickets"
  ADD CONSTRAINT "service_tickets_text_not_blank" CHECK (length(btrim("ticketNumber")) > 0 AND length(btrim("faultDescription")) > 0),
  ADD CONSTRAINT "service_tickets_version_positive" CHECK ("version" >= 1),
  ADD CONSTRAINT "service_tickets_assessment_required" CHECK (
    "status" = 'OPEN' OR ("assessmentSnapshot" IS NOT NULL AND jsonb_typeof("assessmentSnapshot") = 'object')),
  ADD CONSTRAINT "service_tickets_billing_object" CHECK ("billingSnapshot" IS NULL OR jsonb_typeof("billingSnapshot") = 'object'),
  ADD CONSTRAINT "service_tickets_resolution_required" CHECK (
    "status" NOT IN ('AWAITING_CUSTOMER_CONFIRMATION', 'CLOSED') OR
    ("resolutionDetails" IS NOT NULL AND length(btrim("resolutionDetails")) > 0 AND "resolvedAt" IS NOT NULL)),
  ADD CONSTRAINT "service_tickets_confirmation_complete" CHECK (
    ("status" <> 'CLOSED' AND "confirmedBy" IS NULL AND "confirmationChannel" IS NULL AND "confirmedAt" IS NULL AND "closedAt" IS NULL) OR
    ("status" = 'CLOSED' AND "confirmedBy" IS NOT NULL AND length(btrim("confirmedBy")) > 0 AND
      "confirmationChannel" IS NOT NULL AND "confirmedAt" IS NOT NULL AND "closedAt" IS NOT NULL)),
  ADD CONSTRAINT "service_tickets_confirmation_ordered" CHECK (
    "confirmedAt" IS NULL OR ("resolvedAt" IS NOT NULL AND "confirmedAt" >= "resolvedAt" AND "closedAt" >= "confirmedAt")),
  ADD CONSTRAINT "service_tickets_replacement_complete" CHECK (
    ("replacedUnitId" IS NULL AND "newUnitId" IS NULL AND "replacementSnapshot" IS NULL) OR
    ("replacedUnitId" IS NOT NULL AND "newUnitId" IS NOT NULL AND "replacementSnapshot" IS NOT NULL AND
      jsonb_typeof("replacementSnapshot") = 'object' AND "replacedUnitId" = "unitId" AND "newUnitId" <> "replacedUnitId"));

ALTER TABLE "ticket_lines"
  ADD CONSTRAINT "ticket_lines_description_not_blank" CHECK (length(btrim("description")) > 0),
  ADD CONSTRAINT "ticket_lines_quantity_positive" CHECK ("quantity" > 0 AND "quantity" <> 'NaN'::numeric),
  ADD CONSTRAINT "ticket_lines_cost_nonnegative" CHECK (
    "unitCost" >= 0 AND "unitCost" <> 'NaN'::numeric AND "totalCost" >= 0 AND "totalCost" <> 'NaN'::numeric),
  ADD CONSTRAINT "ticket_lines_total_matches" CHECK ("totalCost" = round("quantity" * "unitCost", 2));

ALTER TABLE "subsidy_milestones"
  ADD CONSTRAINT "subsidy_milestones_stage_not_blank" CHECK (length(btrim("stage")) > 0),
  ADD CONSTRAINT "subsidy_milestones_amount_nonnegative" CHECK ("amount" >= 0 AND "amount" <> 'NaN'::numeric),
  ADD CONSTRAINT "subsidy_milestones_version_positive" CHECK ("version" >= 1),
  ADD CONSTRAINT "subsidy_milestones_dates_ordered" CHECK (
    "approvalDate" IS NULL OR ("submissionDate" IS NOT NULL AND "approvalDate" >= "submissionDate"));

-- Source facts are immutable. A reversal is another append-only entry, never
-- a destructive edit. The unique reversalOfId index serializes competing reversals.
CREATE FUNCTION "cost_entries_refuse_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'posted costs are immutable; append a linked reversal'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'cost_entries_immutable';
END;
$$;
CREATE TRIGGER "cost_entries_no_update_delete" BEFORE UPDATE OR DELETE ON "cost_entries"
  FOR EACH ROW EXECUTE FUNCTION "cost_entries_refuse_mutation"();
CREATE TRIGGER "cost_entries_no_truncate" BEFORE TRUNCATE ON "cost_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION "cost_entries_refuse_mutation"();

CREATE FUNCTION "cost_entries_check_reversal"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  original RECORD;
BEGIN
  IF NEW."reversalOfId" IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO original FROM "cost_entries" WHERE "id" = NEW."reversalOfId" FOR SHARE;
  IF NOT FOUND OR original."reversalOfId" IS NOT NULL OR
    NEW."jobId" <> original."jobId" OR NEW."costType" <> original."costType" OR
    NEW."amount" <> -original."amount" OR NEW."occurredAt" < original."occurredAt" THEN
    RAISE EXCEPTION 'a reversal must negate one original cost on its job and type at or after its occurrence'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'cost_entries_valid_reversal';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "cost_entries_reversal_guard" BEFORE INSERT ON "cost_entries"
  FOR EACH ROW EXECUTE FUNCTION "cost_entries_check_reversal"();

COMMIT;
