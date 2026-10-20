-- Synthetic identities (spec §6.3 is_synthetic, SA_6 sandbox) are a separate population: they never link to a
-- profile (so profile attributes, segments of profiles, facilities and policies never reach them) and are never
-- merged with production identities (a merge would move synthetic templates into the production population or
-- the reverse).
ALTER TABLE itap.identities
  ADD CONSTRAINT identities_synthetic_unlinked CHECK (NOT is_synthetic OR profile_id IS NULL);

CREATE FUNCTION itap.identity_merge_sources_synthetic_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM itap.identity_merges m
    JOIN itap.identities t ON t.organization_id = m.organization_id AND t.id = m.target_identity_id
    JOIN itap.identities s ON s.organization_id = NEW.organization_id AND s.id = NEW.source_identity_id
    WHERE m.organization_id = NEW.organization_id AND m.id = NEW.merge_id AND t.is_synthetic <> s.is_synthetic
  ) THEN
    PERFORM itap.raise_code('identity_synthetic_mismatch');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER identity_merge_sources_synthetic BEFORE INSERT ON itap.identity_merge_sources
  FOR EACH ROW EXECUTE FUNCTION itap.identity_merge_sources_synthetic_check();
