-- New photos/embeddings only for identities that may hold biometrics (spec §8.2, §6.3): an identity with
-- matching disabled (biometric consent withdrawn) or a merged identity (frozen) rejects inserts. Merge/rollback/split
-- move existing rows with UPDATE and are unaffected; the `itap.merge_context` flag bypasses the guard anyway.
CREATE FUNCTION itap.identity_biometrics_insert_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  identity_status text;
  identity_matching boolean;
BEGIN
  IF current_setting('itap.merge_context', true) = 'on' THEN
    RETURN NEW;
  END IF;
  SELECT status, matching_enabled INTO identity_status, identity_matching
  FROM itap.identities WHERE organization_id = NEW.organization_id AND id = NEW.identity_id;
  IF identity_status = 'merged' THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'identity_merged_frozen';
  END IF;
  IF identity_matching = false THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'identity_matching_disabled';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER identity_photos_insert_guard BEFORE INSERT ON itap.identity_photos
  FOR EACH ROW EXECUTE FUNCTION itap.identity_biometrics_insert_guard();
CREATE TRIGGER identity_embeddings_insert_guard BEFORE INSERT ON itap.identity_embeddings
  FOR EACH ROW EXECUTE FUNCTION itap.identity_biometrics_insert_guard();
