-- Slice 10 task 3 fix round 1: DSR erasure matching and coverage (review #1-#3, minors, carries).
-- * Identifiers are matched structurally only: columns by equality, JSON by leaf value equality
--   (itap.dsr_ids: profile / identity ids and codes, employee id, external id, email, phone; lower case).
--   Substring matching (itap.dsr_terms: full name, "last, first", email, phone; >= 5 characters) only in free-text
--   columns and JSON string leaves of content (deliveries, webhooks, payloads, details, audit changes).
--   itap.dsr_json_hit(j, ids, patterns) / dsr_strip_json(j, ids, patterns) (top-level keys whose subtree hits go).
-- * Audit rows about the person (entity = the profile / an identity) are blanked; other rows naming the person keep
--   everything except the mentioning keys; Hasura event_log rows go only on a structural match.
-- * Restriction runs as its own fenced, committed job step (itap.dsr_erase_restrict) before the erasure.
-- * Before the classes (data intact): saved searches using the person's image or whose runs name them are deleted
--   with their requests (images queued); completed reports whose dataset (recomputed with the report functions)
--   names the person lose their file and metrics (status expired, error dsr_erasure).
-- * Leftovers: other people's events mentioning the person only in the payload keep their columns (keys stripped);
--   digests are redacted, not skipped; auth sessions referenced by retained attempts stay; the request log
--   (dsr_steps details, last_error, notes) is redacted (dsr_steps accepts updates under the retention context).
-- * Identities kept because held rows reference them lose verification requests, relationships, duplicate
--   candidates, occupancy, attributes and custom fields; ended-hold targets of every unheld identity go.

CREATE OR REPLACE FUNCTION itap.dsr_steps_append_only() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  -- DSR erasure redacts step details naming the person (retention context).
  IF itap.retention_context() THEN
    RETURN NEW;
  END IF;
  PERFORM itap.raise_code('dsr_step_append_only');
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION itap.guard_notification_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  mutable text[] := ARRAY[
    'status', 'attempts', 'deliver_after', 'sent_at', 'delivered_at', 'acknowledged_at', 'error', 'incident_id',
    'recipient_key', 'content', 'digested_into'
  ];
BEGIN
  -- DSR erasure redacts digest content naming the person (retention context).
  IF itap.retention_context() THEN
    RETURN NEW;
  END IF;
  IF itap.seed_context() THEN
    mutable := mutable || 'created_at'::text;
  END IF;
  -- The report FK may only null the column (SET NULL on report deletion).
  IF NEW.report_id IS NULL AND OLD.report_id IS NOT NULL THEN
    mutable := mutable || 'report_id'::text;
  END IF;
  IF (to_jsonb(OLD) - mutable) IS DISTINCT FROM (to_jsonb(NEW) - mutable)
     OR (OLD.content - 'scheduled_for') IS DISTINCT FROM (NEW.content - 'scheduled_for')
     OR (OLD.content ? 'scheduled_for' AND OLD.content -> 'scheduled_for' IS DISTINCT FROM NEW.content -> 'scheduled_for')
     OR (OLD.digested_into IS NOT NULL AND NEW.digested_into IS DISTINCT FROM OLD.digested_into) THEN
    PERFORM itap.raise_code('notification_delivery_immutable');
  END IF;
  IF NOT itap.notification_delivery_transition_allowed(OLD.status, NEW.status) THEN
    PERFORM itap.raise_code('notification_delivery_invalid_transition');
  END IF;
  IF OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at THEN
    PERFORM itap.raise_code('notification_delivery_already_acknowledged');
  END IF;
  RETURN NEW;
END;
$function$;

-- Structural identifiers of the person (lower case): ids, codes, employee / external id, email, phone.
CREATE FUNCTION itap.dsr_ids(p itap.profiles, p_ids uuid[]) RETURNS text[]
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT coalesce(array_agg(DISTINCT lower(t)), '{}') FROM unnest(
    ARRAY[p.id::text, p.code] || coalesce(p_ids::text[], '{}')
    || ARRAY(SELECT i.code FROM itap.identities i WHERE i.organization_id = p.organization_id AND i.id = ANY (p_ids))
    || CASE WHEN p.erased_at IS NULL THEN ARRAY[p.employee_id, p.external_id, p.email, p.phone] ELSE '{}'::text[] END) t
  WHERE t IS NOT NULL AND btrim(t) <> '';
$$;

-- Free-text terms of the person (substring, >= 5 characters): full name both ways, email, phone.
CREATE OR REPLACE FUNCTION itap.dsr_terms(p itap.profiles, p_ids uuid[]) RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT coalesce(array_agg(DISTINCT t), '{}') FROM unnest(
    CASE WHEN p.erased_at IS NULL THEN ARRAY[p.first_name || ' ' || p.last_name, p.last_name || ', ' || p.first_name,
                                             p.email, p.phone]
         ELSE '{}'::text[] END) t
  WHERE t IS NOT NULL AND length(btrim(t)) >= 5;
$$;

-- A string leaf equal to an identifier or containing a free-text term.
CREATE FUNCTION itap.dsr_json_hit(j jsonb, p_ids text[], p_patterns text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT j IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_path_query(j, 'strict $.**') v
    WHERE jsonb_typeof(v) = 'string'
      AND (lower(v #>> '{}') = ANY (p_ids) OR (v #>> '{}') ILIKE ANY (p_patterns)));
$$;

-- Drops the top-level keys of an object whose key equals an identifier or whose value hits (non-object hit -> {}).
CREATE FUNCTION itap.dsr_strip_json(p jsonb, p_ids text[], p_patterns text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    WHEN jsonb_typeof(p) = 'object' THEN coalesce(
      (SELECT jsonb_object_agg(x.k, x.v) FROM jsonb_each(p) AS x (k, v)
       WHERE NOT itap.dsr_json_hit(x.v, p_ids, p_patterns) AND NOT (lower(x.k) = ANY (p_ids))), '{}'::jsonb)
    WHEN itap.dsr_json_hit(p, p_ids, p_patterns) THEN '{}'::jsonb
    ELSE p
  END;
$$;

-- The dataset a report would contain now (same context as itap.compute_report), to find reports naming a person.
CREATE FUNCTION itap.dsr_report_dataset(r itap.reports) RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  c itap.report_context;
BEGIN
  c.organization_id := r.organization_id;
  c.report_id := r.id;
  c.timezone := coalesce(r.parameters ->> 'timezone',
                         (SELECT o.timezone FROM itap.organizations o WHERE o.id = r.organization_id), 'UTC');
  c.start_date := r.start_date;
  c.end_date := r.end_date;
  c.from_ts := r.start_date::timestamp AT TIME ZONE c.timezone;
  c.to_ts := (r.end_date + 1)::timestamp AT TIME ZONE c.timezone;
  SELECT coalesce(array_agg(x.facility_id ORDER BY x.facility_id), '{}') INTO c.facility_ids
  FROM itap.report_facilities x WHERE x.organization_id = r.organization_id AND x.report_id = r.id;
  c.facilities_explicit := cardinality(c.facility_ids) > 0;
  IF NOT c.facilities_explicit THEN
    SELECT coalesce(array_agg(f.id ORDER BY f.id), '{}') INTO c.facility_ids
    FROM itap.facilities f WHERE f.organization_id = r.organization_id;
  END IF;
  SELECT coalesce(array_agg(x.segment_id ORDER BY x.segment_id), '{}') INTO c.segment_ids
  FROM itap.report_segments x WHERE x.organization_id = r.organization_id AND x.report_id = r.id;
  c.incident_id := r.incident_id;
  RETURN CASE r.report_type
    WHEN 'flow' THEN itap.report_flow(c)
    WHEN 'occupancy' THEN itap.report_occupancy(c)
    WHEN 'heatmap' THEN itap.report_heatmap(c)
    WHEN 'behavior' THEN itap.report_behavior(c)
    WHEN 'attendance' THEN itap.report_attendance(c)
    WHEN 'segment' THEN itap.report_segment(c)
    WHEN 'compliance' THEN itap.report_compliance(c)
    WHEN 'device_health' THEN itap.report_device_health(c)
    WHEN 'incident' THEN itap.report_incident(c)
    WHEN 'incident_summary' THEN itap.report_incident_summary(c)
  END;
END;
$$;

-- Job step 1 of an erasure (own transaction): processing stops before anything is deleted.
CREATE FUNCTION itap.dsr_erase_restrict(p_request uuid, p_attempt integer) RETURNS SETOF itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.data_subject_requests := itap.dsr_fenced(p_request, p_attempt, ARRAY['erasure']);
BEGIN
  IF r.id IS NULL THEN
    RETURN;
  END IF;
  PERFORM itap.apply_processing_restriction(r.organization_id, r.profile_id, true, 'dsr:' || r.code, r.requested_by);
  PERFORM itap.dsr_step(r, 'restricted');
  RETURN NEXT r;
END;
$$;

-- Before the classes, while the data still exists: saved searches and reports naming / showing the person.
CREATE FUNCTION itap.dsr_erase_prepare(r itap.data_subject_requests, s itap.retention_scope, p_ids uuid[],
  p_sids text[], p_patterns text[]) RETURNS uuid[]
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := r.organization_id;
  prof uuid := r.profile_id;
  saved uuid[];
  requests uuid[];
  reports uuid[] := '{}';
  files uuid[];
  x itap.reports;
  hit boolean;
BEGIN
  -- Saved searches run with the person's image, or whose runs (baseline included) name them.
  saved := ARRAY(
    SELECT ss.id FROM itap.saved_searches ss
    WHERE ss.organization_id = org AND (
      ss.image_file_id = ANY (itap.identity_face_files(org, p_ids))
      OR ss.image_file_id IN (
        SELECT q.image_file_id FROM itap.search_requests q
        JOIN itap.search_results sr ON sr.organization_id = q.organization_id AND sr.search_request_id = q.id
        WHERE q.organization_id = org AND q.image_file_id IS NOT NULL AND (sr.identity_id = ANY (p_ids) OR sr.profile_id = prof))
      OR EXISTS (
        SELECT 1 FROM itap.search_requests q
        JOIN itap.search_results sr ON sr.organization_id = q.organization_id AND sr.search_request_id = q.id
        WHERE q.organization_id = org AND (q.id = ss.last_search_request_id OR q.saved_search_id = ss.id)
          AND (sr.identity_id = ANY (p_ids) OR sr.profile_id = prof))));
  requests := ARRAY(
    SELECT q.id FROM itap.search_requests q
    WHERE q.organization_id = org AND (q.saved_search_id = ANY (saved)
      OR q.id IN (SELECT ss.last_search_request_id FROM itap.saved_searches ss WHERE ss.organization_id = org AND ss.id = ANY (saved))));
  files := ARRAY(SELECT ss.image_file_id FROM itap.saved_searches ss
                 WHERE ss.organization_id = org AND ss.id = ANY (saved) AND ss.image_file_id IS NOT NULL)
        || ARRAY(SELECT q.image_file_id FROM itap.search_requests q
                 WHERE q.organization_id = org AND q.id = ANY (requests) AND q.image_file_id IS NOT NULL);
  DELETE FROM itap.search_requests q WHERE q.organization_id = org AND q.id = ANY (requests);
  DELETE FROM itap.saved_searches ss WHERE ss.organization_id = org AND ss.id = ANY (saved);

  -- Completed reports whose dataset names the person (recomputed now; a report whose dataset cannot be rebuilt is
  -- treated as naming them). Held ones (held incident / facility) stay.
  FOR x IN
    SELECT * FROM itap.reports y
    WHERE y.organization_id = org AND y.status = 'completed' AND y.file_id IS NOT NULL
      AND NOT coalesce(y.incident_id = ANY (s.held_incidents), false)
      AND NOT EXISTS (SELECT 1 FROM itap.report_facilities rf WHERE rf.organization_id = org AND rf.report_id = y.id
                      AND rf.facility_id = ANY (s.held_facilities))
  LOOP
    BEGIN
      hit := itap.dsr_json_hit(itap.dsr_report_dataset(x), p_sids, p_patterns);
    EXCEPTION WHEN OTHERS THEN
      hit := true;
    END;
    IF hit THEN
      reports := reports || x.id;
    END IF;
  END LOOP;
  files := files || ARRAY(SELECT y.file_id FROM itap.reports y WHERE y.organization_id = org AND y.id = ANY (reports))
                 || itap.tagged_files(org, 'report_id', reports);
  DELETE FROM itap.report_metrics m WHERE m.organization_id = org AND m.report_id = ANY (reports);
  UPDATE itap.reports y SET status = 'expired', file_id = NULL, error = 'dsr_erasure'
  WHERE y.organization_id = org AND y.id = ANY (reports);
  RETURN files;
END;
$$;

-- Step 3: leftovers of the data classes. s = the events scope of the subject (holds snapshot).
CREATE FUNCTION itap.dsr_erase_leftovers(r itap.data_subject_requests, s itap.retention_scope, p_ids uuid[],
  p_sids text[], p_terms text[], p_patterns text[]) RETURNS uuid[]
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := r.organization_id;
  prof uuid := r.profile_id;
  free uuid[] := ARRAY(SELECT unnest(p_ids) EXCEPT SELECT unnest(s.held_identities));
  -- Cheap text prefilter before the structural check.
  pre text[] := itap.dsr_like_patterns(p_sids) || p_patterns;
  files uuid[] := '{}';
BEGIN
  -- The person's events kept with their incident: person and link columns nulled, personal keys and mentions gone.
  UPDATE itap.events e
  SET identity_id = NULL, profile_id = NULL, detection_id = NULL, session_id = NULL, access_decision_id = NULL,
      authentication_attempt_id = NULL,
      payload = itap.dsr_strip_json(e.payload - itap.event_personal_keys(), p_sids, p_patterns) || '{"anonymized": true}'::jsonb
  WHERE e.organization_id = org
    AND (e.identity_id = ANY (p_ids) OR e.profile_id = prof
         OR e.payload ->> 'matched_identity_id' = ANY (p_ids::text[]) OR e.payload ->> 'claimed_identity_id' = ANY (p_ids::text[]))
    AND NOT itap.retention_event_row_held(s, e);
  -- Other people's events mentioning the person in the payload only: the mentioning keys go, columns stay.
  UPDATE itap.events e SET payload = itap.dsr_strip_json(e.payload, p_sids, p_patterns)
  WHERE e.organization_id = org AND e.payload::text ILIKE ANY (pre) AND itap.dsr_json_hit(e.payload, p_sids, p_patterns)
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
  UPDATE itap.incident_activities a SET details = itap.dsr_strip_json(a.details, p_sids, p_patterns)
  FROM itap.incidents i
  WHERE a.organization_id = org AND a.details::text ILIKE ANY (pre) AND itap.dsr_json_hit(a.details, p_sids, p_patterns)
    AND i.organization_id = org AND i.id = a.incident_id
    AND NOT (i.id = ANY (s.held_incidents)) AND NOT coalesce(i.facility_id = ANY (s.held_facilities), false);

  -- Notifications naming the person in any state (senders tolerate vanished rows); digests are redacted instead.
  DELETE FROM itap.user_notifications u
  WHERE u.organization_id = org AND concat_ws(' ', u.title, u.body) ILIKE ANY (p_patterns)
    AND NOT coalesce(u.incident_id = ANY (s.held_incidents), false) AND NOT itap.retention_event_held(s, u.event_id);
  UPDATE itap.notification_deliveries d SET content = itap.dsr_strip_json(d.content, p_sids, p_patterns)
  WHERE d.organization_id = org AND d.content::text ILIKE ANY (pre) AND itap.dsr_json_hit(d.content, p_sids, p_patterns)
    AND NOT coalesce(d.incident_id = ANY (s.held_incidents), false) AND NOT itap.retention_event_held(s, d.event_id)
    AND EXISTS (SELECT 1 FROM itap.notification_deliveries x WHERE x.organization_id = org AND x.digested_into = d.id);
  DELETE FROM itap.notification_deliveries d
  WHERE d.organization_id = org AND d.content::text ILIKE ANY (pre) AND itap.dsr_json_hit(d.content, p_sids, p_patterns)
    AND NOT coalesce(d.incident_id = ANY (s.held_incidents), false) AND NOT itap.retention_event_held(s, d.event_id)
    AND NOT EXISTS (SELECT 1 FROM itap.notification_deliveries x WHERE x.organization_id = org AND x.digested_into = d.id);
  DELETE FROM itap.webhook_deliveries w
  WHERE w.organization_id = org AND w.body::text ILIKE ANY (pre) AND itap.dsr_json_hit(w.body, p_sids, p_patterns)
    AND NOT itap.retention_event_held(s, w.event_id);

  -- Memberships, stats, pairs, subscriptions, search results, auth sessions no retained attempt references.
  DELETE FROM itap.watch_list_entries x WHERE x.organization_id = org AND (x.identity_id = ANY (free) OR x.profile_id = prof);
  DELETE FROM itap.segment_members m WHERE m.organization_id = org AND (m.identity_id = ANY (free) OR m.profile_id = prof);
  DELETE FROM itap.identity_activity_stats x WHERE x.organization_id = org AND x.identity_id = ANY (free);
  DELETE FROM itap.profile_activity_stats x WHERE x.organization_id = org AND x.profile_id = prof;
  DELETE FROM itap.notification_subscriptions x WHERE x.organization_id = org AND (x.identity_id = ANY (free) OR x.profile_id = prof);
  DELETE FROM itap.profile_duplicate_candidates x WHERE x.organization_id = org AND prof IN (x.profile_a_id, x.profile_b_id);
  DELETE FROM itap.search_results x WHERE x.organization_id = org AND (x.identity_id = ANY (free) OR x.profile_id = prof);
  DELETE FROM itap.authentication_sessions x WHERE x.organization_id = org AND x.claimed_identity_id = ANY (free)
    AND NOT EXISTS (SELECT 1 FROM itap.authentication_attempts a WHERE a.organization_id = org AND a.session_id = x.id);

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

  -- Free text elsewhere; the person's requests: earlier bundles (zips of their data) go, notes / details / errors /
  -- step details naming them are redacted.
  UPDATE itap.shift_handovers h SET summary = itap.dsr_redact_text(h.summary, p_terms)
  WHERE h.organization_id = org AND h.summary ILIKE ANY (p_patterns);
  files := files || ARRAY(SELECT x.export_file_id FROM itap.data_subject_requests x
                          WHERE x.organization_id = org AND x.profile_id = prof AND x.export_file_id IS NOT NULL);
  UPDATE itap.data_subject_requests x
  SET export_file_id = NULL, notes = itap.dsr_redact_text(x.notes, p_terms),
      last_error = itap.dsr_redact_text(x.last_error, p_terms), details = itap.dsr_strip_json(x.details, p_sids, p_patterns)
  WHERE x.organization_id = org AND x.profile_id = prof
    AND (x.export_file_id IS NOT NULL OR concat_ws(' ', x.notes, x.last_error) ILIKE ANY (p_patterns)
         OR itap.dsr_json_hit(x.details, p_sids, p_patterns));
  UPDATE itap.dsr_steps st SET details = itap.dsr_strip_json(st.details, p_sids, p_patterns)
  FROM itap.data_subject_requests x
  WHERE st.organization_id = org AND x.organization_id = org AND x.id = st.request_id AND x.profile_id = prof
    AND itap.dsr_json_hit(st.details, p_sids, p_patterns);
  RETURN files;
END;
$$;

-- Step 4: biometrics and identities. Returns (deleted identities, kept identities, files).
CREATE OR REPLACE FUNCTION itap.dsr_erase_identities(p_org uuid, p_ids uuid[], p_held uuid[], OUT deleted uuid[], OUT kept uuid[],
  OUT files uuid[])
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  free uuid[] := ARRAY(SELECT unnest(p_ids) EXCEPT SELECT unnest(p_held));
  kept_free uuid[];
BEGIN
  files := itap.delete_identity_biometrics(p_org, free);
  -- Targets of ended holds go for every unheld identity.
  DELETE FROM itap.legal_hold_targets t
  USING itap.legal_holds h
  WHERE t.organization_id = p_org AND t.identity_id = ANY (free) AND h.organization_id = p_org AND h.id = t.hold_id
    AND h.ends_at IS NOT NULL AND h.ends_at <= now();
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
  kept_free := ARRAY(SELECT unnest(kept) INTERSECT SELECT unnest(free));
  -- Kept but not held: only what the held rows need (the row); everything else about the person goes.
  DELETE FROM itap.verification_requests v WHERE v.organization_id = p_org AND v.identity_id = ANY (kept_free);
  DELETE FROM itap.identity_relationships x
  WHERE x.organization_id = p_org AND (x.identity_a_id = ANY (kept_free) OR x.identity_b_id = ANY (kept_free));
  DELETE FROM itap.identity_duplicate_candidates x
  WHERE x.organization_id = p_org AND (x.identity_a_id = ANY (kept_free) OR x.identity_b_id = ANY (kept_free));
  DELETE FROM itap.area_occupancy o WHERE o.organization_id = p_org AND o.identity_id = ANY (kept_free);
  UPDATE itap.identities i SET attributes = '{}'::jsonb, custom_fields = '{}'::jsonb, matching_enabled = false
  WHERE i.organization_id = p_org AND i.id = ANY (kept_free);

  DELETE FROM itap.identity_merges m
  WHERE m.organization_id = p_org AND (m.target_identity_id = ANY (deleted)
    OR m.id IN (SELECT s.merge_id FROM itap.identity_merge_sources s WHERE s.organization_id = p_org AND s.source_identity_id = ANY (deleted))
    OR m.id IN (SELECT v.merge_id FROM itap.identity_merge_moves v WHERE v.organization_id = p_org AND v.from_identity_id = ANY (deleted)));
  DELETE FROM itap.legal_hold_targets t WHERE t.organization_id = p_org AND t.identity_id = ANY (deleted);
  DELETE FROM itap.identities i WHERE i.organization_id = p_org AND i.id = ANY (deleted);
END;
$$;

-- Job step 2 of an erasure (fenced, one transaction; dsr_erase_restrict committed the restriction before).
CREATE OR REPLACE FUNCTION itap.dsr_erase(p_request uuid, p_attempt integer) RETURNS SETOF itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.data_subject_requests := itap.dsr_fenced(p_request, p_attempt, ARRAY['erasure']);
  classes constant text[] := ARRAY['access_decisions', 'auth_evidence', 'auth_attempts', 'deliveries', 'webhook_deliveries',
    'events', 'detections', 'locations', 'sessions', 'search_history', 'bulk_jobs'];
  dsr_actions constant text[] := ARRAY['restrict', 'unrestrict', 'export', 'erase', 'rectify', 'reject'];
  org uuid;
  prof itap.profiles;
  ids uuid[];
  s itap.retention_scope;
  profile_held boolean;
  sids text[];
  terms text[];
  patterns text[];
  pre text[];
  log_ids text[];
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
  -- Normally done by dsr_erase_restrict; a no-op then.
  PERFORM itap.apply_processing_restriction(org, r.profile_id, true, 'dsr:' || r.code, r.requested_by);
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
  sids := itap.dsr_ids(prof, ids);
  terms := itap.dsr_terms(prof, ids);
  patterns := itap.dsr_like_patterns(terms);
  pre := itap.dsr_like_patterns(sids) || patterns;
  prev := itap.retention_begin();

  -- 1. Saved searches and reports naming / showing the person (before the classes remove the evidence).
  IF NOT profile_held THEN
    files := itap.dsr_erase_prepare(r, s, ids, sids, patterns);
  END IF;

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
    files := files || itap.dsr_erase_leftovers(r, s, ids, sids, terms, patterns);
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

    -- Audit rows about the person (written before this request) are blanked; DSR action rows stay.
    UPDATE itap.audit_log a
    SET changes = '{"anonymized": true}'::jsonb, reason = itap.dsr_redact_text(a.reason, terms)
    WHERE a.organization_id = org AND a.occurred_at < now() AND a.changes IS DISTINCT FROM '{"anonymized": true}'::jsonb
      AND ((a.entity = 'profiles' AND a.entity_id = r.profile_id AND NOT (a.action = ANY (dsr_actions)))
           OR (a.entity = 'identities' AND a.entity_id = ANY (ids) AND NOT (a.entity_id = ANY (s.held_identities))));
    -- Other audit rows naming the person keep everything but the mentioning keys.
    UPDATE itap.audit_log a
    SET changes = itap.dsr_strip_json(a.changes, sids, patterns), reason = itap.dsr_redact_text(a.reason, terms)
    WHERE a.organization_id = org AND a.occurred_at < now()
      AND NOT (a.entity = 'profiles' AND a.entity_id = r.profile_id) AND NOT (a.entity = 'identities' AND a.entity_id = ANY (ids))
      AND NOT (a.entity = 'incidents' AND a.entity_id = ANY (s.held_incidents))
      AND NOT (a.entity = 'facilities' AND a.entity_id = ANY (s.held_facilities))
      AND ((a.changes::text ILIKE ANY (pre) AND itap.dsr_json_hit(a.changes, sids, patterns)) OR a.reason ILIKE ANY (patterns));
    -- Finished Hasura trigger deliveries whose payload carries one of the person's identifiers (structural match).
    log_ids := ARRAY(SELECT e.id FROM hdb_catalog.event_log e
                     WHERE (e.delivered OR e.error OR e.archived) AND e.payload::text ILIKE ANY (itap.dsr_like_patterns(sids))
                       AND itap.dsr_json_hit(e.payload, sids, '{}'::text[]));
    DELETE FROM hdb_catalog.event_invocation_logs i WHERE i.event_id = ANY (log_ids);
    DELETE FROM hdb_catalog.event_log e WHERE e.id = ANY (log_ids);
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

DROP FUNCTION itap.dsr_erase_leftovers(itap.data_subject_requests, itap.retention_scope, uuid[], text[], text[]);
DROP FUNCTION itap.dsr_strip_json(jsonb, text[]);
