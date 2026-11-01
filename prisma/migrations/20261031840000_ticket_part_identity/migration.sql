BEGIN;

-- A legacy PART row has no trustworthy product fact. Stop for an explicit
-- evidence-backed correction instead of guessing from a description or ticket.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ticket_lines WHERE "lineType" = 'PART') THEN
    RAISE EXCEPTION 'Existing PART ticket lines require reviewed product backfill before this migration'
      USING ERRCODE = '23514', CONSTRAINT = 'ticket_lines_legacy_product_review';
  END IF;
END;
$$;

ALTER TABLE ticket_lines ADD COLUMN "productId" UUID;
ALTER TABLE ticket_lines ADD CONSTRAINT "ticket_lines_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES products(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "ticket_lines_productId_idx" ON ticket_lines("productId");
ALTER TABLE ticket_lines ADD CONSTRAINT ticket_lines_product_identity CHECK (
  ("lineType" = 'PART' AND "productId" IS NOT NULL) OR
  ("lineType" = 'LABOUR' AND "productId" IS NULL)
);

COMMIT;
