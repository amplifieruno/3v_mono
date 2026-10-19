-- Effects of biometric consent (spec §8.2). The LATEST biometric_processing record of a profile decides, latest by
-- (coalesce(withdrawn_at, granted_at), created_at, id): withdrawn -> every identity linked to the profile gets
-- matching_enabled = false (embeddings are kept, so a re-grant re-enables matching); granted or no record -> true.
-- Identities linked to the profile later take the same state (link trigger below).
CREATE FUNCTION itap.biometric_consent_allows(p_organization_id uuid, p_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT coalesce((
    SELECT c.status <> 'withdrawn'
    FROM itap.consent_records c
    WHERE c.organization_id = p_organization_id AND c.profile_id = p_profile_id AND c.purpose = 'biometric_processing'
    ORDER BY coalesce(c.withdrawn_at, c.granted_at) DESC, c.created_at DESC, c.id DESC
    LIMIT 1
  ), true);
$$;

-- Applies the current consent state to the identities linked to the profile (merged identities are never linked).
CREATE FUNCTION itap.apply_biometric_consent(p_organization_id uuid, p_profile_id uuid) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  -- Serialises concurrent consent changes of one profile.
  PERFORM 1 FROM itap.profiles WHERE organization_id = p_organization_id AND id = p_profile_id FOR UPDATE;
  UPDATE itap.identities
  SET matching_enabled = itap.biometric_consent_allows(p_organization_id, p_profile_id)
  WHERE organization_id = p_organization_id AND profile_id = p_profile_id
    AND matching_enabled IS DISTINCT FROM itap.biometric_consent_allows(p_organization_id, p_profile_id);
END;
$$;

CREATE FUNCTION itap.consent_records_apply() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.purpose = 'biometric_processing'
     AND (TG_OP = 'DELETE' OR NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.purpose <> OLD.purpose) THEN
    PERFORM itap.apply_biometric_consent(OLD.organization_id, OLD.profile_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.purpose = 'biometric_processing' THEN
    PERFORM itap.apply_biometric_consent(NEW.organization_id, NEW.profile_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER consent_records_apply AFTER INSERT OR UPDATE OR DELETE ON itap.consent_records
  FOR EACH ROW EXECUTE FUNCTION itap.consent_records_apply();

-- An identity linked to a profile takes the profile's consent state (a withdrawn profile never gets matching
-- back through a new link). Unlinking leaves the flag as it is.
CREATE FUNCTION itap.identities_consent_matching() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.profile_id IS NOT NULL AND NEW.status <> 'merged'
     AND (TG_OP = 'INSERT' OR NEW.profile_id IS DISTINCT FROM OLD.profile_id) THEN
    NEW.matching_enabled := itap.biometric_consent_allows(NEW.organization_id, NEW.profile_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER identities_consent_matching BEFORE INSERT OR UPDATE OF profile_id ON itap.identities
  FOR EACH ROW EXECUTE FUNCTION itap.identities_consent_matching();
