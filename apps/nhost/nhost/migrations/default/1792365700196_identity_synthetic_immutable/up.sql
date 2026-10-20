-- is_synthetic is fixed at insert for every writer (metadata already makes it insert-only for org_admin): flipping it
-- would move an identity and its templates between the sandbox and the production population.
CREATE FUNCTION itap.identity_synthetic_immutable() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  PERFORM itap.raise_code('identity_synthetic_immutable');
  RETURN NEW;
END;
$$;

CREATE TRIGGER identities_synthetic_immutable BEFORE UPDATE OF is_synthetic ON itap.identities
  FOR EACH ROW WHEN (OLD.is_synthetic IS DISTINCT FROM NEW.is_synthetic)
  EXECUTE FUNCTION itap.identity_synthetic_immutable();
