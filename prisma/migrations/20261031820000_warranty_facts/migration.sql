BEGIN;

-- Validate existing data; fail for review rather than quietly rewriting cover already sold.
ALTER TABLE warranties ADD CONSTRAINT warranties_calendar_interval CHECK (
  "durationMonths" BETWEEN 1 AND 1200 AND
  "startDate" >= DATE '0001-01-01' AND "expiryDate" <= DATE '9999-12-31' AND
  "expiryDate" = ("startDate" + make_interval(months => "durationMonths"))::date
);

CREATE FUNCTION warranties_preserve_facts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'warranty evidence cannot be removed'
      USING ERRCODE = '23514', CONSTRAINT = 'warranties_facts_frozen';
  END IF;
  IF to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - 'active' - 'version' - 'updatedAt') IS DISTINCT FROM
     (to_jsonb(OLD) - 'active' - 'version' - 'updatedAt') OR
     NOT (OLD.active AND NOT NEW.active AND NEW.version = OLD.version + 1) THEN
    RAISE EXCEPTION 'saved warranty facts cannot change; only a versioned void is allowed'
      USING ERRCODE = '23514', CONSTRAINT = 'warranties_facts_frozen';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER warranties_facts_frozen BEFORE UPDATE OR DELETE ON warranties
  FOR EACH ROW EXECUTE FUNCTION warranties_preserve_facts();
CREATE TRIGGER warranties_no_truncate BEFORE TRUNCATE ON warranties
  FOR EACH STATEMENT EXECUTE FUNCTION warranties_preserve_facts();

COMMIT;
