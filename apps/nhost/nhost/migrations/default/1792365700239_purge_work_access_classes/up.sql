-- Slice 10 task 2: purge functions of the search / bulk / report, access and log classes (contract: migration 237).

-- search_history: finished search requests (results CASCADE, image files queued); a saved search's current baseline
-- (last_search_request_id) is kept. Held: a result naming a held person.
CREATE FUNCTION itap.retention_candidates_search_history(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT q.id, EXISTS (SELECT 1 FROM itap.search_results r WHERE r.organization_id = q.organization_id
                       AND r.search_request_id = q.id AND itap.retention_held(s, r.identity_id, r.profile_id, NULL))
  FROM itap.search_requests q
  WHERE q.organization_id = (s).organization_id AND q.created_at < (s).cutoff AND q.status IN ('completed', 'failed')
    AND NOT EXISTS (SELECT 1 FROM itap.saved_searches ss WHERE ss.organization_id = q.organization_id
                    AND ss.last_search_request_id = q.id)
    AND ((s).subject_identities IS NULL OR EXISTS (
      SELECT 1 FROM itap.search_results r WHERE r.organization_id = q.organization_id AND r.search_request_id = q.id
        AND itap.retention_subject(s, r.identity_id, r.profile_id)));
$$;

CREATE FUNCTION itap.purge_search_history(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('search_history', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  v_files uuid[];
  n integer;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  v_files := ARRAY(SELECT q.image_file_id FROM itap.search_requests q
                   WHERE q.organization_id = p_org AND q.id = ANY (v_ids) AND q.image_file_id IS NOT NULL);
  DELETE FROM itap.search_requests q WHERE q.organization_id = p_org AND q.id = ANY (v_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT n, v_held, itap.enqueue_unused_files(p_org, v_files, 'retention:search_history');
  PERFORM itap.retention_end(prev);
END;
$$;

-- bulk_jobs: finished jobs by completion. delete = job, rows, its search requests (+ images), input / result / tagged
-- files; archive = the job row stays (counters, errors), rows and search requests deleted, files queued.
CREATE FUNCTION itap.retention_candidates_bulk_jobs(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT j.id, EXISTS (SELECT 1 FROM itap.bulk_job_rows r WHERE r.organization_id = j.organization_id
                       AND r.bulk_job_id = j.id AND itap.retention_held(s, r.identity_id, r.profile_id, NULL))
  FROM itap.bulk_jobs j
  WHERE j.organization_id = (s).organization_id AND j.status IN ('completed', 'partial', 'failed', 'cancelled')
    AND coalesce(j.completed_at, j.updated_at) < (s).cutoff
    AND ((s).subject_identities IS NULL OR EXISTS (
      SELECT 1 FROM itap.bulk_job_rows r WHERE r.organization_id = j.organization_id AND r.bulk_job_id = j.id
        AND itap.retention_subject(s, r.identity_id, r.profile_id)))
    AND ((s).action = 'delete' OR j.input_file_id IS NOT NULL OR j.result_file_id IS NOT NULL
         OR EXISTS (SELECT 1 FROM itap.bulk_job_rows r WHERE r.organization_id = j.organization_id AND r.bulk_job_id = j.id)
         OR EXISTS (SELECT 1 FROM itap.search_requests q WHERE q.organization_id = j.organization_id AND q.bulk_job_id = j.id));
$$;

CREATE FUNCTION itap.purge_bulk_jobs(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
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
$$;

-- reports: completed / failed / expired reports by generation (else creation) time. delete = report (metrics,
-- targets CASCADE; deliveries keep their row), archive = status expired, file and metrics removed. Files: the
-- attached one and any tagged metadata.report_id. Reports name no person: a subject call matches none.
CREATE FUNCTION itap.retention_candidates_reports(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT r.id, coalesce(r.incident_id = ANY ((s).held_incidents), false)
           OR EXISTS (SELECT 1 FROM itap.report_facilities rf WHERE rf.organization_id = r.organization_id
                      AND rf.report_id = r.id AND rf.facility_id = ANY ((s).held_facilities))
  FROM itap.reports r
  WHERE r.organization_id = (s).organization_id AND r.status IN ('completed', 'failed', 'expired')
    AND coalesce(r.generated_at, r.created_at) < (s).cutoff AND (s).subject_identities IS NULL
    AND ((s).action = 'delete' OR r.status <> 'expired' OR r.file_id IS NOT NULL
         OR EXISTS (SELECT 1 FROM itap.report_metrics m WHERE m.organization_id = r.organization_id AND m.report_id = r.id));
$$;

CREATE FUNCTION itap.purge_reports(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
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
$$;

-- access_decisions: decisions by decision time; anonymize = no person, no grant (it names the person), the trace's
-- person section removed. FK order (summary-08): decisions first, then (org-wide delete calls) the configuration only
-- decisions referenced: used / revoked / expired grants and ended emergency overrides (+ areas) older than the cutoff
-- that no remaining decision references (no epoch bump: nothing narrows).
CREATE FUNCTION itap.retention_candidates_access_decisions(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT d.id, itap.retention_held(s, d.identity_id, d.profile_id, d.facility_id)
  FROM itap.access_decisions d
  WHERE d.organization_id = (s).organization_id AND d.decided_at < (s).cutoff
    AND itap.retention_in_facility(s, d.facility_id) AND itap.retention_subject(s, d.identity_id, d.profile_id)
    AND ((s).action = 'delete' OR NOT (d.signals ? 'anonymized'));
$$;

CREATE FUNCTION itap.purge_access_decisions(p_org uuid, p_cutoff timestamptz, p_facility uuid,
  p_subject_profile uuid, p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
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
$$;

-- terminal_syncs: terminal sync log rows by time; org-wide calls also drop urgent epochs older than the cutoff that
-- every policy terminal has synced past (terminal_sync_status only reads epochs above a terminal's synced epoch).
CREATE FUNCTION itap.retention_candidates_terminal_syncs(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT t.id, itap.retention_held(s, NULL, NULL, t.facility_id)
  FROM itap.terminal_policy_syncs t
  WHERE t.organization_id = (s).organization_id AND t.created_at < (s).cutoff
    AND itap.retention_in_facility(s, t.facility_id) AND (s).subject_identities IS NULL;
$$;

CREATE FUNCTION itap.purge_terminal_syncs(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('terminal_syncs', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  v_min_synced bigint;
  n integer;
  m integer := 0;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  DELETE FROM itap.terminal_policy_syncs t WHERE t.organization_id = p_org AND t.id = ANY (v_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF p_facility IS NULL AND p_subject_profile IS NULL AND p_subject_identity IS NULL THEN
    SELECT min(coalesce(d.policy_version_synced, -1)) INTO v_min_synced
    FROM itap.policy_terminals(p_org) t JOIN itap.devices d ON d.organization_id = p_org AND d.id = t.device_id;
    DELETE FROM itap.policy_urgent_epochs e
    WHERE e.organization_id = p_org AND e.created_at < p_cutoff
      AND (v_min_synced IS NULL OR e.epoch <= v_min_synced);
    GET DIAGNOSTICS m = ROW_COUNT;
  END IF;
  RETURN QUERY SELECT n + m, v_held, 0;
  PERFORM itap.retention_end(prev);
END;
$$;

-- stats: aggregated buckets (hourly, daily, transitions; segment daily stats only org-wide) older than the cutoff
-- (daily buckets: day before the cutoff's UTC date). Snapshots (activity stats) are not history and stay.
CREATE FUNCTION itap.retention_candidates_stats(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT h.id, itap.retention_held(s, NULL, NULL, h.facility_id) FROM itap.area_hourly_stats h
  WHERE h.organization_id = (s).organization_id AND h.hour < (s).cutoff AND itap.retention_in_facility(s, h.facility_id)
    AND (s).subject_identities IS NULL
  UNION ALL
  SELECT f.id, itap.retention_held(s, NULL, NULL, f.facility_id) FROM itap.facility_daily_stats f
  WHERE f.organization_id = (s).organization_id AND f.day < ((s).cutoff AT TIME ZONE 'UTC')::date
    AND itap.retention_in_facility(s, f.facility_id) AND (s).subject_identities IS NULL
  UNION ALL
  SELECT t.id, itap.retention_held(s, NULL, NULL, t.facility_id) FROM itap.area_transitions_daily t
  WHERE t.organization_id = (s).organization_id AND t.day < ((s).cutoff AT TIME ZONE 'UTC')::date
    AND itap.retention_in_facility(s, t.facility_id) AND (s).subject_identities IS NULL
  UNION ALL
  SELECT g.id, false FROM itap.segment_daily_stats g
  WHERE g.organization_id = (s).organization_id AND g.day < ((s).cutoff AT TIME ZONE 'UTC')::date
    AND (s).facility_id IS NULL AND (s).subject_identities IS NULL;
$$;

CREATE FUNCTION itap.purge_stats(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('stats', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  n integer;
  total integer := 0;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  DELETE FROM itap.area_hourly_stats h WHERE h.organization_id = p_org AND h.id = ANY (v_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;
  DELETE FROM itap.facility_daily_stats f WHERE f.organization_id = p_org AND f.id = ANY (v_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;
  DELETE FROM itap.area_transitions_daily t WHERE t.organization_id = p_org AND t.id = ANY (v_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  total := total + n;
  DELETE FROM itap.segment_daily_stats g WHERE g.organization_id = p_org AND g.id = ANY (v_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT total + n, v_held, 0;
  PERFORM itap.retention_end(prev);
END;
$$;

-- audit: audit rows by time (floor 365 days for org-wide calls). Held: rows about a held identity / profile /
-- incident / facility. anonymize = actor, network and diff removed (action, entity, entity id, time kept).
CREATE FUNCTION itap.retention_candidates_audit(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT a.id, (a.entity = 'identities' AND a.entity_id = ANY ((s).held_identities))
            OR (a.entity = 'profiles' AND a.entity_id = ANY ((s).held_profiles))
            OR (a.entity = 'incidents' AND a.entity_id = ANY ((s).held_incidents))
            OR (a.entity = 'facilities' AND a.entity_id = ANY ((s).held_facilities))
  FROM itap.audit_log a
  WHERE a.organization_id = (s).organization_id AND a.occurred_at < (s).cutoff
    AND ((s).subject_identities IS NULL
         OR (a.entity = 'identities' AND a.entity_id = ANY ((s).subject_identities))
         OR (a.entity = 'profiles' AND a.entity_id = ANY ((s).subject_profiles)))
    AND ((s).action = 'delete' OR a.changes IS DISTINCT FROM '{"anonymized": true}'::jsonb);
$$;

CREATE FUNCTION itap.purge_audit(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('audit', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  n integer;
BEGIN
  IF p_subject_profile IS NULL AND p_subject_identity IS NULL
     AND p_cutoff > now() - make_interval(days => itap.retention_min_days('audit')) THEN
    PERFORM itap.raise_code('retention_floor');
  END IF;
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  IF p_action = 'delete' THEN
    DELETE FROM itap.audit_log a WHERE a.organization_id = p_org AND a.id = ANY (v_ids);
  ELSE
    UPDATE itap.audit_log a SET user_id = NULL, ip = NULL, user_agent = NULL, changes = '{"anonymized": true}'::jsonb
    WHERE a.organization_id = p_org AND a.id = ANY (v_ids);
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT n, v_held, 0;
  PERFORM itap.retention_end(prev);
END;
$$;
