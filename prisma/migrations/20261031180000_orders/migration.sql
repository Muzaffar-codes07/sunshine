-- C5 orders, packing requirements, invoices and receipts. One transaction, so a failure leaves nothing half-created.
BEGIN;

-- CreateEnum
CREATE TYPE "InvoiceSourceType" AS ENUM ('ORDER', 'TICKET');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('SALE', 'REPAIR');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('POSTED', 'PART_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('ADVANCE', 'PARTIAL', 'FINAL');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "quoteId" UUID NOT NULL,
    "enquiryId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "jobId" UUID,
    "confirmedById" UUID NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packing_requirements" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "quoteLineId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "packing_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "sourceType" "InvoiceSourceType" NOT NULL,
    "sourceId" UUID NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "orderId" UUID,
    "customerId" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'POSTED',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxNote" VARCHAR(200) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "postedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "quoteLineId" UUID,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_quoteId_key" ON "orders"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_enquiryId_key" ON "orders"("enquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_jobId_key" ON "orders"("jobId");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- CreateIndex
CREATE INDEX "orders_confirmedById_idx" ON "orders"("confirmedById");

-- CreateIndex
CREATE UNIQUE INDEX "packing_requirements_quoteLineId_key" ON "packing_requirements"("quoteLineId");

-- CreateIndex
CREATE INDEX "packing_requirements_orderId_idx" ON "packing_requirements"("orderId");

-- CreateIndex
CREATE INDEX "packing_requirements_productId_idx" ON "packing_requirements"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_orderId_idx" ON "invoices"("orderId");

-- CreateIndex
CREATE INDEX "invoices_customerId_status_idx" ON "invoices"("customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_sourceType_sourceId_kind_key" ON "invoices"("sourceType", "sourceId", "kind");

-- CreateIndex
CREATE INDEX "invoice_lines_quoteLineId_idx" ON "invoice_lines"("quoteLineId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_invoiceId_position_key" ON "invoice_lines"("invoiceId", "position");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "payments_recordedById_idx" ON "payments"("recordedById");

-- CreateIndex
CREATE UNIQUE INDEX "payments_method_reference_key" ON "payments"("method", "reference");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_requirements" ADD CONSTRAINT "packing_requirements_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_requirements" ADD CONSTRAINT "packing_requirements_quoteLineId_fkey" FOREIGN KEY ("quoteLineId") REFERENCES "quote_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_requirements" ADD CONSTRAINT "packing_requirements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_quoteLineId_fkey" FOREIGN KEY ("quoteLineId") REFERENCES "quote_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written money and integrity rules (listed in prisma/required-constraints.json). NaN sorts above every
-- number in PostgreSQL, so each amount rule also excludes it.
ALTER TABLE "packing_requirements" ADD CONSTRAINT "packing_requirements_quantity_positive"
  CHECK ("quantity" > 0 AND "quantity" <> 'NaN'::numeric);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_valid" CHECK (
  "subtotal" >= 0 AND "taxAmount" >= 0 AND "subtotal" <> 'NaN'::numeric AND "taxAmount" <> 'NaN'::numeric
  AND "total" = "subtotal" + "taxAmount"
);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paid_within_total"
  CHECK ("paidAmount" >= 0 AND "paidAmount" <> 'NaN'::numeric AND "paidAmount" <= "total");
-- Status always agrees with the money: nothing paid, part paid, or exactly paid.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_status_matches_paid" CHECK (
  ("status" = 'POSTED' AND "paidAmount" = 0)
  OR ("status" = 'PART_PAID' AND "paidAmount" > 0 AND "paidAmount" < "total")
  OR ("status" = 'PAID' AND "paidAmount" = "total")
);
-- A sales invoice belongs to exactly its order; a repair invoice (D4, later) has no order.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_source_matches_kind" CHECK (
  ("sourceType" = 'ORDER' AND "kind" = 'SALE' AND "orderId" IS NOT NULL AND "orderId" = "sourceId")
  OR ("sourceType" = 'TICKET' AND "kind" = 'REPAIR' AND "orderId" IS NULL)
);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tax_note_present" CHECK (length(btrim("taxNote")) > 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_version_positive" CHECK ("version" >= 1);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_amounts_valid" CHECK (
  "quantity" > 0 AND "unitPrice" >= 0 AND "quantity" <> 'NaN'::numeric AND "unitPrice" <> 'NaN'::numeric
  AND "lineTotal" = round("quantity" * "unitPrice", 2)
);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_position_positive" CHECK ("position" >= 1);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0 AND "amount" <> 'NaN'::numeric);
ALTER TABLE "payments" ADD CONSTRAINT "payments_reference_not_blank" CHECK (length(btrim("reference")) > 0);

COMMIT;
