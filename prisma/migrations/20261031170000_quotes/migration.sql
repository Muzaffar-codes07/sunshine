-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuoteLineKind" AS ENUM ('PACKAGE', 'COMPONENT', 'SERVICE');

-- CreateEnum
CREATE TYPE "QuoteSentChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'PRINT', 'OTHER');

-- CreateEnum
CREATE TYPE "QuoteDecisionChannel" AS ENUM ('IN_PERSON', 'PHONE', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "QuotePolicyStatus" AS ENUM ('CONFIGURED', 'UNCONFIGURED', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "surveyId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "supersedesQuoteId" UUID,
    "revisionReason" TEXT,
    "customerSnapshot" JSONB NOT NULL,
    "packageSnapshot" JSONB NOT NULL,
    "hardwarePrice" DECIMAL(14,2) NOT NULL,
    "installationPrice" DECIMAL(14,2) NOT NULL,
    "totalPrice" DECIMAL(14,2) NOT NULL,
    "createdById" UUID NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "sentChannel" "QuoteSentChannel",
    "sentById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" UUID,
    "acceptedByName" VARCHAR(120),
    "decisionChannel" "QuoteDecisionChannel",
    "decisionReference" VARCHAR(500),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "QuoteLineKind" NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "productId" UUID,
    "productSnapshot" JSONB,
    "policyStatus" "QuotePolicyStatus" NOT NULL,
    "warrantyPolicySnapshot" JSONB,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_supersedesQuoteId_key" ON "quotes"("supersedesQuoteId");

-- CreateIndex
CREATE INDEX "quotes_customerId_status_idx" ON "quotes"("customerId", "status");

-- CreateIndex
CREATE INDEX "quotes_surveyId_idx" ON "quotes"("surveyId");

-- CreateIndex
CREATE INDEX "quotes_packageId_idx" ON "quotes"("packageId");

-- CreateIndex
CREATE INDEX "quotes_createdById_idx" ON "quotes"("createdById");

-- CreateIndex
CREATE INDEX "quotes_sentById_idx" ON "quotes"("sentById");

-- CreateIndex
CREATE INDEX "quotes_decidedById_idx" ON "quotes"("decidedById");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_enquiryId_revision_key" ON "quotes"("enquiryId", "revision");

-- CreateIndex
CREATE INDEX "quote_lines_productId_idx" ON "quote_lines"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "quote_lines_quoteId_position_key" ON "quote_lines"("quoteId", "position");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_supersedesQuoteId_fkey" FOREIGN KEY ("supersedesQuoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exact-money and workflow backstops. Canonical CHECK/index definitions are registered on PG17.11.
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_revision_positive" CHECK ("revision" >= 1);
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_version_positive" CHECK ("version" >= 1);
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_prices_reconcile" CHECK (
  "hardwarePrice" >= 0 AND "installationPrice" >= 0 AND "totalPrice" >= 0
  AND "hardwarePrice" <> 'NaN'::numeric AND "installationPrice" <> 'NaN'::numeric AND "totalPrice" <> 'NaN'::numeric
  AND "totalPrice" = "hardwarePrice" + "installationPrice"
);
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_revision_source" CHECK (
  ("revision" = 1 AND "supersedesQuoteId" IS NULL AND "revisionReason" IS NULL)
  OR ("revision" > 1 AND "supersedesQuoteId" IS NOT NULL AND "revisionReason" IS NOT NULL AND length(btrim("revisionReason")) >= 3)
);
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_snapshots_objects" CHECK (
  jsonb_typeof("customerSnapshot") = 'object' AND jsonb_typeof("packageSnapshot") = 'object'
);
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_sent_evidence" CHECK (
  ("status" = 'DRAFT' AND "sentAt" IS NULL AND "sentById" IS NULL AND "sentChannel" IS NULL)
  OR ("status" <> 'DRAFT' AND "sentAt" IS NOT NULL AND "sentById" IS NOT NULL AND "sentChannel" IS NOT NULL)
);
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_decision_evidence" CHECK (
  ("status" IN ('ACCEPTED', 'REJECTED') AND "decidedAt" IS NOT NULL AND "decidedById" IS NOT NULL)
  OR ("status" IN ('DRAFT', 'SENT') AND "decidedAt" IS NULL AND "decidedById" IS NULL)
);
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_accepted_evidence" CHECK (
  ("status" = 'ACCEPTED' AND "acceptedByName" IS NOT NULL AND length(btrim("acceptedByName")) >= 2 AND "decisionChannel" IS NOT NULL AND "decisionReason" IS NULL)
  OR ("status" <> 'ACCEPTED' AND "acceptedByName" IS NULL AND "decisionChannel" IS NULL AND "decisionReference" IS NULL)
);
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_rejected_reason" CHECK (
  ("status" = 'REJECTED' AND "decisionReason" IS NOT NULL AND length(btrim("decisionReason")) >= 3)
  OR ("status" <> 'REJECTED' AND "decisionReason" IS NULL)
);
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_description_not_blank" CHECK (length(btrim("description")) > 0);
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_position_positive" CHECK ("position" >= 1);
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quantity_positive" CHECK ("quantity" > 0 AND "quantity" <> 'NaN'::numeric);
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_prices_nonnegative" CHECK (
  "unitPrice" >= 0 AND "lineTotal" >= 0 AND "unitPrice" <> 'NaN'::numeric AND "lineTotal" <> 'NaN'::numeric
);
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_charging_consistent" CHECK (
  ("kind" = 'COMPONENT' AND "unitPrice" = 0 AND "lineTotal" = 0)
  OR ("kind" IN ('PACKAGE', 'SERVICE') AND "quantity" = 1 AND "unitPrice" = "lineTotal")
);
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_product_consistent" CHECK (
  ("kind" = 'PACKAGE' AND "productId" IS NULL AND "productSnapshot" IS NULL AND "policyStatus" = 'NOT_APPLICABLE' AND "warrantyPolicySnapshot" IS NULL)
  OR ("kind" IN ('COMPONENT', 'SERVICE') AND "productId" IS NOT NULL AND "productSnapshot" IS NOT NULL
    AND jsonb_typeof("productSnapshot") = 'object' AND "productSnapshot" ?& ARRAY['id','kind','trackingMode']
    AND jsonb_typeof("productSnapshot"->'id') = 'string' AND jsonb_typeof("productSnapshot"->'kind') = 'string' AND jsonb_typeof("productSnapshot"->'trackingMode') = 'string'
    AND "productSnapshot"->>'id' = "productId"::text
    AND "productSnapshot"->>'kind' = CASE WHEN "kind" = 'COMPONENT' THEN 'HARDWARE' ELSE 'SERVICE' END
    AND (("policyStatus" = 'CONFIGURED' AND "warrantyPolicySnapshot" IS NOT NULL AND jsonb_typeof("warrantyPolicySnapshot") = 'object')
      OR ("policyStatus" = 'UNCONFIGURED' AND "warrantyPolicySnapshot" IS NULL)))
);
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_serialized_whole" CHECK (
  "productSnapshot" IS NULL OR "productSnapshot"->>'trackingMode' <> 'SERIALIZED' OR "quantity" = trunc("quantity")
);
CREATE UNIQUE INDEX "quote_lines_one_package_charge" ON "quote_lines" ("quoteId") WHERE "kind" = 'PACKAGE';
CREATE UNIQUE INDEX "quote_lines_one_service_charge" ON "quote_lines" ("quoteId") WHERE "kind" = 'SERVICE';
CREATE UNIQUE INDEX "quote_lines_one_component_product" ON "quote_lines" ("quoteId", "productId") WHERE "kind" = 'COMPONENT';

-- A sent snapshot is immutable; line writes lock its header so they cannot race sending.
-- These triggers are tested directly; pg_constraint does not expose trigger rules to the manifest checker.
CREATE FUNCTION "quote_lines_preserve_sent_terms"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status "QuoteStatus";
BEGIN
  SELECT "status" INTO parent_status FROM "quotes" WHERE "id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."quoteId" ELSE NEW."quoteId" END FOR SHARE;
  IF parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'violates check constraint "quote_lines_frozen_terms"' USING ERRCODE = '23514', CONSTRAINT = 'quote_lines_frozen_terms';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."quoteId" <> OLD."quoteId" THEN
    RAISE EXCEPTION 'violates check constraint "quote_lines_frozen_terms"' USING ERRCODE = '23514', CONSTRAINT = 'quote_lines_frozen_terms';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "quote_lines_preserve_sent_terms" BEFORE INSERT OR UPDATE OR DELETE ON "quote_lines"
  FOR EACH ROW EXECUTE FUNCTION "quote_lines_preserve_sent_terms"();

CREATE FUNCTION "quotes_preserve_frozen_terms"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' OR NEW."version" <> 1 THEN
      RAISE EXCEPTION 'violates check constraint "quotes_frozen_terms"' USING ERRCODE = '23514', CONSTRAINT = 'quotes_frozen_terms';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'violates check constraint "quotes_frozen_terms"' USING ERRCODE = '23514', CONSTRAINT = 'quotes_frozen_terms';
    END IF;
    RETURN OLD;
  END IF;
  IF ROW(OLD."id", OLD."enquiryId", OLD."surveyId", OLD."packageId", OLD."customerId", OLD."revision", OLD."supersedesQuoteId", OLD."revisionReason",
      OLD."customerSnapshot", OLD."packageSnapshot", OLD."hardwarePrice", OLD."installationPrice", OLD."totalPrice", OLD."createdById", OLD."createdAt")
    IS DISTINCT FROM ROW(NEW."id", NEW."enquiryId", NEW."surveyId", NEW."packageId", NEW."customerId", NEW."revision", NEW."supersedesQuoteId", NEW."revisionReason",
      NEW."customerSnapshot", NEW."packageSnapshot", NEW."hardwarePrice", NEW."installationPrice", NEW."totalPrice", NEW."createdById", NEW."createdAt")
    OR NEW."version" <> OLD."version" + 1
    OR NOT ((OLD."status" = 'DRAFT' AND NEW."status" = 'SENT') OR (OLD."status" = 'SENT' AND NEW."status" IN ('ACCEPTED', 'REJECTED')))
    OR (OLD."status" = 'SENT' AND ROW(OLD."sentAt", OLD."sentById", OLD."sentChannel") IS DISTINCT FROM ROW(NEW."sentAt", NEW."sentById", NEW."sentChannel"))
  THEN
    RAISE EXCEPTION 'violates check constraint "quotes_frozen_terms"' USING ERRCODE = '23514', CONSTRAINT = 'quotes_frozen_terms';
  END IF;
  IF NEW."status" = 'SENT' THEN
    IF (SELECT count(*) FROM "quote_lines" WHERE "quoteId" = NEW."id" AND "kind" = 'PACKAGE' AND "lineTotal" = NEW."hardwarePrice") <> 1
      OR (SELECT count(*) FROM "quote_lines" WHERE "quoteId" = NEW."id" AND "kind" = 'SERVICE' AND "lineTotal" = NEW."installationPrice") <> 1
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['PANEL','INVERTER','CHARGE_CONTROLLER','MOUNTING','WIRING_BOX','SWITCHGEAR','CABLE','EARTHING','CONNECTOR']) AS required(category)
        WHERE NOT EXISTS (SELECT 1 FROM "quote_lines" line WHERE line."quoteId" = NEW."id" AND line."kind" = 'COMPONENT' AND line."productSnapshot"->>'category' = required.category))
      OR ((NEW."packageSnapshot"->>'systemType' = 'OFF_GRID') IS DISTINCT FROM EXISTS (
        SELECT 1 FROM "quote_lines" WHERE "quoteId" = NEW."id" AND "kind" = 'COMPONENT' AND "productSnapshot"->>'category' = 'BATTERY'))
    THEN
      RAISE EXCEPTION 'violates check constraint "quotes_complete_terms"' USING ERRCODE = '23514', CONSTRAINT = 'quotes_complete_terms';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "quotes_preserve_frozen_terms" BEFORE INSERT OR UPDATE OR DELETE ON "quotes"
  FOR EACH ROW EXECUTE FUNCTION "quotes_preserve_frozen_terms"();
