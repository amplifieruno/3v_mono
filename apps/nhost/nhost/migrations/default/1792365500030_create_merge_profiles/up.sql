-- merge_profiles (spec §6.4): folds the source profile into the target. Tracked mutation with the `hasura_session`
-- argument; both ids are resolved inside the session organization only (a foreign id behaves like a missing one).
-- Moves the source's live identities (merged identities have no profile), documents and consents to the target; the
-- target keeps its primary identity and moved identities become non-primary (identities_link trigger). Open duplicate
-- candidates touching the source are closed as merged; the source becomes `inactive`. Biometric consent is re-applied
-- to the target afterwards (its latest record decides, see *_create_consent_effects). Audit row `merge`.
CREATE FUNCTION itap.merge_profiles(hasura_session json, p_target uuid, p_source uuid)
RETURNS SETOF itap.profiles
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.session_user_id(hasura_session);
  locked_count int;
  identities_moved int;
  documents_moved int;
  consents_moved int;
  result itap.profiles;
BEGIN
  IF p_target IS NULL OR p_source IS NULL THEN PERFORM itap.raise_code('profile_not_found'); END IF;
  IF p_target = p_source THEN PERFORM itap.raise_code('merge_source_is_target'); END IF;
  SELECT count(*) INTO locked_count FROM (
    SELECT id FROM itap.profiles WHERE organization_id = org AND id IN (p_target, p_source) ORDER BY id FOR UPDATE
  ) l;
  IF locked_count <> 2 THEN PERFORM itap.raise_code('profile_not_found'); END IF;

  UPDATE itap.consent_records SET profile_id = p_target WHERE organization_id = org AND profile_id = p_source;
  GET DIAGNOSTICS consents_moved = ROW_COUNT;
  UPDATE itap.profile_documents SET profile_id = p_target WHERE organization_id = org AND profile_id = p_source;
  GET DIAGNOSTICS documents_moved = ROW_COUNT;
  UPDATE itap.identities SET profile_id = p_target
  WHERE organization_id = org AND profile_id = p_source AND status <> 'merged';
  GET DIAGNOSTICS identities_moved = ROW_COUNT;

  UPDATE itap.profile_duplicate_candidates SET status = 'merged'
  WHERE organization_id = org AND status = 'open' AND (profile_a_id = p_source OR profile_b_id = p_source);
  UPDATE itap.profiles SET status = 'inactive' WHERE organization_id = org AND id = p_source;
  PERFORM itap.apply_biometric_consent(org, p_target);

  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes)
  VALUES (org, actor, 'merge', 'profiles', p_target, jsonb_build_object(
    'source_profile_id', p_source, 'identities_moved', identities_moved,
    'documents_moved', documents_moved, 'consents_moved', consents_moved
  ));
  SELECT * INTO result FROM itap.profiles WHERE organization_id = org AND id = p_target;
  RETURN NEXT result;
END;
$$;
