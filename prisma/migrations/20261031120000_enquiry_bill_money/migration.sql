-- Follow-up C1c: the monthly bill is money, so it uses the Decimal(14,2) money convention.
-- Widening only; existing values and enquiries_bill_nonnegative are unchanged.
-- AlterTable
ALTER TABLE "enquiries" ALTER COLUMN "monthlyBillInr" SET DATA TYPE DECIMAL(14,2);
