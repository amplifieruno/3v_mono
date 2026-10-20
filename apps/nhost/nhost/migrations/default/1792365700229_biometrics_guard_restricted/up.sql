-- Slice 10 task 1 fix round 1: identity_embeddings / identity_photos inserts (enrollment, add photos, templates,
-- camera captures) refuse identities of a restricted profile (profile_processing_restricted). From the latest
-- definition (1792365500031); additive.
CREATE OR REPLACE FUNCTION itap.identity_biometrics_insert_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  identity_status text;
  identity_matching boolean;
BEGIN
  -- Restriction of processing (slice 10): no new face data for an identity of a restricted profile, merges included
  -- (only the restriction context, e.g. the DSR job, may write).
  IF current_setting('itap.restriction_context', true) IS DISTINCT FROM 'on' AND EXISTS (
    SELECT 1 FROM itap.identities i
    JOIN itap.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
    WHERE i.organization_id = NEW.organization_id AND i.id = NEW.identity_id AND p.processing_restricted
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'profile_processing_restricted';
  END IF;
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
$function$
;
