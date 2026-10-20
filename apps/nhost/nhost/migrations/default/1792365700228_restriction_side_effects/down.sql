-- Previous definition (1792365700220_profiles_processing_restriction).
DROP TRIGGER segment_members_restricted ON itap.segment_members;
DROP FUNCTION itap.segment_members_restricted();
CREATE OR REPLACE FUNCTION itap.apply_processing_restriction(p_org uuid, p_profile uuid, p_restricted boolean, p_reason text, p_actor uuid)
 RETURNS itap.profiles
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  prof itap.profiles;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF p_restricted IS NULL THEN
    PERFORM itap.raise_code('processing_restriction_state_required');
  END IF;
  SELECT * INTO prof FROM itap.profiles p WHERE p.organization_id = p_org AND p.id = p_profile FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('profile_not_found');
  END IF;
  IF reason IS NULL THEN
    PERFORM itap.raise_code('processing_restriction_reason_required');
  END IF;
  IF prof.processing_restricted = p_restricted THEN
    RETURN prof;
  END IF;
  PERFORM set_config('itap.restriction_context', 'on', true);
  UPDATE itap.profiles p SET
    processing_restricted = p_restricted,
    restricted_at = CASE WHEN p_restricted THEN now() END,
    restricted_by = CASE WHEN p_restricted THEN p_actor END,
    restriction_reason = CASE WHEN p_restricted THEN reason END
  WHERE p.organization_id = p_org AND p.id = p_profile
  RETURNING * INTO prof;
  PERFORM set_config('itap.restriction_context', 'off', true);
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (p_org, p_actor, CASE WHEN p_restricted THEN 'restrict' ELSE 'unrestrict' END, 'profiles', p_profile,
          jsonb_build_object('processing_restricted', p_restricted), reason);
  RETURN prof;
END;
$function$

;
