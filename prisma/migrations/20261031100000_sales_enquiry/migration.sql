-- Sales (D2): customers and enquiries. Reviewed by D3 (migration queue).
CREATE TYPE "EnquirySource" AS ENUM ('WEB', 'PHONE', 'WHATSAPP');

CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED', 'ARCHIVED');

CREATE TYPE "SystemType" AS ENUM ('ON_GRID', 'OFF_GRID');

CREATE TABLE "customers" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "addressLine" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "pincode" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customers_phone_format" CHECK ("phone" ~ '^[6-9][0-9]{9}$'),
  CONSTRAINT "customers_pincode_format" CHECK ("pincode" ~ '^[1-9][0-9]{5}$'),
  CONSTRAINT "customers_name_not_blank" CHECK (length(btrim("name")) >= 2)
);

CREATE TABLE "enquiries" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "source" "EnquirySource" NOT NULL,
  "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
  "requestedCapacityKw" INTEGER NOT NULL,
  "systemType" "SystemType",
  "subsidyInterest" BOOLEAN NOT NULL DEFAULT false,
  "message" TEXT,
  "shadowFreeRoofAreaSqm" DECIMAL(8,2),
  "monthlyBillInr" DECIMAL(12,2),
  "gridConnectionSuitable" BOOLEAN,
  "ownerId" UUID,
  "nextFollowUpAt" TIMESTAMPTZ(3),
  "closedReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id"),
  -- Packages are sold from 1 kW to 5 kW (problem statement).
  CONSTRAINT "enquiries_capacity_range" CHECK ("requestedCapacityKw" BETWEEN 1 AND 5),
  CONSTRAINT "enquiries_roof_area_nonnegative" CHECK ("shadowFreeRoofAreaSqm" IS NULL OR "shadowFreeRoofAreaSqm" >= 0),
  CONSTRAINT "enquiries_bill_nonnegative" CHECK ("monthlyBillInr" IS NULL OR "monthlyBillInr" >= 0),
  CONSTRAINT "enquiries_version_positive" CHECK ("version" >= 1),
  -- Enquiries are never silently dropped: closing one requires a stated reason.
  CONSTRAINT "enquiries_closed_has_reason" CHECK (
    "status" NOT IN ('DISQUALIFIED', 'ARCHIVED')
    OR ("closedReason" IS NOT NULL AND length(btrim("closedReason")) > 0)
  )
);

CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");

CREATE INDEX "enquiries_status_nextFollowUpAt_idx" ON "enquiries"("status", "nextFollowUpAt");

CREATE INDEX "enquiries_ownerId_status_idx" ON "enquiries"("ownerId", "status");

CREATE INDEX "enquiries_customerId_idx" ON "enquiries"("customerId");

CREATE INDEX "enquiries_createdAt_idx" ON "enquiries"("createdAt");

ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
