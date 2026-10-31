BEGIN;
-- CreateTable
CREATE TABLE "product_warranty_policies" (
    "productId" UUID NOT NULL,
    "policyName" VARCHAR(200) NOT NULL,
    "revision" VARCHAR(100) NOT NULL,
    "scope" VARCHAR(2000) NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_warranty_policies_pkey" PRIMARY KEY ("productId")
);

-- AddForeignKey
ALTER TABLE "product_warranty_policies" ADD CONSTRAINT "product_warranty_policies_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Terms must pass the quote snapshot contract, and an absurd duration must not be able to break delivery's date arithmetic.
ALTER TABLE "product_warranty_policies" ADD CONSTRAINT "product_warranty_policies_terms_valid" CHECK (
  btrim("policyName") <> '' AND btrim("revision") <> '' AND btrim("scope") <> '' AND "durationMonths" BETWEEN 1 AND 1200
);
COMMIT;
