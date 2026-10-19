-- Status `merged` and sources `merge`/`split` belong to the merge/rollback/split functions: a merged identity has a
-- merge record (identity_merge_sources) that rollback relies on. Direct writes (GraphQL, run_sql) are rejected unless
-- the transaction-local flag `itap.merge_context` is 'on' (set by those functions and reset before they return).
CREATE FUNCTION itap.identities_reserved_values() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF current_setting('itap.merge_context', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF (NEW.status = 'merged') IS DISTINCT FROM (TG_OP = 'UPDATE' AND OLD.status = 'merged') THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'identity_status_reserved:merged';
  END IF;
  IF NEW.source IN ('merge', 'split') AND (TG_OP = 'INSERT' OR NEW.source IS DISTINCT FROM OLD.source) THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'identity_source_reserved:' || NEW.source;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER identities_reserved_values BEFORE INSERT OR UPDATE OF status, source ON itap.identities
  FOR EACH ROW EXECUTE FUNCTION itap.identities_reserved_values();
