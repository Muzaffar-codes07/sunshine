BEGIN;
-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'DELIVERED');

-- AlterTable
ALTER TABLE "dispatches" ADD COLUMN     "deliveredAt" TIMESTAMPTZ(3),
ADD COLUMN     "deliveredById" UUID,
ADD COLUMN     "dispatchedAt" TIMESTAMPTZ(3),
ADD COLUMN     "dispatchedById" UUID,
ADD COLUMN     "issueDocumentId" UUID,
ADD COLUMN     "status" "DispatchStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateIndex
CREATE UNIQUE INDEX "dispatches_issueDocumentId_key" ON "dispatches"("issueDocumentId");

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_issueDocumentId_fkey" FOREIGN KEY ("issueDocumentId") REFERENCES "stock_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "dispatches"
  ADD CONSTRAINT "dispatches_dispatched_facts" CHECK ("status" = 'DRAFT' OR ("dispatchedAt" IS NOT NULL AND "dispatchedById" IS NOT NULL AND "issueDocumentId" IS NOT NULL)),
  ADD CONSTRAINT "dispatches_delivered_facts" CHECK ("status" <> 'DELIVERED' OR ("deliveredAt" IS NOT NULL AND "deliveredById" IS NOT NULL)),
  ADD CONSTRAINT "dispatches_delivery_ordered" CHECK ("deliveredAt" IS NULL OR "deliveredAt" >= "dispatchedAt");

-- A dispatch only moves forward, each step's facts are final, and it can only leave on a posted issue document.
CREATE OR REPLACE FUNCTION "dispatches_guard_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR ROW(NEW."id",NEW."orderId",NEW."createdById",NEW."createdAt")
    IS DISTINCT FROM ROW(OLD."id",OLD."orderId",OLD."createdById",OLD."createdAt")
    OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'dispatch identity is fixed and changes need the next version' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."status" <> OLD."status" AND NOT ((OLD."status" = 'DRAFT' AND NEW."status" = 'DISPATCHED') OR (OLD."status" = 'DISPATCHED' AND NEW."status" = 'DELIVERED')) THEN
    RAISE EXCEPTION 'a dispatch cannot move from % to %', OLD."status", NEW."status" USING ERRCODE = 'restrict_violation';
  END IF;
  IF (OLD."status" <> 'DRAFT' AND ROW(NEW."dispatchedAt",NEW."dispatchedById",NEW."issueDocumentId") IS DISTINCT FROM ROW(OLD."dispatchedAt",OLD."dispatchedById",OLD."issueDocumentId"))
    OR (OLD."status" = 'DELIVERED' AND ROW(NEW."deliveredAt",NEW."deliveredById") IS DISTINCT FROM ROW(OLD."deliveredAt",OLD."deliveredById")) THEN
    RAISE EXCEPTION 'dispatch facts are final' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."issueDocumentId" IS NOT NULL AND OLD."issueDocumentId" IS NULL AND NOT EXISTS (
    SELECT 1 FROM "stock_documents" WHERE "id" = NEW."issueDocumentId" AND "kind" = 'ISSUE' AND "status" = 'DONE'
  ) THEN
    RAISE EXCEPTION 'a dispatch needs its issue document posted' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;
