-- Restores dsr_erase without export jobs and integration suppression.
CREATE OR REPLACE FUNCTION itap.dsr_erase(p_request uuid, p_attempt integer)
 RETURNS SETOF itap.data_subject_requests
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
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
    -- Finished Hasura trigger deliveries of this organization's rows carrying one of the person's identifiers
    -- (structural match).
    log_ids := ARRAY(SELECT e.id FROM hdb_catalog.event_log e
                     WHERE (e.delivered OR e.error OR e.archived)
                       AND (e.payload #>> '{data,new,organization_id}' = org::text
                            OR e.payload #>> '{data,old,organization_id}' = org::text)
                       AND e.payload::text ILIKE ANY (itap.dsr_like_patterns(sids))
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
$function$
;
