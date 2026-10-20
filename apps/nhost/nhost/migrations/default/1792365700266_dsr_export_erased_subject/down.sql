-- Restores complete_dsr_export without the erased-subject check (migration 249).
CREATE OR REPLACE FUNCTION itap.complete_dsr_export(p_request uuid, p_attempt integer, p_file uuid, p_summary jsonb)
 RETURNS SETOF itap.data_subject_requests
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  r itap.data_subject_requests := itap.dsr_fenced(p_request, p_attempt, ARRAY['access', 'portability']);
BEGIN
  IF r.id IS NULL THEN
    RETURN;
  END IF;
  UPDATE itap.data_subject_requests
  SET export_file_id = p_file, status = 'completed', completed_at = now(), lease_expires_at = NULL
  WHERE id = r.id RETURNING * INTO r;
  PERFORM itap.dsr_step(r, 'export_uploaded', jsonb_build_object('file_id', p_file) || coalesce(p_summary, '{}'::jsonb));
  PERFORM itap.dsr_step(r, 'completed');
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes)
  VALUES (r.organization_id, r.requested_by, 'export', 'profiles', r.profile_id,
          jsonb_build_object('request_id', r.id, 'code', r.code, 'request_type', r.request_type, 'file_id', p_file));
  RETURN NEXT r;
END;
$function$

;
