BEGIN;

-- Existing evidence must pass review before this guard becomes active. It does
-- not rewrite historical tickets or infer a missing assessment or bill.
CREATE FUNCTION service_tickets_preserve_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'ticket evidence cannot be removed'
      USING ERRCODE = '23514', CONSTRAINT = 'service_tickets_history_frozen';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'OPEN' OR NEW.version <> 1 OR
       NEW."assessmentSnapshot" IS NOT NULL OR NEW."billingSnapshot" IS NOT NULL OR
       NEW."replacementSnapshot" IS NOT NULL OR NEW."replacedUnitId" IS NOT NULL OR
       NEW."newUnitId" IS NOT NULL OR NEW."resolutionDetails" IS NOT NULL OR
       NEW."resolvedAt" IS NOT NULL OR NEW."confirmedBy" IS NOT NULL OR
       NEW."confirmationChannel" IS NOT NULL OR NEW."confirmedAt" IS NOT NULL OR
       NEW."closedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'a new ticket must begin open without saved effects'
        USING ERRCODE = '23514', CONSTRAINT = 'service_tickets_history_frozen';
    END IF;
    RETURN NEW;
  END IF;
  IF to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN RETURN NEW; END IF;

  IF OLD.status = 'CLOSED' OR
     (NEW.id, NEW."ticketNumber", NEW."customerId", NEW."unitId", NEW."jobId", NEW."faultDescription", NEW."createdAt")
       IS DISTINCT FROM
     (OLD.id, OLD."ticketNumber", OLD."customerId", OLD."unitId", OLD."jobId", OLD."faultDescription", OLD."createdAt") OR
     (OLD."assessmentSnapshot" IS NOT NULL AND NEW."assessmentSnapshot" IS DISTINCT FROM OLD."assessmentSnapshot") OR
     (OLD."billingSnapshot" IS NOT NULL AND NEW."billingSnapshot" IS DISTINCT FROM OLD."billingSnapshot") OR
     (OLD."replacementSnapshot" IS NOT NULL AND NEW."replacementSnapshot" IS DISTINCT FROM OLD."replacementSnapshot") OR
     (OLD."replacedUnitId" IS NOT NULL AND NEW."replacedUnitId" IS DISTINCT FROM OLD."replacedUnitId") OR
     (OLD."newUnitId" IS NOT NULL AND NEW."newUnitId" IS DISTINCT FROM OLD."newUnitId") OR
     (OLD."resolutionDetails" IS NOT NULL AND NEW."resolutionDetails" IS DISTINCT FROM OLD."resolutionDetails") OR
     (OLD."resolvedAt" IS NOT NULL AND NEW."resolvedAt" IS DISTINCT FROM OLD."resolvedAt") OR
     (OLD."confirmedBy" IS NOT NULL AND NEW."confirmedBy" IS DISTINCT FROM OLD."confirmedBy") OR
     (OLD."confirmationChannel" IS NOT NULL AND NEW."confirmationChannel" IS DISTINCT FROM OLD."confirmationChannel") OR
     (OLD."confirmedAt" IS NOT NULL AND NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt") OR
     (OLD."closedAt" IS NOT NULL AND NEW."closedAt" IS DISTINCT FROM OLD."closedAt") OR
     NEW.version < OLD.version OR NEW.version > OLD.version + 1 OR
     NEW."updatedAt" < OLD."updatedAt" OR
     (NEW.version = OLD.version AND (
       NEW.status <> 'IN_PROGRESS' OR
       (to_jsonb(NEW) - 'billingSnapshot' - 'replacementSnapshot' - 'replacedUnitId' - 'newUnitId' - 'updatedAt')
         IS DISTINCT FROM
       (to_jsonb(OLD) - 'billingSnapshot' - 'replacementSnapshot' - 'replacedUnitId' - 'newUnitId' - 'updatedAt')
     )) OR
     (NEW.status IS DISTINCT FROM OLD.status AND
       (NEW.version <> OLD.version + 1 OR NOT (
         (OLD.status = 'OPEN' AND NEW.status = 'ASSESSED') OR
         (OLD.status = 'ASSESSED' AND NEW.status IN ('IN_PROGRESS', 'AWAITING_CUSTOMER_CONFIRMATION')) OR
         (OLD.status = 'IN_PROGRESS' AND NEW.status = 'AWAITING_CUSTOMER_CONFIRMATION') OR
         (OLD.status = 'AWAITING_CUSTOMER_CONFIRMATION' AND NEW.status = 'CLOSED')
       ))) THEN
    RAISE EXCEPTION 'ticket identity, lifecycle or saved history cannot be rewritten'
      USING ERRCODE = '23514', CONSTRAINT = 'service_tickets_history_frozen';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER service_tickets_history_frozen BEFORE INSERT OR UPDATE OR DELETE ON service_tickets
  FOR EACH ROW EXECUTE FUNCTION service_tickets_preserve_history();
CREATE TRIGGER service_tickets_no_truncate BEFORE TRUNCATE ON service_tickets
  FOR EACH STATEMENT EXECUTE FUNCTION service_tickets_preserve_history();

COMMIT;
