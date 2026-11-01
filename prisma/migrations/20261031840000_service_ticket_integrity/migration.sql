BEGIN;

-- Old rows are preserved without inventing source validation or intake actors.
ALTER TABLE service_tickets ADD COLUMN "sourceVerifiedAt" TIMESTAMPTZ(3),
  ADD COLUMN "createdById" UUID REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "noWorkReason" VARCHAR(4000);
CREATE INDEX "service_tickets_createdById_idx" ON service_tickets("createdById");
CREATE TABLE service_ticket_events (
  id UUID NOT NULL PRIMARY KEY,
  "ticketId" UUID NOT NULL REFERENCES service_tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "beforeSnapshot" JSONB,
  "afterSnapshot" JSONB NOT NULL,
  CONSTRAINT service_ticket_events_objects CHECK (
    ("beforeSnapshot" IS NULL OR jsonb_typeof("beforeSnapshot")='object') AND jsonb_typeof("afterSnapshot")='object')
);
CREATE INDEX "service_ticket_events_ticketId_occurredAt_idx" ON service_ticket_events("ticketId","occurredAt");
CREATE INDEX "service_ticket_events_actorId_idx" ON service_ticket_events("actorId");

CREATE FUNCTION ticket_preserve_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'violates check constraint "ticket_preserve_events": service audit evidence is append-only'
    USING ERRCODE='23514', CONSTRAINT='ticket_preserve_events';
END;
$$;
CREATE TRIGGER ticket_events_frozen BEFORE UPDATE OR DELETE ON service_ticket_events
  FOR EACH ROW EXECUTE FUNCTION ticket_preserve_events();
CREATE TRIGGER ticket_events_no_truncate BEFORE TRUNCATE ON service_ticket_events
  FOR EACH STATEMENT EXECUTE FUNCTION ticket_preserve_events();

CREATE FUNCTION ticket_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor_id UUID;
  source RECORD;
  coverage RECORD;
  expected_status TEXT;
  expected JSONB;
  complaint_date DATE;
  repair_line JSONB;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN
    RAISE EXCEPTION 'violates check constraint "ticket_guard": service evidence cannot be removed'
      USING ERRCODE='23514', CONSTRAINT='ticket_guard';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN RETURN NEW; END IF;
    IF OLD.status='CLOSED' OR
      (NEW.id,NEW."ticketNumber",NEW."customerId",NEW."jobId",NEW."unitId",NEW."faultDescription",NEW."createdAt",NEW."createdById") IS DISTINCT FROM
      (OLD.id,OLD."ticketNumber",OLD."customerId",OLD."jobId",OLD."unitId",OLD."faultDescription",OLD."createdAt",OLD."createdById") THEN
      RAISE EXCEPTION 'violates check constraint "ticket_guard": identity, complaint and closed facts cannot change'
        USING ERRCODE='23514', CONSTRAINT='ticket_guard';
    END IF;
    IF OLD."sourceVerifiedAt" IS NOT NULL AND NEW."sourceVerifiedAt" IS DISTINCT FROM OLD."sourceVerifiedAt" THEN
      RAISE EXCEPTION 'violates check constraint "ticket_guard": source verification cannot be rewritten'
        USING ERRCODE='23514', CONSTRAINT='ticket_guard';
    END IF;
    IF NEW.status<>OLD.status AND NOT (
      (OLD.status='OPEN' AND NEW.status='ASSESSED') OR
      (OLD.status='ASSESSED' AND NEW.status IN ('IN_PROGRESS','AWAITING_CUSTOMER_CONFIRMATION')) OR
      (OLD.status='IN_PROGRESS' AND NEW.status='AWAITING_CUSTOMER_CONFIRMATION') OR
      (OLD.status='AWAITING_CUSTOMER_CONFIRMATION' AND NEW.status='CLOSED')) THEN
      RAISE EXCEPTION 'violates check constraint "ticket_guard": invalid service state transition'
        USING ERRCODE='23514', CONSTRAINT='ticket_guard';
    END IF;
    IF NEW.version<>OLD.version+1 THEN
      -- Billing/replacement helpers freeze their once-only result after claiming the ticket version.
      IF NEW.version<>OLD.version OR OLD.status<>'IN_PROGRESS' OR NEW.status<>'IN_PROGRESS' OR
        (to_jsonb(NEW)-'billingSnapshot'-'replacementSnapshot'-'replacedUnitId'-'newUnitId'-'updatedAt') IS DISTINCT FROM
        (to_jsonb(OLD)-'billingSnapshot'-'replacementSnapshot'-'replacedUnitId'-'newUnitId'-'updatedAt') THEN
        RAISE EXCEPTION 'violates check constraint "ticket_guard": each service change needs a version claim'
          USING ERRCODE='23514', CONSTRAINT='ticket_guard';
      END IF;
    END IF;
    IF (OLD."billingSnapshot" IS NOT NULL AND NEW."billingSnapshot" IS DISTINCT FROM OLD."billingSnapshot") OR
      (OLD."replacementSnapshot" IS NOT NULL AND
       (NEW."replacementSnapshot",NEW."replacedUnitId",NEW."newUnitId") IS DISTINCT FROM
       (OLD."replacementSnapshot",OLD."replacedUnitId",OLD."newUnitId")) OR
      (OLD."resolvedAt" IS NOT NULL AND
       (NEW."resolvedAt",NEW."resolutionDetails",NEW."noWorkReason") IS DISTINCT FROM
       (OLD."resolvedAt",OLD."resolutionDetails",OLD."noWorkReason")) THEN
      RAISE EXCEPTION 'violates check constraint "ticket_guard": saved financial, replacement and resolution facts are frozen'
        USING ERRCODE='23514', CONSTRAINT='ticket_guard';
    END IF;
    IF NEW."assessmentSnapshot" IS DISTINCT FROM OLD."assessmentSnapshot" AND
      (OLD.status NOT IN ('OPEN','ASSESSED') OR OLD."billingSnapshot" IS NOT NULL OR OLD."replacementSnapshot" IS NOT NULL OR
       EXISTS(SELECT 1 FROM ticket_lines WHERE "ticketId"=OLD.id) OR
       EXISTS(SELECT 1 FROM invoices WHERE "sourceType"='TICKET' AND "sourceId"=OLD.id)) THEN
      RAISE EXCEPTION 'violates check constraint "ticket_guard": reassessment is allowed only before work or financial effects'
        USING ERRCODE='23514', CONSTRAINT='ticket_guard';
    END IF;
  ELSE
    IF NEW.status<>'OPEN' OR NEW.version<>1 OR NEW."assessmentSnapshot" IS NOT NULL OR NEW."billingSnapshot" IS NOT NULL OR
      NEW."replacementSnapshot" IS NOT NULL OR NEW."resolvedAt" IS NOT NULL OR NEW."noWorkReason" IS NOT NULL THEN
      RAISE EXCEPTION 'violates check constraint "ticket_guard": intake starts OPEN with no invented repair outcome'
        USING ERRCODE='23514', CONSTRAINT='ticket_guard';
    END IF;
  END IF;
  actor_id:=nullif(current_setting('sunshine.actor_id',true),'')::uuid;
  IF actor_id IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=actor_id AND active AND role IN ('ADMIN','SUPPORT')) THEN
    RAISE EXCEPTION 'violates check constraint "ticket_guard": service writes require a verified staff actor'
      USING ERRCODE='23514', CONSTRAINT='ticket_guard';
  END IF;
  IF TG_OP='INSERT' THEN NEW."createdById":=actor_id; END IF;
  SELECT u."rawSerial",q."policyStatus",q."warrantyPolicySnapshot",d."deliveredAt" INTO source
    FROM units u JOIN allocations a ON a."unitId"=u.id AND a."jobId"=NEW."jobId" AND a.status IN ('DELIVERED','INSTALLED')
    JOIN jobs j ON j.id=a."jobId" JOIN orders o ON o.id=j."orderId" AND o."jobId"=j.id AND o."customerId"=NEW."customerId"
    JOIN enquiries e ON e.id=o."enquiryId" AND e."customerId"=o."customerId"
    JOIN quotes sq ON sq.id=o."quoteId" AND sq."customerId"=o."customerId" AND sq."enquiryId"=o."enquiryId"
    JOIN quote_lines q ON q.id=a."quoteLineId" AND q."quoteId"=sq.id AND q."productId"=u."productId"
    JOIN dispatches d ON d."orderId"=o.id AND d.status='DELIVERED' AND d."deliveredAt" IS NOT NULL
    WHERE u.id=NEW."unitId" AND a."productId"=u."productId" AND a.quantity=1 AND u.status IN ('DELIVERED','INSTALLED');
  IF NOT FOUND OR NEW."createdAt"<source."deliveredAt" OR NEW."createdAt">clock_timestamp() THEN
    RAISE EXCEPTION 'violates check constraint "ticket_guard": unit, customer, job and complaint occurrence need delivered-source review'
      USING ERRCODE='23514', CONSTRAINT='ticket_guard';
  END IF;
  IF TG_OP='INSERT' OR NEW."sourceVerifiedAt" IS NULL THEN NEW."sourceVerifiedAt":=clock_timestamp(); END IF;
  IF TG_OP='INSERT' OR OLD."sourceVerifiedAt" IS NULL OR NEW."assessmentSnapshot" IS DISTINCT FROM OLD."assessmentSnapshot" THEN
    IF NEW."assessmentSnapshot" IS NOT NULL THEN
      complaint_date:=(NEW."createdAt" AT TIME ZONE 'Asia/Kolkata')::date;
      SELECT * INTO coverage FROM warranties WHERE "unitId"=NEW."unitId";
      IF FOUND THEN
        expected_status:=CASE WHEN NOT coverage.active OR EXISTS(SELECT 1 FROM units WHERE "replacesUnitId"=NEW."unitId") THEN 'VOID'
          WHEN complaint_date<coverage."startDate" THEN 'NOT_STARTED' WHEN complaint_date>=coverage."expiryDate" THEN 'EXPIRED'
          WHEN upper(btrim(NEW."assessmentSnapshot"->>'requestedScope'))<>upper(btrim(coverage.scope)) THEN 'OUT_OF_SCOPE' ELSE 'COVERED' END;
        expected:=jsonb_build_object('policyName',coverage."policyName",'policyRevision',coverage."policyRevision",'scope',coverage.scope,
          'startDate',coverage."startDate"::text,'expiryDate',coverage."expiryDate"::text);
        IF source."policyStatus"<>'CONFIGURED' OR NOT (source."warrantyPolicySnapshot" @> jsonb_build_object(
          'policyName',coverage."policyName",'revision',coverage."policyRevision",'scope',coverage.scope,'durationMonths',coverage."durationMonths")) OR
          coverage."startDate"<>(source."deliveredAt" AT TIME ZONE 'Asia/Kolkata')::date THEN
          RAISE EXCEPTION 'violates check constraint "ticket_guard": frozen warranty source needs review'
            USING ERRCODE='23514', CONSTRAINT='ticket_guard';
        END IF;
      ELSE
        expected_status:='NO_WARRANTY';
        expected:=jsonb_build_object('policyName',NULL,'policyRevision',NULL,'scope',NULL,'startDate',NULL,'expiryDate',NULL);
        IF source."policyStatus"='CONFIGURED' THEN
          RAISE EXCEPTION 'violates check constraint "ticket_guard": promised warranty is missing'
            USING ERRCODE='23514', CONSTRAINT='ticket_guard';
        END IF;
      END IF;
      expected:=expected||jsonb_build_object('unitId',NEW."unitId"::text,'serial',btrim(source."rawSerial"),'asOfDate',complaint_date::text,
        'coverageStatus',expected_status,'isCovered',expected_status='COVERED',
        'customerCharge',CASE WHEN expected_status='COVERED' THEN '0.00' ELSE NULL END,
        'chargeStatus',CASE WHEN expected_status='COVERED' THEN 'FREE' ELSE 'PENDING_ASSESSMENT' END);
      IF NOT (NEW."assessmentSnapshot" @> expected) OR coalesce(length(btrim(NEW."assessmentSnapshot"->>'reason')),0)=0 OR
        coalesce(length(btrim(NEW."assessmentSnapshot"->>'requestedScope')),0)=0 OR
        NEW."assessmentSnapshot"->>'assessedAt' IS NULL OR
        (NEW."assessmentSnapshot"->>'assessedAt')::timestamptz<NEW."createdAt" OR
        (NEW."assessmentSnapshot"->>'assessedAt')::timestamptz>clock_timestamp() THEN
        RAISE EXCEPTION 'violates check constraint "ticket_guard": assessment must preserve the actual intake occurrence and frozen policy'
          USING ERRCODE='23514', CONSTRAINT='ticket_guard';
      END IF;
    END IF;
  END IF;
  IF NEW.status IN ('AWAITING_CUSTOMER_CONFIRMATION','CLOSED') THEN
    IF NEW."billingSnapshot" IS NULL THEN
      IF coalesce(length(btrim(NEW."noWorkReason")),0)<5 OR EXISTS(SELECT 1 FROM ticket_lines WHERE "ticketId"=NEW.id) OR
        NEW."replacementSnapshot" IS NOT NULL OR EXISTS(SELECT 1 FROM invoices WHERE "sourceType"='TICKET' AND "sourceId"=NEW.id) THEN
        RAISE EXCEPTION 'violates check constraint "ticket_guard": finalize actual repair billing or record a legitimate no-work resolution'
          USING ERRCODE='23514', CONSTRAINT='ticket_guard';
      END IF;
    ELSIF NEW."noWorkReason" IS NOT NULL OR NOT (NEW."billingSnapshot"->'result' @> jsonb_build_object(
      'ticketId',NEW.id::text,'jobId',NEW."jobId"::text,'customerId',NEW."customerId"::text)) THEN
      RAISE EXCEPTION 'violates check constraint "ticket_guard": finalized billing source does not match this service ticket'
        USING ERRCODE='23514', CONSTRAINT='ticket_guard';
    END IF;
  END IF;
  IF NEW."billingSnapshot" IS NOT NULL THEN
    IF NOT (NEW."billingSnapshot"->'result' @> jsonb_build_object('ticketId',NEW.id::text,'jobId',NEW."jobId"::text,'customerId',NEW."customerId"::text)) OR
      jsonb_typeof(NEW."billingSnapshot"->'result'->'lines') IS DISTINCT FROM 'array' OR
      jsonb_array_length(NEW."billingSnapshot"->'result'->'lines')=0 OR
      jsonb_array_length(NEW."billingSnapshot"->'result'->'lines')<>(SELECT count(*) FROM ticket_lines WHERE "ticketId"=NEW.id) THEN
      RAISE EXCEPTION 'violates check constraint "ticket_guard": finalized billing needs all actual repair lines'
        USING ERRCODE='23514', CONSTRAINT='ticket_guard';
    END IF;
    FOR repair_line IN SELECT value FROM jsonb_array_elements(NEW."billingSnapshot"->'result'->'lines') LOOP
      IF NOT EXISTS(SELECT 1 FROM cost_entries c WHERE c."jobId"=NEW."jobId" AND
        c."costType"=CASE WHEN repair_line->>'type'='PART' THEN 'REPAIR_PARTS'::"CostType" ELSE 'SERVICE_LABOUR'::"CostType" END AND
        c."uniqueSourceId"=CASE WHEN repair_line->>'type'='PART' THEN 'STOCK_MOVEMENT:' ELSE 'TIME_ENTRY:' END||(repair_line->>'sourceId') AND
        c.amount=(repair_line->>'totalCost')::numeric AND c."reversalOfId" IS NULL AND
        NOT EXISTS(SELECT 1 FROM cost_entries reversal WHERE reversal."reversalOfId"=c.id)) THEN
        RAISE EXCEPTION 'violates check constraint "ticket_guard": repair cost is missing or reversed'
          USING ERRCODE='23514', CONSTRAINT='ticket_guard';
      END IF;
    END LOOP;
    IF (NEW."billingSnapshot"->'result'->>'internalCost')::numeric IS DISTINCT FROM
      (SELECT sum((value->>'totalCost')::numeric) FROM jsonb_array_elements(NEW."billingSnapshot"->'result'->'lines')) OR
      (NEW."billingSnapshot"->'result'->>'customerCharge')::numeric IS DISTINCT FROM
      (SELECT sum((value->>'totalPrice')::numeric) FROM jsonb_array_elements(NEW."billingSnapshot"->'result'->'lines')) OR
      (SELECT sum("totalCost") FROM ticket_lines WHERE "ticketId"=NEW.id) IS DISTINCT FROM
      (NEW."billingSnapshot"->'result'->>'internalCost')::numeric THEN
      RAISE EXCEPTION 'violates check constraint "ticket_guard": finalized repair amounts do not reconcile'
        USING ERRCODE='23514', CONSTRAINT='ticket_guard';
    END IF;
    IF (NEW."assessmentSnapshot"->>'isCovered')::boolean THEN
      IF (NEW."billingSnapshot"->'result'->>'customerCharge')::numeric<>0 OR
        NEW."billingSnapshot"->'result'->>'invoiceId' IS NOT NULL OR EXISTS(SELECT 1 FROM invoices WHERE "sourceType"='TICKET' AND "sourceId"=NEW.id) THEN
        RAISE EXCEPTION 'violates check constraint "ticket_guard": covered repairs have actual costs and no customer invoice'
          USING ERRCODE='23514', CONSTRAINT='ticket_guard';
      END IF;
    ELSIF NOT EXISTS(SELECT 1 FROM invoices WHERE id=(NEW."billingSnapshot"->'result'->>'invoiceId')::uuid AND
      "sourceType"='TICKET' AND "sourceId"=NEW.id AND kind='REPAIR' AND "customerId"=NEW."customerId" AND
      total=(NEW."billingSnapshot"->'result'->>'customerCharge')::numeric) THEN
      RAISE EXCEPTION 'violates check constraint "ticket_guard": chargeable repair needs its actual matching invoice'
        USING ERRCODE='23514', CONSTRAINT='ticket_guard';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER service_tickets_guarded BEFORE INSERT OR UPDATE OR DELETE ON service_tickets
  FOR EACH ROW EXECUTE FUNCTION ticket_guard();
CREATE TRIGGER service_tickets_no_truncate BEFORE TRUNCATE ON service_tickets
  FOR EACH STATEMENT EXECUTE FUNCTION ticket_guard();

CREATE FUNCTION ticket_record_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND to_jsonb(OLD) IS NOT DISTINCT FROM to_jsonb(NEW) THEN RETURN NEW; END IF;
  -- A transaction may start before a different command but acquire its ticket lock later.
  -- Timestamp the actual event, not transaction start, so audit history follows saved decisions.
  INSERT INTO service_ticket_events(id,"ticketId","actorId","occurredAt","beforeSnapshot","afterSnapshot")
    VALUES(gen_random_uuid(),NEW.id,current_setting('sunshine.actor_id')::uuid,clock_timestamp(),
      CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
  RETURN NEW;
END;
$$;
CREATE TRIGGER service_tickets_audited AFTER INSERT OR UPDATE ON service_tickets
  FOR EACH ROW EXECUTE FUNCTION ticket_record_event();

CREATE FUNCTION ticket_lines_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent RECORD;
BEGIN
  IF TG_OP='TRUNCATE' THEN
    RAISE EXCEPTION 'violates check constraint "ticket_lines_guard": repair line history cannot be truncated'
      USING ERRCODE='23514', CONSTRAINT='ticket_lines_guard';
  END IF;
  SELECT status,"billingSnapshot","sourceVerifiedAt" INTO parent FROM service_tickets
    WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD."ticketId" ELSE NEW."ticketId" END FOR NO KEY UPDATE;
  IF NOT FOUND OR parent.status NOT IN ('ASSESSED','IN_PROGRESS') OR parent."billingSnapshot" IS NOT NULL OR parent."sourceVerifiedAt" IS NULL THEN
    RAISE EXCEPTION 'violates check constraint "ticket_lines_guard": work lines need an assessed verified unresolved ticket'
      USING ERRCODE='23514', CONSTRAINT='ticket_lines_guard';
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    RAISE EXCEPTION 'violates check constraint "ticket_lines_guard": saved work lines cannot change or be removed'
      USING ERRCODE='23514', CONSTRAINT='ticket_lines_guard';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ticket_lines_guarded BEFORE INSERT OR UPDATE OR DELETE ON ticket_lines
  FOR EACH ROW EXECUTE FUNCTION ticket_lines_guard();
CREATE TRIGGER ticket_lines_no_truncate BEFORE TRUNCATE ON ticket_lines
  FOR EACH STATEMENT EXECUTE FUNCTION ticket_lines_guard();

COMMIT;
