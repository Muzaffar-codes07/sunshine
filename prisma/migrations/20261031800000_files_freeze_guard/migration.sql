BEGIN;

-- A persisted upload is evidence. Metadata never changes; an unbound upload may acquire its one record association.
CREATE FUNCTION files_preserve_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'violates check constraint "files_evidence_frozen": persisted evidence cannot be removed'
      USING ERRCODE = '23514', CONSTRAINT = 'files_evidence_frozen';
  END IF;
  IF (to_jsonb(NEW) - 'contextType' - 'contextId') IS DISTINCT FROM
     (to_jsonb(OLD) - 'contextType' - 'contextId') THEN
    RAISE EXCEPTION 'violates check constraint "files_evidence_frozen": persisted metadata cannot be changed'
      USING ERRCODE = '23514', CONSTRAINT = 'files_evidence_frozen';
  END IF;
  IF OLD."contextType" IS NOT NULL AND
     (NEW."contextType", NEW."contextId") IS DISTINCT FROM (OLD."contextType", OLD."contextId") THEN
    RAISE EXCEPTION 'violates check constraint "files_evidence_frozen": evidence cannot move to another record'
      USING ERRCODE = '23514', CONSTRAINT = 'files_evidence_frozen';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER files_evidence_frozen BEFORE UPDATE OR DELETE ON files
  FOR EACH ROW EXECUTE FUNCTION files_preserve_evidence();
CREATE TRIGGER files_no_truncate BEFORE TRUNCATE ON files
  FOR EACH STATEMENT EXECUTE FUNCTION files_preserve_evidence();

COMMIT;
