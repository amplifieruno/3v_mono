-- Slice 10 task 3: DSR erasure (GDPR Art. 17), one transaction per job attempt (itap.dsr_erase, fenced):
--  1. restriction first (apply_processing_restriction, reason dsr:<code>): processing stops, links freeze, open
--     sessions / manual memberships close; open sessions of every identity of the person's graph close too;
--  2. every data class through the retention purge functions with the subject filter and no cutoff
--     (purge_class(class, org, 'infinity', NULL, profile, NULL, ...): delete, bulk jobs archive) — personal data goes
--     even where the organization's policy would keep it; legal holds are honoured by the purges;
--  3. what the classes keep by design: events linked to an incident are anonymized, the person is unlinked from
--     incidents (free text redacted), notifications / inbox / webhooks naming them, memberships, stats, consents,
--     documents, visits, grants, draft policy subjects, subscriptions, duplicates, search results, auth sessions,
--     earlier DSR bundles, attendance reports (archived), free text naming them (shift handovers, visits, requests);
--  4. biometrics of every identity (templates, centroid, photos; files queued) and the identities themselves unless a
--     retained (held) row still references them (merge history and ended-hold targets go with them);
--  5. the profile becomes a tombstone (names 'Erased subject' / its code, contacts, custom fields, notes, avatar,
--     employment cleared; inactive; erased_at) kept for audit / FK integrity, restricted for good;
--  6. audit rows about the person written before the request are redacted (changes {"anonymized": true}); DSR audit
--     rows (restrict / export / erase / rectify / reject) stay; finished Hasura trigger deliveries naming them go.
-- Under an active legal hold the held data stays (Art. 17(3)(e)): the request completes with partial = true and a
-- `retained` step naming the categories and the holds; a hold on the person itself retains everything but the
-- restriction. All writes run under itap.retention_context (guards bypassed, audit rows redacted).

-- Text patterns of the person: ids, full name, contacts, employee / external ids (>= 4 characters).
CREATE FUNCTION itap.dsr_terms(p itap.profiles, p_ids uuid[]) RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT coalesce(array_agg(DISTINCT t), '{}') FROM unnest(
    ARRAY[p.id::text] || coalesce(p_ids::text[], '{}')
    || CASE WHEN p.erased_at IS NULL THEN ARRAY[p.first_name || ' ' || p.last_name, p.last_name || ', ' || p.first_name,
                                                p.email, p.phone, p.employee_id, p.external_id]
            ELSE '{}'::text[] END) t
  WHERE t IS NOT NULL AND length(btrim(t)) >= 4;
$$;

CREATE FUNCTION itap.dsr_like_patterns(p_terms text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT coalesce(array_agg('%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%'), '{}')
  FROM unnest(p_terms) t;
$$;

-- Replaces every term (case-insensitive, literal) by [erased].
CREATE FUNCTION itap.dsr_redact_text(p_text text, p_terms text[]) RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  t text;
  v text := p_text;
BEGIN
  IF v IS NULL THEN
    RETURN NULL;
  END IF;
  FOREACH t IN ARRAY coalesce(p_terms, '{}') LOOP
    v := regexp_replace(v, regexp_replace(t, '([!$()*+.:<=>?[\\\]^{|}-])', '\\\1', 'g'), '[erased]', 'gi');
  END LOOP;
  RETURN v;
END;
$$;

-- Drops the top-level keys of an object whose key or value mentions a pattern (a non-object mentioning one -> {}).
CREATE FUNCTION itap.dsr_strip_json(p jsonb, p_patterns text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    WHEN jsonb_typeof(p) = 'object' THEN coalesce(
      (SELECT jsonb_object_agg(x.k, x.v) FROM jsonb_each(p) AS x (k, v)
       WHERE NOT (x.v::text ILIKE ANY (p_patterns)) AND NOT (x.k ILIKE ANY (p_patterns))), '{}'::jsonb)
    WHEN p::text ILIKE ANY (p_patterns) THEN '{}'::jsonb
    ELSE p
  END;
$$;

-- Step 3: leftovers of the data classes. s = the events scope of the subject (holds snapshot).
CREATE FUNCTION itap.dsr_erase_leftovers(r itap.data_subject_requests, s itap.retention_scope, p_ids uuid[],
  p_terms text[], p_patterns text[]) RETURNS uuid[]
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := r.organization_id;
  prof uuid := r.profile_id;
  free uuid[] := ARRAY(SELECT unnest(p_ids) EXCEPT SELECT unnest(s.held_identities));
  files uuid[] := '{}';
  reports uuid[];
BEGIN
  -- Events kept with their incident: anonymized like the events class does (the timeline stays).
  UPDATE itap.events e
  SET identity_id = NULL, profile_id = NULL, detection_id = NULL, session_id = NULL, access_decision_id = NULL,
      authentication_attempt_id = NULL,
      payload = itap.dsr_strip_json(e.payload - itap.event_personal_keys() - 'decisions', p_patterns) || '{"anonymized": true}'::jsonb
  WHERE e.organization_id = org
    AND (e.identity_id = ANY (p_ids) OR e.profile_id = prof OR e.payload::text ILIKE ANY (p_patterns))
    AND NOT itap.retention_event_row_held(s, e);

  -- Incidents: the person is unlinked, free text naming them redacted (held incidents / facilities untouched).
  DELETE FROM itap.incident_identities ii
  USING itap.incidents i
  WHERE ii.organization_id = org AND ii.identity_id = ANY (free) AND i.organization_id = org AND i.id = ii.incident_id
    AND NOT (i.id = ANY (s.held_incidents)) AND NOT coalesce(i.facility_id = ANY (s.held_facilities), false);
  UPDATE itap.incidents i
  SET title = itap.dsr_redact_text(i.title, p_terms), description = itap.dsr_redact_text(i.description, p_terms),
      resolution = itap.dsr_redact_text(i.resolution, p_terms), external_ref = itap.dsr_redact_text(i.external_ref, p_terms)
  WHERE i.organization_id = org AND NOT (i.id = ANY (s.held_incidents)) AND NOT coalesce(i.facility_id = ANY (s.held_facilities), false)
    AND concat_ws(' ', i.title, i.description, i.resolution, i.external_ref) ILIKE ANY (p_patterns);
  UPDATE itap.incident_notes n SET body = itap.dsr_redact_text(n.body, p_terms)
  FROM itap.incidents i
  WHERE n.organization_id = org AND n.body ILIKE ANY (p_patterns) AND i.organization_id = org AND i.id = n.incident_id
    AND NOT (i.id = ANY (s.held_incidents)) AND NOT coalesce(i.facility_id = ANY (s.held_facilities), false);
  UPDATE itap.incident_activities a SET details = itap.dsr_strip_json(a.details, p_patterns)
  FROM itap.incidents i
  WHERE a.organization_id = org AND a.details::text ILIKE ANY (p_patterns) AND i.organization_id = org AND i.id = a.incident_id
    AND NOT (i.id = ANY (s.held_incidents)) AND NOT coalesce(i.facility_id = ANY (s.held_facilities), false);

  -- Notifications naming the person in any state (in-flight ones too; senders tolerate vanished rows).
  DELETE FROM itap.user_notifications u
  WHERE u.organization_id = org AND concat_ws(' ', u.title, u.body) ILIKE ANY (p_patterns)
    AND NOT coalesce(u.incident_id = ANY (s.held_incidents), false) AND NOT itap.retention_event_held(s, u.event_id);
  DELETE FROM itap.notification_deliveries d
  WHERE d.organization_id = org AND d.content::text ILIKE ANY (p_patterns)
    AND NOT coalesce(d.incident_id = ANY (s.held_incidents), false) AND NOT itap.retention_event_held(s, d.event_id)
    AND NOT EXISTS (SELECT 1 FROM itap.notification_deliveries x WHERE x.organization_id = org AND x.digested_into = d.id);
  DELETE FROM itap.webhook_deliveries w
  WHERE w.organization_id = org AND w.body::text ILIKE ANY (p_patterns) AND NOT itap.retention_event_held(s, w.event_id);

  -- Memberships, stats, pairs, subscriptions, search results, auth sessions of the (unheld) person.
  DELETE FROM itap.watch_list_entries x WHERE x.organization_id = org AND (x.identity_id = ANY (free) OR x.profile_id = prof);
  DELETE FROM itap.segment_members m WHERE m.organization_id = org AND (m.identity_id = ANY (free) OR m.profile_id = prof);
  DELETE FROM itap.identity_activity_stats x WHERE x.organization_id = org AND x.identity_id = ANY (free);
  DELETE FROM itap.profile_activity_stats x WHERE x.organization_id = org AND x.profile_id = prof;
  DELETE FROM itap.notification_subscriptions x WHERE x.organization_id = org AND (x.identity_id = ANY (free) OR x.profile_id = prof);
  DELETE FROM itap.profile_duplicate_candidates x WHERE x.organization_id = org AND prof IN (x.profile_a_id, x.profile_b_id);
  DELETE FROM itap.search_results x WHERE x.organization_id = org AND (x.identity_id = ANY (free) OR x.profile_id = prof);
  DELETE FROM itap.authentication_sessions x WHERE x.organization_id = org AND x.claimed_identity_id = ANY (free);

  -- Access: grants no retained decision uses, subjects of draft policy versions (published ones are frozen and
  -- keep pointing at the tombstone).
  DELETE FROM itap.access_grants g WHERE g.organization_id = org AND g.profile_id = prof
    AND NOT EXISTS (SELECT 1 FROM itap.access_decisions d WHERE d.organization_id = org AND d.grant_id = g.id);
  DELETE FROM itap.access_policy_version_subjects x
  USING itap.access_policy_versions v
  WHERE x.organization_id = org AND x.profile_id = prof AND v.organization_id = org AND v.id = x.version_id AND v.status = 'draft';

  -- Visits: theirs go, hosted ones lose the host; free text naming them redacted.
  DELETE FROM itap.visits v WHERE v.organization_id = org AND v.visitor_profile_id = prof;
  UPDATE itap.visits v SET host_profile_id = CASE WHEN v.host_profile_id = prof THEN NULL ELSE v.host_profile_id END,
    purpose = itap.dsr_redact_text(v.purpose, p_terms), cancellation_reason = itap.dsr_redact_text(v.cancellation_reason, p_terms)
  WHERE v.organization_id = org AND (v.host_profile_id = prof OR concat_ws(' ', v.purpose, v.cancellation_reason) ILIKE ANY (p_patterns));

  -- Consents and documents (files queued by the caller).
  files := files || ARRAY(SELECT c.document_file_id FROM itap.consent_records c
                          WHERE c.organization_id = org AND c.profile_id = prof AND c.document_file_id IS NOT NULL)
                 || ARRAY(SELECT d.file_id FROM itap.profile_documents d WHERE d.organization_id = org AND d.profile_id = prof);
  DELETE FROM itap.consent_records c WHERE c.organization_id = org AND c.profile_id = prof;
  DELETE FROM itap.profile_documents d WHERE d.organization_id = org AND d.profile_id = prof;

  -- Attendance reports list people by name: generated while the person's profile existed, they are archived like the
  -- reports class does (expired, file and metrics removed). Other report types aggregate or show codes only.
  reports := ARRAY(
    SELECT x.id FROM itap.reports x
    WHERE x.organization_id = org AND x.report_type = 'attendance' AND x.status = 'completed'
      AND coalesce(x.generated_at, x.created_at) >= (SELECT p.created_at FROM itap.profiles p WHERE p.organization_id = org AND p.id = prof)
      AND NOT EXISTS (SELECT 1 FROM itap.report_facilities rf WHERE rf.organization_id = org AND rf.report_id = x.id
                      AND rf.facility_id = ANY (s.held_facilities)));
  files := files || ARRAY(SELECT x.file_id FROM itap.reports x WHERE x.organization_id = org AND x.id = ANY (reports)
                          AND x.file_id IS NOT NULL) || itap.tagged_files(org, 'report_id', reports);
  DELETE FROM itap.report_metrics m WHERE m.organization_id = org AND m.report_id = ANY (reports);
  UPDATE itap.reports x SET status = 'expired', file_id = NULL WHERE x.organization_id = org AND x.id = ANY (reports);

  -- Free text elsewhere; earlier access bundles of the person (zips of their data) go.
  UPDATE itap.shift_handovers h SET summary = itap.dsr_redact_text(h.summary, p_terms)
  WHERE h.organization_id = org AND h.summary ILIKE ANY (p_patterns);
  files := files || ARRAY(SELECT x.export_file_id FROM itap.data_subject_requests x
                          WHERE x.organization_id = org AND x.profile_id = prof AND x.export_file_id IS NOT NULL);
  UPDATE itap.data_subject_requests x
  SET export_file_id = NULL, notes = itap.dsr_redact_text(x.notes, p_terms), details = itap.dsr_strip_json(x.details, p_patterns)
  WHERE x.organization_id = org AND x.profile_id = prof
    AND (x.export_file_id IS NOT NULL OR x.notes ILIKE ANY (p_patterns) OR x.details::text ILIKE ANY (p_patterns));
  RETURN files;
END;
$$;

-- Step 4: biometrics and identities. Returns (deleted identities, kept identities, files).
CREATE FUNCTION itap.dsr_erase_identities(p_org uuid, p_ids uuid[], p_held uuid[], OUT deleted uuid[], OUT kept uuid[],
  OUT files uuid[])
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  free uuid[] := ARRAY(SELECT unnest(p_ids) EXCEPT SELECT unnest(p_held));
BEGIN
  files := itap.delete_identity_biometrics(p_org, free);
  -- An identity a retained (held) row still references stays (without biometrics): deleting it would alter the
  -- held evidence (FK SET NULL); so does a target of a hold that has not ended.
  deleted := ARRAY(
    SELECT x FROM unnest(free) x
    WHERE NOT EXISTS (SELECT 1 FROM itap.detections d WHERE d.organization_id = p_org AND d.identity_id = x)
      AND NOT EXISTS (SELECT 1 FROM itap.identity_locations l WHERE l.organization_id = p_org AND l.identity_id = x)
      AND NOT EXISTS (SELECT 1 FROM itap.tracking_sessions t WHERE t.organization_id = p_org AND t.identity_id = x)
      AND NOT EXISTS (SELECT 1 FROM itap.events e WHERE e.organization_id = p_org AND e.identity_id = x)
      AND NOT EXISTS (SELECT 1 FROM itap.access_decisions a WHERE a.organization_id = p_org AND a.identity_id = x)
      AND NOT EXISTS (SELECT 1 FROM itap.authentication_attempts a
                      WHERE a.organization_id = p_org AND (a.matched_identity_id = x OR a.claimed_identity_id = x))
      AND NOT EXISTS (SELECT 1 FROM itap.incident_identities ii WHERE ii.organization_id = p_org AND ii.identity_id = x)
      AND NOT itap.retention_open_hold_target(p_org, x, NULL)
    ORDER BY x);
  kept := ARRAY(SELECT unnest(p_ids) EXCEPT SELECT unnest(deleted) ORDER BY 1);
  DELETE FROM itap.identity_merges m
  WHERE m.organization_id = p_org AND (m.target_identity_id = ANY (deleted)
    OR m.id IN (SELECT s.merge_id FROM itap.identity_merge_sources s WHERE s.organization_id = p_org AND s.source_identity_id = ANY (deleted))
    OR m.id IN (SELECT v.merge_id FROM itap.identity_merge_moves v WHERE v.organization_id = p_org AND v.from_identity_id = ANY (deleted)));
  DELETE FROM itap.legal_hold_targets t WHERE t.organization_id = p_org AND t.identity_id = ANY (deleted);
  DELETE FROM itap.identities i WHERE i.organization_id = p_org AND i.id = ANY (deleted);
END;
$$;

CREATE FUNCTION itap.dsr_erase(p_request uuid, p_attempt integer) RETURNS SETOF itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.data_subject_requests := itap.dsr_fenced(p_request, p_attempt, ARRAY['erasure']);
  classes constant text[] := ARRAY['access_decisions', 'auth_evidence', 'auth_attempts', 'deliveries', 'webhook_deliveries',
    'events', 'detections', 'locations', 'sessions', 'search_history', 'bulk_jobs'];
  org uuid;
  prof itap.profiles;
  ids uuid[];
  s itap.retention_scope;
  profile_held boolean;
  terms text[];
  patterns text[];
  files uuid[] := '{}';
  retained text[] := '{}';
  hold_ids uuid[];
  cls text;
  res record;
  idres record;
  total integer;
  enq integer;
  held integer;
  x uuid;
  prev text;
BEGIN
  IF r.id IS NULL THEN
    RETURN;
  END IF;
  org := r.organization_id;
  -- 1. Processing stops first.
  PERFORM itap.apply_processing_restriction(org, r.profile_id, true, 'dsr:' || r.code, r.requested_by);
  PERFORM itap.dsr_step(r, 'restricted');
  ids := ARRAY(SELECT y.id FROM itap.legal_hold_subjects(org, '{}'::uuid[], ARRAY[r.profile_id]) y
               WHERE y.kind = 'identity' ORDER BY y.id);
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:' || y::text, 0)) FROM unnest(ids) y ORDER BY y;
  SELECT * INTO prof FROM itap.profiles p WHERE p.organization_id = org AND p.id = r.profile_id FOR UPDATE;
  FOR x IN SELECT t.id FROM itap.tracking_sessions t
           WHERE t.organization_id = org AND t.identity_id = ANY (ids) AND t.status = 'active' ORDER BY t.id LOOP
    PERFORM itap.close_tracking_session(org, x);
  END LOOP;
  s := itap.retention_scope('events', org, 'infinity', NULL, r.profile_id, NULL, 'delete', now());
  profile_held := r.profile_id = ANY (s.held_profiles);
  terms := itap.dsr_terms(prof, ids);
  patterns := itap.dsr_like_patterns(terms);
  prev := itap.retention_begin();

  -- 2. Data classes (subject filter, no cutoff; holds honoured).
  FOREACH cls IN ARRAY classes LOOP
    total := 0;
    enq := 0;
    held := 0;
    LOOP
      SELECT * INTO res FROM itap.purge_class(cls, org, 'infinity', NULL, r.profile_id, NULL, 5000,
        CASE cls WHEN 'bulk_jobs' THEN 'archive' ELSE 'delete' END);
      total := total + res.affected;
      enq := enq + res.files_enqueued;
      held := res.skipped_by_hold;
      EXIT WHEN res.affected = 0;
    END LOOP;
    PERFORM itap.dsr_step(r, 'purged', jsonb_build_object('class', cls, 'affected', total, 'held', held, 'files_enqueued', enq));
    IF held > 0 THEN
      retained := retained || cls;
    END IF;
  END LOOP;

  IF profile_held THEN
    retained := retained || ARRAY['profile', 'identities'];
  ELSE
    -- 3. Leftovers; 4. biometrics and identities; 5. tombstone; 6. audit and trigger logs.
    files := itap.dsr_erase_leftovers(r, s, ids, terms, patterns);
    SELECT * INTO idres FROM itap.dsr_erase_identities(org, ids, s.held_identities);
    files := files || idres.files;
    IF cardinality(idres.kept) > 0 THEN
      retained := retained || 'identities'::text;
    END IF;
    IF EXISTS (SELECT 1 FROM itap.incident_identities ii WHERE ii.organization_id = org AND ii.identity_id = ANY (idres.kept)) THEN
      retained := retained || 'incidents'::text;
    END IF;
    PERFORM itap.dsr_step(r, 'biometrics_deleted',
      jsonb_build_object('identities_deleted', cardinality(idres.deleted), 'identities_kept', cardinality(idres.kept)));

    files := files || prof.avatar_file_id;
    DELETE FROM itap.legal_hold_targets t WHERE t.organization_id = org AND t.profile_id = r.profile_id
      AND NOT itap.legal_hold_covers_profile(org, r.profile_id, now());
    UPDATE itap.profiles p
    SET first_name = 'Erased subject', last_name = p.code, email = NULL, phone = NULL, employee_id = NULL, company_id = NULL,
        department = NULL, job_title = NULL, start_date = NULL, end_date = NULL, work_schedule_id = NULL, avatar_file_id = NULL,
        notes = NULL, custom_fields = '{}'::jsonb, source_integration_id = NULL, external_id = NULL, status = 'inactive',
        erased_at = coalesce(p.erased_at, now())
    WHERE p.organization_id = org AND p.id = r.profile_id;
    PERFORM itap.dsr_step(r, 'profile_anonymized');

    UPDATE itap.audit_log a
    SET changes = '{"anonymized": true}'::jsonb,
        reason = CASE WHEN a.reason ILIKE ANY (patterns) THEN NULL ELSE a.reason END
    WHERE a.organization_id = org AND a.occurred_at < now()
      AND a.changes IS DISTINCT FROM '{"anonymized": true}'::jsonb
      AND NOT (a.entity = 'identities' AND a.entity_id = ANY (s.held_identities))
      AND ((a.entity = 'profiles' AND a.entity_id = r.profile_id
            AND a.action NOT IN ('restrict', 'unrestrict', 'export', 'erase', 'rectify', 'reject'))
           OR (a.entity = 'identities' AND a.entity_id = ANY (ids))
           OR a.changes::text ILIKE ANY (patterns) OR a.reason ILIKE ANY (patterns));
    DELETE FROM hdb_catalog.event_invocation_logs i
    WHERE i.event_id IN (SELECT e.id FROM hdb_catalog.event_log e
                         WHERE (e.delivered OR e.error OR e.archived) AND e.payload::text ILIKE ANY (patterns));
    DELETE FROM hdb_catalog.event_log e WHERE (e.delivered OR e.error OR e.archived) AND e.payload::text ILIKE ANY (patterns);
  END IF;
  enq := itap.enqueue_unused_files(org, files, 'dsr:' || r.code);
  PERFORM itap.dsr_step(r, 'files_queued', jsonb_build_object('files', enq));
  PERFORM itap.retention_end(prev);

  -- Partial: categories retained under active holds and the holds that retain them.
  IF cardinality(retained) > 0 THEN
    hold_ids := ARRAY(
      SELECT DISTINCT h.id FROM itap.legal_holds h
      JOIN itap.legal_hold_targets t ON t.organization_id = h.organization_id AND t.hold_id = h.id
      WHERE h.organization_id = org AND h.starts_at <= now() AND (h.ends_at IS NULL OR h.ends_at > now())
        AND (t.profile_id = r.profile_id OR t.identity_id = ANY (ids)
             OR t.incident_id IN (SELECT ii.incident_id FROM itap.incident_identities ii
                                  WHERE ii.organization_id = org AND ii.identity_id = ANY (ids))
             OR t.facility_id IN (
               SELECT d.facility_id FROM itap.detections d WHERE d.organization_id = org AND d.identity_id = ANY (ids)
               UNION SELECT l.facility_id FROM itap.identity_locations l WHERE l.organization_id = org AND l.identity_id = ANY (ids)
               UNION SELECT t2.facility_id FROM itap.tracking_sessions t2
                     WHERE t2.organization_id = org AND (t2.identity_id = ANY (ids) OR t2.profile_id = r.profile_id)
               UNION SELECT e.facility_id FROM itap.events e
                     WHERE e.organization_id = org AND (e.identity_id = ANY (ids) OR e.profile_id = r.profile_id)
               UNION SELECT a.facility_id FROM itap.access_decisions a
                     WHERE a.organization_id = org AND (a.identity_id = ANY (ids) OR a.profile_id = r.profile_id)))
      ORDER BY h.id);
    PERFORM itap.dsr_step(r, 'retained', jsonb_build_object('categories', to_jsonb(retained), 'hold_ids', to_jsonb(hold_ids)));
  END IF;
  UPDATE itap.data_subject_requests
  SET status = 'completed', completed_at = now(), partial = cardinality(retained) > 0, lease_expires_at = NULL
  WHERE id = r.id RETURNING * INTO r;
  PERFORM itap.dsr_step(r, 'completed', jsonb_build_object('partial', r.partial));
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (org, r.requested_by, 'erase', 'profiles', r.profile_id,
          jsonb_build_object('request_id', r.id, 'code', r.code, 'partial', r.partial, 'retained', to_jsonb(retained)),
          'dsr:' || r.code);
  RETURN NEXT r;
END;
$$;
