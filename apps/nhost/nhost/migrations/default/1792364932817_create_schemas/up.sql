CREATE SCHEMA itap;
CREATE SCHEMA itap_results;

-- Maintains updated_at on every mutable itap table.
CREATE FUNCTION itap.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
