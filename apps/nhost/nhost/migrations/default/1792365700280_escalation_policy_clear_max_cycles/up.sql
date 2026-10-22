-- A policy that does not repeat has no number of passes: max_cycles is cleared whenever repeat is false (it was
-- already ignored then, itap.next_escalation_step). The console offers "Passes at most" only while the policy
-- repeats and writes only the fields it shows, so switching Repeat off would otherwise leave a stale value behind.
CREATE FUNCTION itap.escalation_policies_clear_max_cycles() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT NEW.repeat THEN
    NEW.max_cycles := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER escalation_policies_clear_max_cycles BEFORE INSERT OR UPDATE OF repeat, max_cycles ON itap.escalation_policies
  FOR EACH ROW EXECUTE FUNCTION itap.escalation_policies_clear_max_cycles();

UPDATE itap.escalation_policies SET max_cycles = NULL WHERE NOT repeat AND max_cycles IS NOT NULL;
