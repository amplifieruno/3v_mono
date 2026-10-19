-- event_rules.updated_at tracks configuration edits only: the Stage B rule counters (trigger_count,
-- last_triggered_at, written by itap.bump_rule_counters on every triggering event) do not touch it, as the audit
-- trigger already ignores them.
--
-- itap.set_updated_at_except('<col>', ...): BEFORE UPDATE variant of itap.set_updated_at that sets updated_at only
-- when a column other than the listed ones (and updated_at and stored generated columns, which are not computed yet
-- in a BEFORE trigger's NEW) changed. A trigger WHEN clause cannot do this: it may not reference the whole NEW row of
-- a table with generated columns (`code`).
CREATE FUNCTION itap.set_updated_at_except() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  ignored text[] := TG_ARGV::text[] || ARRAY['updated_at'] || ARRAY(
    SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid = TG_RELID AND a.attgenerated <> '' AND a.attnum > 0
  );
BEGIN
  IF (to_jsonb(OLD) - ignored) IS DISTINCT FROM (to_jsonb(NEW) - ignored) THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER event_rules_set_updated_at ON itap.event_rules;
CREATE TRIGGER event_rules_set_updated_at BEFORE UPDATE ON itap.event_rules
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at_except('trigger_count', 'last_triggered_at');
