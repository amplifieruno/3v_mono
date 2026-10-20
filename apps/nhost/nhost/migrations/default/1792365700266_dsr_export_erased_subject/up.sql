-- Slice 10 final wave (I-1, erasure fence for access / portability bundles): an access / portability DSR whose bundle
-- was built before an erasure of the same person committed must not attach a zip naming them. complete_dsr_export
-- locks the subject profile FOR SHARE (dsr_erase holds it FOR UPDATE until it commits, so a completion racing an
-- erasure waits for it and then sees erased_at); an erased subject finishes the request as rejected with reason
-- subject_erased, attaches no file and queues the uploaded zip (when it is this request's upload) for deletion.
CREATE OR REPLACE FUNCTION itap.complete_dsr_export(p_request uuid, p_attempt integer, p_file uuid, p_summary jsonb)
RETURNS SETOF itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.data_subject_requests := itap.dsr_fenced(p_request, p_attempt, ARRAY['access', 'portability']);
  erased timestamptz;
BEGIN
  IF r.id IS NULL THEN
    RETURN;
  END IF;
  SELECT p.erased_at INTO erased FROM itap.profiles p
  WHERE p.organization_id = r.organization_id AND p.id = r.profile_id FOR SHARE;
  IF erased IS NOT NULL THEN
    UPDATE itap.data_subject_requests
    SET status = 'rejected', rejection_reason = 'subject_erased', completed_at = now(), lease_expires_at = NULL
    WHERE id = r.id RETURNING * INTO r;
    PERFORM itap.enqueue_unused_files(r.organization_id, ARRAY(
      SELECT f.id FROM storage.files f
      WHERE f.id = p_file AND f.bucket_id = r.organization_id::text AND f.metadata ->> 'dsr_id' = r.id::text), 'dsr:subject_erased');
    PERFORM itap.dsr_step(r, 'rejected', jsonb_build_object('reason', 'subject_erased'));
    RETURN NEXT r;
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
$$;
