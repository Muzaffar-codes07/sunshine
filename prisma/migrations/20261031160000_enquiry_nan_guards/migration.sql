BEGIN;

-- Follow-up C1d: PostgreSQL numeric NaN sorts above every number, so ">= 0" alone accepts it.
-- Replace the two enquiry CHECKs from 20261031100000_sales_enquiry (applied migrations are never edited).
ALTER TABLE "enquiries" DROP CONSTRAINT "enquiries_roof_area_nonnegative";
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_roof_area_nonnegative"
  CHECK ("shadowFreeRoofAreaSqm" IS NULL OR ("shadowFreeRoofAreaSqm" >= 0 AND "shadowFreeRoofAreaSqm" <> 'NaN'::numeric));
ALTER TABLE "enquiries" DROP CONSTRAINT "enquiries_bill_nonnegative";
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_bill_nonnegative"
  CHECK ("monthlyBillInr" IS NULL OR ("monthlyBillInr" >= 0 AND "monthlyBillInr" <> 'NaN'::numeric));

COMMIT;
