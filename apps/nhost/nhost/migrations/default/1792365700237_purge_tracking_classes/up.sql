-- Slice 10 task 2: candidate and purge functions of the tracking / event classes. Every purge function has the same
-- contract (admin-only, not tracked): itap.purge_<class>(org, cutoff, facility, subject profile, subject identity,
-- limit, action) -> (affected, skipped_by_hold, files_enqueued). One call = one batch: the legal hold snapshot is taken
-- once (itap.retention_scope), at most p_limit unheld candidates are deleted / anonymized under itap.retention_context,
-- skipped_by_hold = held candidates in scope (all of them, not only this batch). affected = 0 means drained.

-- Held candidates in scope and up to p_limit unheld candidate ids of the scope's class.
CREATE FUNCTION itap.retention_pick(s itap.retention_scope, p_limit integer, OUT held integer, OUT ids uuid[])
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    PERFORM itap.raise_code('retention_limit_invalid');
  END IF;
  EXECUTE format(
    'WITH c AS MATERIALIZED (SELECT * FROM itap.%I($1))
     SELECT (SELECT count(*) FROM c WHERE c.held)::int, ARRAY(SELECT c.id FROM c WHERE NOT c.held LIMIT $2)',
    'retention_candidates_' || s.data_class)
  INTO held, ids USING s, p_limit;
END;
$$;

-- Planner: candidates (unheld) and held rows of the scope's class.
CREATE FUNCTION itap.retention_count(s itap.retention_scope, OUT candidates bigint, OUT held bigint)
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
BEGIN
  EXECUTE format('SELECT count(*) FILTER (WHERE NOT c.held), count(*) FILTER (WHERE c.held) FROM itap.%I($1) c',
    'retention_candidates_' || s.data_class)
  INTO candidates, held USING s;
END;
$$;

-- detections: anonymize = no identity, thumbnail, box or similarity (time, place, device, confidence kept).
CREATE FUNCTION itap.retention_candidates_detections(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT d.id, itap.retention_held(s, d.identity_id, NULL, d.facility_id)
  FROM itap.detections d
  WHERE d.organization_id = (s).organization_id AND d.detected_at < (s).cutoff
    AND itap.retention_in_facility(s, d.facility_id) AND itap.retention_subject(s, d.identity_id, NULL)
    AND ((s).action = 'delete' OR d.identity_id IS NOT NULL OR d.thumbnail_file_id IS NOT NULL OR d.bbox IS NOT NULL
         OR d.similarity IS NOT NULL);
$$;

CREATE FUNCTION itap.purge_detections(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('detections', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  v_files uuid[];
  n integer;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  v_files := ARRAY(SELECT d.thumbnail_file_id FROM itap.detections d
                   WHERE d.organization_id = p_org AND d.id = ANY (v_ids) AND d.thumbnail_file_id IS NOT NULL);
  IF p_action = 'delete' THEN
    DELETE FROM itap.detections d WHERE d.organization_id = p_org AND d.id = ANY (v_ids);
  ELSE
    UPDATE itap.detections d SET identity_id = NULL, thumbnail_file_id = NULL, bbox = NULL, similarity = NULL
    WHERE d.organization_id = p_org AND d.id = ANY (v_ids);
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT n, v_held, itap.enqueue_unused_files(p_org, v_files, 'retention:detections');
  PERFORM itap.retention_end(prev);
END;
$$;

-- locations (identity_locations): delete only.
CREATE FUNCTION itap.retention_candidates_locations(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT l.id, itap.retention_held(s, l.identity_id, NULL, l.facility_id)
  FROM itap.identity_locations l
  WHERE l.organization_id = (s).organization_id AND l.occurred_at < (s).cutoff
    AND itap.retention_in_facility(s, l.facility_id) AND itap.retention_subject(s, l.identity_id, NULL);
$$;

CREATE FUNCTION itap.purge_locations(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('locations', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  n integer;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  DELETE FROM itap.identity_locations l WHERE l.organization_id = p_org AND l.id = ANY (v_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT n, v_held, 0;
  PERFORM itap.retention_end(prev);
END;
$$;

-- sessions: closed tracking sessions by end time; anonymize = no identity, profile or visit (durations, areas kept).
-- Locations keep their row (session_id SET NULL); open sessions are never touched.
CREATE FUNCTION itap.retention_candidates_sessions(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT t.id, itap.retention_held(s, t.identity_id, t.profile_id, t.facility_id)
  FROM itap.tracking_sessions t
  WHERE t.organization_id = (s).organization_id AND t.status <> 'active' AND t.ended_at < (s).cutoff
    AND itap.retention_in_facility(s, t.facility_id) AND itap.retention_subject(s, t.identity_id, t.profile_id)
    AND ((s).action = 'delete' OR t.identity_id IS NOT NULL OR t.profile_id IS NOT NULL OR t.visit_id IS NOT NULL);
$$;

CREATE FUNCTION itap.purge_sessions(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
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
$$;

-- Payload keys naming a person (stripped by events anonymization).
CREATE FUNCTION itap.event_personal_keys() RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['claimed_identity_id', 'matched_identity_id', 'confidence', 'session_id', 'reviewed_by', 'started_by',
    'ended_by', 'grant_id', 'profile_status', 'profile_type', 'clearance', 'people'];
$$;

-- events: events linked to an incident stay with it until the incident is purged (then the link is gone). Held: the
-- person / facility, or a link to a held incident. anonymize = no person / log links, personal payload keys stripped.
CREATE FUNCTION itap.retention_candidates_events(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT e.id,
         itap.retention_held(s, e.identity_id, e.profile_id, e.facility_id)
           OR EXISTS (SELECT 1 FROM itap.incident_events ie WHERE ie.organization_id = e.organization_id
                      AND ie.event_id = e.id AND ie.incident_id = ANY ((s).held_incidents))
  FROM itap.events e
  WHERE e.organization_id = (s).organization_id AND e.occurred_at < (s).cutoff
    AND itap.retention_in_facility(s, e.facility_id) AND itap.retention_subject(s, e.identity_id, e.profile_id)
    AND NOT EXISTS (SELECT 1 FROM itap.incident_events ie WHERE ie.organization_id = e.organization_id
                    AND ie.event_id = e.id AND NOT (ie.incident_id = ANY ((s).held_incidents)))
    AND ((s).action = 'delete' OR NOT (e.payload ? 'anonymized'));
$$;

CREATE FUNCTION itap.purge_events(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
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
$$;

-- Whether an event (log link, may be gone) concerns a held person / facility.
CREATE FUNCTION itap.retention_event_held(s itap.retention_scope, p_event uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT p_event IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.events e WHERE e.organization_id = (s).organization_id AND e.id = p_event
      AND itap.retention_held(s, e.identity_id, e.profile_id, e.facility_id));
$$;

CREATE FUNCTION itap.retention_event_subject(s itap.retention_scope, p_event uuid) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT (s).subject_identities IS NULL OR (p_event IS NOT NULL AND EXISTS (
    SELECT 1 FROM itap.events e WHERE e.organization_id = (s).organization_id AND e.id = p_event
      AND itap.retention_subject(s, e.identity_id, e.profile_id)));
$$;

-- deliveries: finished notification deliveries (in-flight pending / retrying never) and inbox rows. A digest is a
-- candidate only when none of its sources is newer than the cutoff, and held when one of them is held; a digest in a
-- batch takes its sources along (the self FK digested_into is NO ACTION).
CREATE FUNCTION itap.retention_candidates_deliveries(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT d.id, coalesce(d.incident_id = ANY ((s).held_incidents), false) OR itap.retention_event_held(s, d.event_id)
           OR EXISTS (SELECT 1 FROM itap.notification_deliveries x WHERE x.organization_id = d.organization_id
                      AND x.digested_into = d.id
                      AND (coalesce(x.incident_id = ANY ((s).held_incidents), false) OR itap.retention_event_held(s, x.event_id)))
  FROM itap.notification_deliveries d
  WHERE d.organization_id = (s).organization_id AND d.created_at < (s).cutoff
    AND d.status NOT IN ('pending', 'retrying') AND itap.retention_event_subject(s, d.event_id)
    AND NOT EXISTS (SELECT 1 FROM itap.notification_deliveries x WHERE x.organization_id = d.organization_id
                    AND x.digested_into = d.id AND x.created_at >= (s).cutoff)
  UNION ALL
  SELECT u.id, coalesce(u.incident_id = ANY ((s).held_incidents), false) OR itap.retention_event_held(s, u.event_id)
  FROM itap.user_notifications u
  WHERE u.organization_id = (s).organization_id AND u.created_at < (s).cutoff
    AND itap.retention_event_subject(s, u.event_id);
$$;

CREATE FUNCTION itap.purge_deliveries(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('deliveries', p_org, p_cutoff, p_facility, p_subject_profile,
    p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  n integer;
  m integer;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  -- A digest in the batch brings its (unheld candidate) sources along: the self FK is NO ACTION.
  v_ids := v_ids || ARRAY(
    SELECT c.id FROM itap.retention_candidates_deliveries(s) c
    JOIN itap.notification_deliveries x ON x.organization_id = p_org AND x.id = c.id
    WHERE NOT c.held AND x.digested_into = ANY (v_ids) AND NOT (c.id = ANY (v_ids)));
  DELETE FROM itap.user_notifications u WHERE u.organization_id = p_org AND u.id = ANY (v_ids);
  GET DIAGNOSTICS m = ROW_COUNT;
  -- A digest whose sources are not all gone (a held source) stays.
  DELETE FROM itap.notification_deliveries d
  WHERE d.organization_id = p_org AND d.id = ANY (v_ids)
    AND NOT EXISTS (SELECT 1 FROM itap.notification_deliveries x WHERE x.organization_id = p_org
                    AND x.digested_into = d.id AND NOT (x.id = ANY (v_ids)));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT n + m, v_held, 0;
  PERFORM itap.retention_end(prev);
END;
$$;

-- webhook_deliveries: finished webhook deliveries (pending / retrying never).
CREATE FUNCTION itap.retention_candidates_webhook_deliveries(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT w.id, itap.retention_event_held(s, w.event_id)
  FROM itap.webhook_deliveries w
  WHERE w.organization_id = (s).organization_id AND w.created_at < (s).cutoff
    AND w.status NOT IN ('pending', 'retrying') AND itap.retention_event_subject(s, w.event_id);
$$;

CREATE FUNCTION itap.purge_webhook_deliveries(p_org uuid, p_cutoff timestamptz, p_facility uuid,
  p_subject_profile uuid, p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
#variable_conflict use_column
DECLARE
  s itap.retention_scope := itap.retention_scope('webhook_deliveries', p_org, p_cutoff, p_facility,
    p_subject_profile, p_subject_identity, p_action, now());
  prev text := itap.retention_begin();
  v_held integer;
  v_ids uuid[];
  n integer;
BEGIN
  SELECT x.held, x.ids INTO v_held, v_ids FROM itap.retention_pick(s, p_limit) x;
  DELETE FROM itap.webhook_deliveries w WHERE w.organization_id = p_org AND w.id = ANY (v_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT n, v_held, 0;
  PERFORM itap.retention_end(prev);
END;
$$;

-- incidents: resolved / closed incidents by resolution time, with notes (+ files), activities, identities, event
-- links and handover links (CASCADE); targets of ended holds go with them. Kept: incidents with a report (NO ACTION;
-- the reports class removes reports first) and targets of holds that have not ended. Held: the incident, its
-- facility, or a held identity among its subjects. anonymize = title / description / resolution / external ref
-- cleared, notes (+ files) and identity links removed, activity details emptied (codes, times, severity kept).
CREATE FUNCTION itap.retention_candidates_incidents(s itap.retention_scope) RETURNS TABLE (id uuid, held boolean)
LANGUAGE sql STABLE
AS $$
  SELECT i.id,
         i.id = ANY ((s).held_incidents) OR coalesce(i.facility_id = ANY ((s).held_facilities), false)
           OR EXISTS (SELECT 1 FROM itap.incident_identities ii WHERE ii.organization_id = i.organization_id
                      AND ii.incident_id = i.id AND ii.identity_id = ANY ((s).held_identities))
  FROM itap.incidents i
  WHERE i.organization_id = (s).organization_id AND i.status IN ('resolved', 'closed')
    AND coalesce(i.resolved_at, i.updated_at) < (s).cutoff
    AND itap.retention_in_facility(s, i.facility_id)
    AND ((s).subject_identities IS NULL OR EXISTS (
      SELECT 1 FROM itap.incident_identities ii WHERE ii.organization_id = i.organization_id AND ii.incident_id = i.id
        AND ii.identity_id = ANY ((s).subject_identities)))
    AND NOT EXISTS (SELECT 1 FROM itap.reports r WHERE r.organization_id = i.organization_id AND r.incident_id = i.id)
    AND (i.id = ANY ((s).held_incidents) OR NOT itap.retention_open_hold_target(i.organization_id, NULL, i.id))
    AND ((s).action = 'delete' OR i.title <> '[anonymized]');
$$;

CREATE FUNCTION itap.purge_incidents(p_org uuid, p_cutoff timestamptz, p_facility uuid, p_subject_profile uuid,
  p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
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
$$;
