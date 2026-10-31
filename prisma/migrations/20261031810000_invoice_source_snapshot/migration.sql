BEGIN;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "sourceSnapshot" JSONB;

COMMIT;
