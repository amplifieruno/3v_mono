-- Slice 10 final wave (I-1, erasure fence): a report or an export job whose attempt was claimed before an erasure
-- of the same organization committed may have read rows naming the erased person; its completion must not attach
-- that file. Subject ids of the exported rows are not enough (the erased rows are gone or anonymized by then).
-- * Fence: an organization-wide advisory lock. dsr_erase takes it exclusively (after the request lock) and stamps
--   completed_at with clock_timestamp() at its end; claims take it shared without waiting (a locked fence = skipped,
--   the cron reclaims) and stamp claimed_at = clock_timestamp(); completions take it shared and wait. So an attempt
--   claimed before an erasure has claimed_at < the erasure's completed_at, and a completion racing an erasure sees it.
-- * complete_report / complete_export_job: an erasure completed after claimed_at ends the attempt as retryable — the
--   row goes back to queued (error subject_erased; attempts keep counting toward max attempts) and the produced file
--   is queued for deletion (pending_file_deletions). report_transition_allowed gains generating -> queued (system only:
--   status is read-only for org_admin).
-- * dsr_erase_prepare still handles completed reports only; queued / generating ones are covered by this fence.

ALTER TABLE itap.reports ADD COLUMN claimed_at timestamptz;
ALTER TABLE itap.export_jobs ADD COLUMN claimed_at timestamptz;
-- Generation state is not audited (as attempts / lease_expires_at).
DROP TRIGGER audit ON itap.reports;
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.reports
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change('ignore:status', 'ignore:file_id', 'ignore:summary', 'ignore:error',
    'ignore:generated_at', 'ignore:attempts', 'ignore:lease_expires_at', 'ignore:attempts_at_retry', 'ignore:claimed_at');

CREATE FUNCTION itap.erasure_fence_key(p_org uuid) RETURNS bigint
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$ SELECT hashtextextended('erasure_fence:' || p_org::text, 0) $$;

-- Shared side (claims, completions). p_wait false: true when taken, false while an erasure holds the fence.
CREATE FUNCTION itap.erasure_fence_shared(p_org uuid, p_wait boolean) RETURNS boolean
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF p_wait THEN
    PERFORM pg_advisory_xact_lock_shared(itap.erasure_fence_key(p_org));
    RETURN true;
  END IF;
  RETURN pg_try_advisory_xact_lock_shared(itap.erasure_fence_key(p_org));
END;
$$;

CREATE FUNCTION itap.erasure_fence_exclusive(p_org uuid) RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, itap
AS $$ SELECT pg_advisory_xact_lock(itap.erasure_fence_key(p_org)) $$;

-- An erasure request of the organization completed after p_since.
CREATE FUNCTION itap.erased_since(p_org uuid, p_since timestamptz) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT EXISTS (SELECT 1 FROM itap.data_subject_requests d
                 WHERE d.organization_id = p_org AND d.request_type = 'erasure' AND d.status = 'completed'
                   AND d.completed_at > p_since);
$$;

CREATE OR REPLACE FUNCTION itap.report_transition_allowed(p_from text, p_to text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT CASE p_from
    WHEN 'queued' THEN p_to IN ('queued', 'generating', 'failed')
    WHEN 'generating' THEN p_to IN ('generating', 'completed', 'failed', 'queued')
    WHEN 'failed' THEN p_to IN ('failed', 'queued', 'expired')
    WHEN 'completed' THEN p_to IN ('completed', 'expired')
    ELSE p_to = p_from
  END;
$function$
;

CREATE OR REPLACE FUNCTION itap.claim_report(p_report uuid)
 RETURNS SETOF itap.reports
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  r itap.reports;
  org uuid;
BEGIN
  SELECT x.organization_id INTO org FROM itap.reports x WHERE x.id = p_report;
  IF NOT FOUND OR NOT itap.erasure_fence_shared(org, false) THEN
    RETURN;
  END IF;
  SELECT * INTO r FROM itap.reports x
  WHERE x.id = p_report AND (x.status = 'queued' OR (x.status = 'generating' AND x.lease_expires_at <= now()))
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF r.attempts - r.attempts_at_retry >= itap.report_max_attempts() THEN
    UPDATE itap.reports SET status = 'failed', error = 'max_attempts', lease_expires_at = NULL WHERE id = r.id;
    RETURN;
  END IF;
  UPDATE itap.reports
  SET status = 'generating', attempts = attempts + 1, lease_expires_at = now() + interval '5 minutes', claimed_at = clock_timestamp(), error = NULL
  WHERE id = r.id
  RETURNING * INTO r;
  RETURN NEXT r;
END;
$function$
;

CREATE OR REPLACE FUNCTION itap.claim_export_job(p_job uuid)
 RETURNS SETOF itap.export_jobs
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  j itap.export_jobs;
  org uuid;
BEGIN
  -- Erasure fence first (before any row lock; skipped like a locked row while an erasure of the organization runs).
  SELECT x.organization_id INTO org FROM itap.export_jobs x WHERE x.id = p_job;
  IF NOT FOUND OR NOT itap.erasure_fence_shared(org, false) THEN
    RETURN;
  END IF;
  SELECT * INTO j FROM itap.export_jobs x
  WHERE x.id = p_job AND (x.status = 'queued' OR (x.status = 'running' AND x.lease_expires_at <= now()))
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF j.attempts >= itap.export_max_attempts() THEN
    UPDATE itap.export_jobs SET status = 'failed', error = 'max_attempts', finished_at = now(), lease_expires_at = NULL
    WHERE id = j.id;
    RETURN;
  END IF;
  IF NOT itap.member_active(j.organization_id, j.requested_by)
     OR NOT EXISTS (SELECT 1 FROM itap.export_definitions d WHERE d.organization_id = j.organization_id
                    AND d.id = j.definition_id AND d.owner_id = j.requested_by) THEN
    UPDATE itap.export_jobs SET status = 'failed', error = 'requester_not_member', finished_at = now(), lease_expires_at = NULL
    WHERE id = j.id;
    RETURN;
  END IF;
  UPDATE itap.export_jobs
  SET status = 'running', attempts = attempts + 1, lease_expires_at = now() + interval '10 minutes',
      started_at = coalesce(started_at, now()), claimed_at = clock_timestamp(), error = NULL
  WHERE id = j.id
  RETURNING * INTO j;
  RETURN NEXT j;
END;
$function$
;

CREATE OR REPLACE FUNCTION itap.complete_report(p_report uuid, p_attempt integer, p_file uuid, p_summary jsonb)
 RETURNS SETOF itap.reports
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  r itap.reports;
  s itap.report_schedules;
  ev itap.events;
  ev_id uuid;
  fresh boolean;
  target record;
  delivery uuid;
  content jsonb;
  org uuid;
BEGIN
  SELECT x.organization_id INTO org FROM itap.reports x WHERE x.id = p_report;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  -- Waits for a running erasure of the organization to commit (fence before the row lock: dsr_erase updates reports).
  PERFORM itap.erasure_fence_shared(org, true);
  SELECT * INTO r FROM itap.reports WHERE id = p_report FOR UPDATE;
  IF NOT FOUND OR r.status <> 'generating' OR r.attempts <> p_attempt THEN
    RETURN;
  END IF;
  -- An erasure committed after this attempt was claimed: the dataset may show the erased person. The attempt ends,
  -- the report is queued again (render_report recomputes it) and this attempt's file is queued for deletion.
  IF itap.erased_since(r.organization_id, coalesce(r.claimed_at, r.updated_at)) THEN
    UPDATE itap.reports SET status = 'queued', lease_expires_at = NULL, error = 'subject_erased' WHERE id = r.id;
    PERFORM itap.enqueue_unused_files(r.organization_id, ARRAY(
      SELECT f.id FROM storage.files f
      WHERE f.id = p_file AND f.bucket_id = r.organization_id::text AND f.metadata ->> 'report_id' = r.id::text),
      'erasure_fence:reports');
    RETURN;
  END IF;
  UPDATE itap.reports
  SET status = 'completed', file_id = p_file, summary = p_summary,
      generated_at = coalesce(CASE WHEN itap.seed_context()
                                   THEN nullif(current_setting('itap.seed_report_at', true), '')::timestamptz END, now()),
      error = NULL,
      lease_expires_at = NULL
  WHERE id = r.id
  RETURNING * INTO r;

  ev.organization_id := r.organization_id;
  ev.event_type := 'report_generated';
  ev.severity := 'info';
  ev.facility_id := CASE
    WHEN r.incident_id IS NOT NULL THEN (SELECT i.facility_id FROM itap.incidents i
                                        WHERE i.organization_id = r.organization_id AND i.id = r.incident_id)
    ELSE (SELECT min(x.facility_id::text)::uuid FROM itap.report_facilities x
          WHERE x.organization_id = r.organization_id AND x.report_id = r.id
          HAVING count(*) = 1)
  END;
  ev.title := 'Report generated: ' || r.code || ' ' || r.title;
  ev.payload := jsonb_build_object(
    'report_id', r.id, 'code', r.code, 'report_type', r.report_type, 'format', r.format, 'title', r.title,
    'schedule_id', r.schedule_id, 'incident_id', r.incident_id, 'file_id', r.file_id,
    'start_date', r.start_date, 'end_date', r.end_date);
  ev.dedup_key := 'report:' || r.id || ':report_generated';
  ev.occurred_at := r.generated_at;
  ev_id := itap.emit_event(ev);
  fresh := ev_id IS NOT NULL;
  IF NOT fresh THEN
    SELECT e.id INTO ev_id FROM itap.events e WHERE e.organization_id = r.organization_id AND e.dedup_key = ev.dedup_key;
  END IF;

  IF r.incident_id IS NOT NULL THEN
    INSERT INTO itap.incident_activities (organization_id, incident_id, actor_id, kind, details, occurred_at)
    VALUES (r.organization_id, r.incident_id, r.created_by, 'report_generated',
            jsonb_build_object('report_id', r.id, 'code', r.code, 'format', r.format), r.generated_at);
  END IF;

  IF r.schedule_id IS NOT NULL THEN
    SELECT * INTO s FROM itap.report_schedules x WHERE x.organization_id = r.organization_id AND x.id = r.schedule_id;
    IF FOUND AND s.channel IN ('email', 'in_app') AND s.recipient_group_id IS NOT NULL THEN
      content := itap.report_delivery_content(r);
      FOR target IN
        SELECT gm.external_address,
               CASE WHEN gm.user_id IS NOT NULL
                    THEN itap.notification_recipient(r.organization_id, gm.user_id, r.generated_at, true) END AS user_id
        FROM itap.recipient_group_members gm
        WHERE gm.organization_id = r.organization_id AND gm.group_id = s.recipient_group_id AND gm.channel = s.channel
        ORDER BY gm.id
      LOOP
        CONTINUE WHEN target.user_id IS NULL AND target.external_address IS NULL;
        delivery := NULL;
        INSERT INTO itap.notification_deliveries (
          organization_id, report_id, event_id, recipient_user_id, recipient_address, channel, priority, status,
          content, sent_at, delivered_at
        ) VALUES (
          r.organization_id, r.id, ev_id, target.user_id, CASE WHEN target.user_id IS NULL THEN target.external_address END,
          s.channel, 'low', CASE WHEN s.channel = 'in_app' THEN 'delivered' ELSE 'pending' END, content,
          CASE WHEN s.channel = 'in_app' THEN now() END, CASE WHEN s.channel = 'in_app' THEN now() END
        )
        ON CONFLICT DO NOTHING
        RETURNING id INTO delivery;
        IF delivery IS NOT NULL AND s.channel = 'in_app' AND target.user_id IS NOT NULL THEN
          INSERT INTO itap.user_notifications (organization_id, user_id, delivery_id, event_id, title, body, priority)
          VALUES (r.organization_id, target.user_id, delivery, ev_id, content ->> 'title', content ->> 'body', 'low')
          ON CONFLICT (organization_id, delivery_id) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF fresh THEN
    PERFORM itap.finish_events(r.organization_id, ARRAY[ev_id]);
  END IF;
  RETURN NEXT r;
END;
$function$
;

CREATE OR REPLACE FUNCTION itap.complete_export_job(p_job uuid, p_attempt integer, p_file uuid, p_row_count integer, p_truncated boolean, p_watermark timestamp with time zone, p_watermark_id uuid, p_row_ids uuid[])
 RETURNS SETOF itap.export_jobs
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  j itap.export_jobs;
  org uuid;
BEGIN
  SELECT x.organization_id INTO org FROM itap.export_jobs x WHERE x.id = p_job;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  -- Waits for a running erasure of the organization to commit (fence before the row lock: dsr_erase deletes jobs).
  PERFORM itap.erasure_fence_shared(org, true);
  SELECT * INTO j FROM itap.export_jobs x WHERE x.id = p_job AND x.status = 'running' AND x.attempts = p_attempt FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.files f WHERE f.id = p_file AND f.bucket_id = j.organization_id::text
                 AND f.metadata ->> 'kind' = 'export' AND f.uploaded_by_user_id = j.requested_by) THEN
    PERFORM itap.raise_code('export_file_invalid');
  END IF;
  -- An erasure committed after this attempt was claimed: the rows may name the erased person. The attempt ends,
  -- the job is queued again (the re-run reads the erased state) and this file is queued for deletion.
  IF itap.erased_since(j.organization_id, coalesce(j.claimed_at, j.updated_at)) THEN
    UPDATE itap.export_jobs SET status = 'queued', lease_expires_at = NULL, error = 'subject_erased' WHERE id = j.id;
    PERFORM itap.enqueue_unused_files(j.organization_id, ARRAY[p_file], 'erasure_fence:export_jobs');
    RETURN;
  END IF;
  -- The cursor moves only with an exported row (a run without rows keeps the starting pair).
  UPDATE itap.export_jobs
  SET status = 'completed', file_id = p_file, row_count = greatest(coalesce(p_row_count, 0), 0),
      truncated = coalesce(p_truncated, false), finished_at = now(), lease_expires_at = NULL,
      watermark_to = CASE WHEN j.mode = 'incremental' THEN coalesce(p_watermark, j.watermark_from) END,
      watermark_to_id = CASE WHEN j.mode = 'incremental' THEN CASE WHEN p_watermark IS NULL THEN j.watermark_from_id ELSE p_watermark_id END END,
      subject_ids = itap.export_subject_ids(j.organization_id, j.entity, coalesce(p_row_ids, '{}'))
  WHERE id = j.id
  RETURNING * INTO j;
  IF j.mode = 'incremental' AND p_watermark IS NOT NULL THEN
    UPDATE itap.export_definitions d
    SET watermark = p_watermark, watermark_id = p_watermark_id
    WHERE d.organization_id = j.organization_id AND d.id = j.definition_id AND d.mode = 'incremental'
      AND d.entity = j.entity AND d.filters = j.filters
      AND d.watermark IS NOT DISTINCT FROM j.watermark_from AND d.watermark_id IS NOT DISTINCT FROM j.watermark_from_id;
  END IF;
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes)
  VALUES (j.organization_id, j.requested_by, 'export', 'export_jobs', j.id,
          jsonb_build_object('definition_id', j.definition_id, 'entity', j.entity, 'format', j.format, 'mode', j.mode,
                             'row_count', j.row_count, 'truncated', j.truncated, 'file_id', j.file_id));
  RETURN NEXT j;
END;
$function$
;

CREATE OR REPLACE FUNCTION itap.dsr_erase(p_request uuid, p_attempt integer)
 RETURNS SETOF itap.data_subject_requests
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  r itap.data_subject_requests := itap.dsr_fenced(p_request, p_attempt, ARRAY['erasure']);
  classes constant text[] := ARRAY['access_decisions', 'auth_evidence', 'auth_attempts', 'deliveries', 'webhook_deliveries',
    'events', 'detections', 'locations', 'sessions', 'search_history', 'bulk_jobs', 'export_jobs'];
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
  -- Erasure fence: claims and completions of reports / export jobs of the organization wait (or skip) until commit.
  PERFORM itap.erasure_fence_exclusive(org);
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
    -- An HR-synced person must not come back with the next sync: suppression key, not the identifier.
    IF prof.source_integration_id IS NOT NULL AND prof.external_id IS NOT NULL THEN
      INSERT INTO itap.integration_suppressions (organization_id, integration_id, key_hash, reason)
      VALUES (org, prof.source_integration_id, itap.integration_suppression_key(prof.source_integration_id, prof.external_id),
              'dsr:' || r.code)
      ON CONFLICT (organization_id, integration_id, key_hash) DO NOTHING;
      PERFORM itap.dsr_step(r, 'integration_suppressed');
    END IF;
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
  SET status = 'completed', completed_at = clock_timestamp(), partial = cardinality(retained) > 0, lease_expires_at = NULL
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
