-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('SCHEDULED', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RoofDirection" AS ENUM ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW');

-- CreateTable
CREATE TABLE "surveys" (
    "id" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "SurveyStatus" NOT NULL DEFAULT 'SCHEDULED',
    "technicianId" UUID NOT NULL,
    "scheduledFor" TIMESTAMPTZ(3) NOT NULL,
    "roofDirection" "RoofDirection",
    "roofTiltDeg" DECIMAL(4,1),
    "cableDistanceM" DECIMAL(7,2),
    "usableRoofAreaSqm" DECIMAL(8,2),
    "notes" TEXT,
    "submittedAt" TIMESTAMPTZ(3),
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "surveys_technicianId_status_scheduledFor_idx" ON "surveys"("technicianId", "status", "scheduledFor");

-- CreateIndex
CREATE INDEX "surveys_decidedById_idx" ON "surveys"("decidedById");

-- CreateIndex
CREATE UNIQUE INDEX "surveys_enquiryId_revision_key" ON "surveys"("enquiryId", "revision");

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written rules (listed in prisma/required-constraints.json; Prisma cannot express them).
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_revision_positive" CHECK ("revision" >= 1);
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_version_positive" CHECK ("version" >= 1);
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_tilt_range" CHECK ("roofTiltDeg" IS NULL OR ("roofTiltDeg" >= 0 AND "roofTiltDeg" <= 90));
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_cable_distance_nonnegative" CHECK ("cableDistanceM" IS NULL OR "cableDistanceM" >= 0);
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_roof_area_nonnegative" CHECK ("usableRoofAreaSqm" IS NULL OR "usableRoofAreaSqm" >= 0);
-- A submitted or decided revision has every measurement and a submission time.
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_submitted_has_measurements" CHECK (
  "status" = 'SCHEDULED'
  OR ("roofDirection" IS NOT NULL AND "roofTiltDeg" IS NOT NULL AND "cableDistanceM" IS NOT NULL
      AND "usableRoofAreaSqm" IS NOT NULL AND "submittedAt" IS NOT NULL)
);
-- Exactly the decided revisions record who decided and when.
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_decision_recorded" CHECK (
  ("status" IN ('APPROVED', 'REJECTED')) = ("decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL)
);
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_rejected_has_reason" CHECK (
  "status" <> 'REJECTED' OR ("decisionReason" IS NOT NULL AND length(btrim("decisionReason")) > 0)
);
-- At most one revision in progress per enquiry, even under concurrent scheduling.
CREATE UNIQUE INDEX "surveys_one_open_per_enquiry" ON "surveys" ("enquiryId") WHERE "status" IN ('SCHEDULED', 'SUBMITTED');