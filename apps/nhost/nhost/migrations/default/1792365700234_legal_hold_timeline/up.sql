-- Slice 10 task 1 fix round 2: a legal hold's timeline only moves forward (every writer). Once started
-- (starts_at <= now()) starts_at is immutable; ends_at may be set (NULL -> a time; a time before now() means "now",
-- never retroactive) or shortened, never extended or cleared; once ended (ends_at <= now()) both dates are frozen, so
-- an ended hold cannot be reactivated. A hold that has not started yet may be rescheduled freely.
CREATE FUNCTION itap.legal_holds_timeline() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF OLD.starts_at > now() THEN
    RETURN NEW;
  END IF;
  IF NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN
    PERFORM itap.raise_code('legal_hold_start_immutable');
  END IF;
  IF NEW.ends_at IS NOT DISTINCT FROM OLD.ends_at THEN
    RETURN NEW;
  END IF;
  IF OLD.ends_at IS NOT NULL AND OLD.ends_at <= now() THEN
    PERFORM itap.raise_code('legal_hold_ended');
  END IF;
  IF NEW.ends_at IS NULL OR (OLD.ends_at IS NOT NULL AND NEW.ends_at > OLD.ends_at) THEN
    PERFORM itap.raise_code('legal_hold_end_extension');
  END IF;
  NEW.ends_at := greatest(NEW.ends_at, now());
  RETURN NEW;
END;
$$;
CREATE TRIGGER legal_holds_timeline BEFORE UPDATE ON itap.legal_holds
  FOR EACH ROW EXECUTE FUNCTION itap.legal_holds_timeline();
