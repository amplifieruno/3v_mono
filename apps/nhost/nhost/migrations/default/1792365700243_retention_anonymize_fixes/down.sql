-- Restores the task 2 definitions.
CREATE OR REPLACE FUNCTION itap.purge_events(p_org uuid, p_cutoff timestamp with time zone, p_facility uuid, p_subject_profile uuid, p_subject_identity uuid, p_limit integer, p_action text)
 RETURNS TABLE(affected integer, skipped_by_hold integer, files_enqueued integer)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('events', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  n integer;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  IF p_action = 'delete' THEN
    DELETE FROM itap.events e WHERE e.organization_id = p_org AND e.id = ANY (v_ids);
  ELSE
    UPDATE itap.events e
    SET identity_id = NULL, profile_id = NULL, detection_id = NULL, session_id = NULL, access_decision_id = NULL,
        authentication_attempt_id = NULL,
        payload = (e.payload - itap.event_personal_keys()) || '{"anonymized": true}'::jsonb
    WHERE e.organization_id = p_org AND e.id = ANY (v_ids);
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT n, v_held, 0;
  PERFORM itap.retention_end(prev);
END;
$function$

;
CREATE OR REPLACE FUNCTION itap.purge_incidents(p_org uuid, p_cutoff timestamp with time zone, p_facility uuid, p_subject_profile uuid, p_subject_identity uuid, p_limit integer, p_action text)
 RETURNS TABLE(affected integer, skipped_by_hold integer, files_enqueued integer)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('incidents', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  v_files uuid[];
  n integer;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  v_files := ARRAY(SELECT f.file_id FROM itap.incident_note_files f
                   JOIN itap.incident_notes nt ON nt.organization_id = f.organization_id AND nt.id = f.note_id
                   WHERE f.organization_id = p_org AND nt.incident_id = ANY (v_ids));
  IF p_action = 'delete' THEN
    DELETE FROM itap.legal_hold_targets t WHERE t.organization_id = p_org AND t.incident_id = ANY (v_ids);
    DELETE FROM itap.incidents i WHERE i.organization_id = p_org AND i.id = ANY (v_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSE
    DELETE FROM itap.incident_notes nt WHERE nt.organization_id = p_org AND nt.incident_id = ANY (v_ids);
    DELETE FROM itap.incident_identities ii WHERE ii.organization_id = p_org AND ii.incident_id = ANY (v_ids);
    UPDATE itap.incident_activities a SET details = '{}'::jsonb
    WHERE a.organization_id = p_org AND a.incident_id = ANY (v_ids) AND a.details <> '{}'::jsonb;
    UPDATE itap.incidents i SET title = '[anonymized]', description = NULL, resolution = NULL, external_ref = NULL
    WHERE i.organization_id = p_org AND i.id = ANY (v_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  RETURN QUERY SELECT n, v_held, itap.enqueue_unused_files(p_org, v_files, 'retention:incidents');
  PERFORM itap.retention_end(prev);
END;
$function$

;
CREATE OR REPLACE FUNCTION itap.purge_sessions(p_org uuid, p_cutoff timestamp with time zone, p_facility uuid, p_subject_profile uuid, p_subject_identity uuid, p_limit integer, p_action text)
 RETURNS TABLE(affected integer, skipped_by_hold integer, files_enqueued integer)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('sessions', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  n integer;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  IF p_action = 'delete' THEN
    DELETE FROM itap.tracking_sessions t WHERE t.organization_id = p_org AND t.id = ANY (v_ids);
  ELSE
    UPDATE itap.tracking_sessions t SET identity_id = NULL, profile_id = NULL, visit_id = NULL
    WHERE t.organization_id = p_org AND t.id = ANY (v_ids);
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT n, v_held, 0;
  PERFORM itap.retention_end(prev);
END;
$function$

;
CREATE OR REPLACE FUNCTION itap.event_personal_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT ARRAY['claimed_identity_id', 'matched_identity_id', 'confidence', 'session_id', 'reviewed_by', 'started_by',
    'ended_by', 'grant_id', 'profile_status', 'profile_type', 'clearance', 'people'];
$function$

;
CREATE OR REPLACE FUNCTION itap.retention_class_order(p_class text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT array_position(ARRAY[
    'access_decisions', 'auth_evidence', 'auth_attempts', 'deliveries', 'webhook_deliveries', 'incidents', 'events',
    'detections', 'locations', 'sessions', 'search_history', 'bulk_jobs', 'reports', 'terminal_syncs', 'stats',
    'photos', 'embeddings_withdrawn', 'unknown_identities', 'audit'], p_class);
$function$

;
CREATE OR REPLACE FUNCTION itap.policy_epoch_on_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  old_effect text;
  new_effect text;
  new_max_risk numeric;
BEGIN
  IF TG_TABLE_NAME = 'access_policies' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.current_version_id IS NOT NULL THEN
        SELECT effect INTO old_effect FROM itap.access_policy_versions
        WHERE organization_id = OLD.organization_id AND id = OLD.current_version_id;
        PERFORM itap.bump_policy_epoch(OLD.organization_id, old_effect IS DISTINCT FROM 'deny');
      END IF;
      RETURN OLD;
    END IF;
    IF NEW.current_version_id IS DISTINCT FROM OLD.current_version_id THEN
      SELECT effect INTO old_effect FROM itap.access_policy_versions
      WHERE organization_id = OLD.organization_id AND id = OLD.current_version_id;
      SELECT effect, max_risk INTO new_effect, new_max_risk FROM itap.access_policy_versions
      WHERE organization_id = NEW.organization_id AND id = NEW.current_version_id;
      PERFORM itap.bump_policy_epoch(
        NEW.organization_id,
        new_effect IS NOT DISTINCT FROM 'deny' OR old_effect IS NOT DISTINCT FROM 'allow'
          OR (new_effect IS NOT DISTINCT FROM 'allow' AND new_max_risk IS NOT NULL)
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'access_grants' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, false);
    ELSIF TG_OP = 'DELETE' THEN
      IF NOT itap.retention_context() THEN
        PERFORM itap.bump_policy_epoch(OLD.organization_id, true);
      END IF;
      RETURN OLD;
    ELSIF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, true);
    END IF;
  ELSIF TG_TABLE_NAME = 'emergency_overrides' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, true);
    ELSIF TG_OP = 'UPDATE' AND NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
      PERFORM itap.bump_policy_epoch(NEW.organization_id, true);
    END IF;
  ELSIF TG_TABLE_NAME = 'access_points' THEN
    PERFORM itap.bump_policy_epoch(NEW.organization_id, false);
  END IF;
  RETURN NULL;
END;
$function$

;
CREATE OR REPLACE FUNCTION itap.purge_access_decisions(p_org uuid, p_cutoff timestamp with time zone, p_facility uuid, p_subject_profile uuid, p_subject_identity uuid, p_limit integer, p_action text)
 RETURNS TABLE(affected integer, skipped_by_hold integer, files_enqueued integer)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('access_decisions', p_org, p_cutoff, p_facility,
    p_subject_profile, p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  n integer;
  total integer := 0;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  IF p_action = 'delete' THEN
    DELETE FROM itap.access_decisions d WHERE d.organization_id = p_org AND d.id = ANY (v_ids);
    GET DIAGNOSTICS total = ROW_COUNT;
    IF p_facility IS NULL AND p_subject_profile IS NULL AND p_subject_identity IS NULL THEN
      DELETE FROM itap.access_grants g
      WHERE g.id IN (
        SELECT g2.id FROM itap.access_grants g2
        WHERE g2.organization_id = p_org
          AND (g2.used_at IS NOT NULL OR g2.revoked_at IS NOT NULL OR g2.valid_until <= now())
          AND greatest(g2.used_at, g2.revoked_at, g2.valid_until) < p_cutoff
          AND NOT (g2.profile_id = ANY (s.held_profiles))
          AND NOT EXISTS (SELECT 1 FROM itap.access_decisions d WHERE d.organization_id = p_org AND d.grant_id = g2.id)
        LIMIT p_limit);
      GET DIAGNOSTICS n = ROW_COUNT;
      total := total + n;
      DELETE FROM itap.emergency_overrides o
      WHERE o.id IN (
        SELECT o2.id FROM itap.emergency_overrides o2
        WHERE o2.organization_id = p_org AND o2.ended_at < p_cutoff
          AND NOT (o2.facility_id = ANY (s.held_facilities))
          AND NOT EXISTS (SELECT 1 FROM itap.access_decisions d WHERE d.organization_id = p_org AND d.override_id = o2.id)
        LIMIT p_limit);
      GET DIAGNOSTICS n = ROW_COUNT;
      total := total + n;
    END IF;
  ELSE
    UPDATE itap.access_decisions d
    SET identity_id = NULL, profile_id = NULL, grant_id = NULL,
        signals = (d.signals - 'person') || '{"anonymized": true}'::jsonb
    WHERE d.organization_id = p_org AND d.id = ANY (v_ids);
    GET DIAGNOSTICS total = ROW_COUNT;
  END IF;
  RETURN QUERY SELECT total, v_held, 0;
  PERFORM itap.retention_end(prev);
END;
$function$

;
CREATE OR REPLACE FUNCTION itap.purge_reports(p_org uuid, p_cutoff timestamp with time zone, p_facility uuid, p_subject_profile uuid, p_subject_identity uuid, p_limit integer, p_action text)
 RETURNS TABLE(affected integer, skipped_by_hold integer, files_enqueued integer)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('reports', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  v_files uuid[];
  n integer;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  v_files := ARRAY(SELECT r.file_id FROM itap.reports r WHERE r.organization_id = p_org AND r.id = ANY (v_ids)
                     AND r.file_id IS NOT NULL) || itap.tagged_files(p_org, 'report_id', v_ids);
  IF p_action = 'delete' THEN
    DELETE FROM itap.reports r WHERE r.organization_id = p_org AND r.id = ANY (v_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSE
    DELETE FROM itap.report_metrics m WHERE m.organization_id = p_org AND m.report_id = ANY (v_ids);
    UPDATE itap.reports r SET status = 'expired', file_id = NULL
    WHERE r.organization_id = p_org AND r.id = ANY (v_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  RETURN QUERY SELECT n, v_held, itap.enqueue_unused_files(p_org, v_files, 'retention:reports');
  PERFORM itap.retention_end(prev);
END;
$function$

;
CREATE OR REPLACE FUNCTION itap.purge_bulk_jobs(p_org uuid, p_cutoff timestamp with time zone, p_facility uuid, p_subject_profile uuid, p_subject_identity uuid, p_limit integer, p_action text)
 RETURNS TABLE(affected integer, skipped_by_hold integer, files_enqueued integer)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('bulk_jobs', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  v_files uuid[];
  n integer;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  v_files := ARRAY(
    SELECT j.input_file_id FROM itap.bulk_jobs j WHERE j.organization_id = p_org AND j.id = ANY (v_ids)
    UNION SELECT j.result_file_id FROM itap.bulk_jobs j WHERE j.organization_id = p_org AND j.id = ANY (v_ids)
    UNION SELECT q.image_file_id FROM itap.search_requests q WHERE q.organization_id = p_org AND q.bulk_job_id = ANY (v_ids)
  ) || itap.tagged_files(p_org, 'bulk_job_id', v_ids);
  DELETE FROM itap.search_requests q WHERE q.organization_id = p_org AND q.bulk_job_id = ANY (v_ids);
  IF p_action = 'delete' THEN
    DELETE FROM itap.bulk_jobs j WHERE j.organization_id = p_org AND j.id = ANY (v_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  ELSE
    DELETE FROM itap.bulk_job_rows r WHERE r.organization_id = p_org AND r.bulk_job_id = ANY (v_ids);
    UPDATE itap.bulk_jobs j SET input_file_id = NULL, result_file_id = NULL
    WHERE j.organization_id = p_org AND j.id = ANY (v_ids);
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  RETURN QUERY SELECT n, v_held, itap.enqueue_unused_files(p_org, v_files, 'retention:bulk_jobs');
  PERFORM itap.retention_end(prev);
END;
$function$

;
