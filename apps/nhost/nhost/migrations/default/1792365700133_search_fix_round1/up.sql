-- Search fix round 1 (slice 7 task 3 review):
--   1. search_candidates: history filters (facility / seen window, first / last seen) use the effective identity's
--      group: the candidate plus every identity merged into it (completed merges, chains; itap.effective_identities,
--      computed once per call). first_seen = min, last_seen = max over the group; a session of any group member counts.
--      The attribute-search order uses the group's last_seen as well.
--   2. A changed definition (type, filters, image, threshold, max_results, fuzzy) resets last_search_request_id.
--      A run without a baseline (first run, or after such a change) records the baseline and alerts nothing.
--   3. Run timestamps (last_run_at, event occurred_at, run day of the dedup key) use the cron's scheduled time p_at;
--      next_run_at still guards the run.
--   8. check_file_bucket refuses owner-only file kinds (`search`): a search image can never become another entity's
--      file (it would become visible to every org admin).
--   9. The fuzzy cutoff never goes below 0.2 (the minimum threshold).
--  10. last_error is owner-only: computed field owner_last_error (session argument); the column is not selectable.

CREATE OR REPLACE FUNCTION itap.check_file_bucket() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  col text;
  new_value uuid;
  old_value uuid;
  file_bucket text;
  file_kind text;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF NOT (to_jsonb(NEW) ? col) THEN
      RAISE EXCEPTION USING ERRCODE = 'undefined_column', MESSAGE = 'check_file_bucket: unknown column ' || col;
    END IF;
    new_value := (to_jsonb(NEW) ->> col)::uuid;
    IF TG_OP = 'UPDATE' THEN
      old_value := (to_jsonb(OLD) ->> col)::uuid;
    ELSE
      old_value := NULL;
    END IF;
    IF new_value IS NOT NULL AND (TG_OP = 'INSERT' OR new_value IS DISTINCT FROM old_value) THEN
      SELECT f.bucket_id, f.metadata ->> 'kind' INTO file_bucket, file_kind FROM storage.files f WHERE f.id = new_value;
      IF NOT FOUND OR file_bucket IS DISTINCT FROM NEW.organization_id::text THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'file_not_in_org_bucket:' || col;
      END IF;
      IF file_kind = 'search' THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'file_owner_only:' || col;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION itap.search_candidates(p_org uuid, f jsonb)
RETURNS TABLE (id uuid, profile_id uuid, last_seen_at timestamptz)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH eff AS MATERIALIZED (
    SELECT e.identity_id, e.effective_id FROM itap.effective_identities(p_org) e
  ),
  grp AS MATERIALIZED (
    SELECT e.effective_id, min(m.first_seen_at) AS first_seen_at, max(m.last_seen_at) AS last_seen_at
    FROM eff e JOIN itap.identities m ON m.organization_id = p_org AND m.id = e.identity_id
    GROUP BY e.effective_id
  )
  SELECT i.id, i.profile_id, g.last_seen_at
  FROM itap.identities i
  JOIN grp g ON g.effective_id = i.id
  LEFT JOIN itap.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
  WHERE i.organization_id = p_org
    AND i.status <> 'merged'
    AND i.matching_enabled
    AND (NOT f ? 'status' OR i.status IN (SELECT jsonb_array_elements_text(f -> 'status')))
    AND (NOT f ? 'linked' OR (i.profile_id IS NOT NULL) = (f ->> 'linked')::boolean)
    AND (NOT f ? 'profile_type' OR p.profile_type IN (SELECT jsonb_array_elements_text(f -> 'profile_type')))
    AND (NOT f ? 'company_id' OR p.company_id = (f ->> 'company_id')::uuid)
    AND (NOT f ? 'gender' OR i.attributes ->> 'gender' = f ->> 'gender')
    AND (NOT f ? 'age_min' OR i.age >= (f ->> 'age_min')::numeric)
    AND (NOT f ? 'age_max' OR i.age <= (f ->> 'age_max')::numeric)
    AND (NOT f ? 'first_seen_from' OR g.first_seen_at >= (f ->> 'first_seen_from')::timestamptz)
    AND (NOT f ? 'first_seen_to' OR g.first_seen_at <= (f ->> 'first_seen_to')::timestamptz)
    AND (NOT f ? 'last_seen_from' OR g.last_seen_at >= (f ->> 'last_seen_from')::timestamptz)
    AND (NOT f ? 'last_seen_to' OR g.last_seen_at <= (f ->> 'last_seen_to')::timestamptz)
    AND (NOT (f ? 'facility_id' OR f ? 'seen_from' OR f ? 'seen_to') OR EXISTS (
      SELECT 1
      FROM eff e
      JOIN itap.tracking_sessions s ON s.organization_id = p_org AND s.identity_id = e.identity_id
      WHERE e.effective_id = i.id
        AND (NOT f ? 'facility_id' OR s.facility_id = (f ->> 'facility_id')::uuid)
        AND (NOT f ? 'seen_from' OR coalesce(s.ended_at, s.last_detected_at) >= (f ->> 'seen_from')::timestamptz)
        AND (NOT f ? 'seen_to' OR s.started_at <= (f ->> 'seen_to')::timestamptz)));
$$;

CREATE OR REPLACE FUNCTION itap.search_identities(
  p_org uuid,
  p_embedding text,
  p_threshold real,
  p_limit integer,
  p_filters jsonb,
  p_fuzzy boolean DEFAULT false
) RETURNS SETOF itap_results.search_matches
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, itap
AS $$
DECLARE
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  max_rows integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  threshold real;
  cutoff real;
  probe vector(512);
BEGIN
  IF NOT itap.valid_search_filters(f) OR NOT itap.search_filter_refs(p_org, f) THEN
    PERFORM itap.raise_code('search_filters_invalid');
  END IF;

  IF p_embedding IS NULL THEN
    RETURN QUERY
    SELECT p_org, c.id, c.profile_id,
           (row_number() OVER (ORDER BY c.last_seen_at DESC NULLS LAST, c.id))::integer,
           NULL::real, 'exact'::text
    FROM itap.search_candidates(p_org, f) c
    ORDER BY c.last_seen_at DESC NULLS LAST, c.id
    LIMIT max_rows;
    RETURN;
  END IF;

  probe := p_embedding::vector(512);
  SELECT least(greatest(coalesce(p_threshold, 1 - os.recognition_threshold, 0.5), 0.2), 0.95)
  INTO threshold
  FROM (SELECT 1) one
  LEFT JOIN itap.organization_settings os ON os.organization_id = p_org;
  -- The fuzzy band never reaches below the minimum threshold 0.2.
  cutoff := CASE WHEN coalesce(p_fuzzy, false) THEN greatest(threshold - 0.1, 0.2) ELSE threshold END;

  RETURN QUERY
  WITH scored AS (
    SELECT c.id, c.profile_id, (1 - best.distance)::real AS similarity
    FROM itap.search_candidates(p_org, f) c
    CROSS JOIN LATERAL (
      SELECT min(e.embedding <=> probe) AS distance
      FROM itap.identity_embeddings e
      WHERE e.organization_id = p_org AND e.identity_id = c.id AND e.is_template
    ) best
    WHERE best.distance IS NOT NULL AND (1 - best.distance) >= cutoff
  )
  SELECT p_org, s.id, s.profile_id,
         (row_number() OVER (ORDER BY s.similarity DESC, s.id))::integer,
         s.similarity,
         CASE WHEN s.similarity >= threshold + 0.15 THEN 'exact'
              WHEN s.similarity >= threshold THEN 'partial'
              ELSE 'fuzzy' END
  FROM scored s
  ORDER BY s.similarity DESC, s.id
  LIMIT max_rows;
END;
$$;

CREATE OR REPLACE FUNCTION itap.saved_searches_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.search_type IS DISTINCT FROM OLD.search_type
     OR NEW.image_file_id IS DISTINCT FROM OLD.image_file_id THEN
    IF NEW.search_type = 'attribute' AND NEW.image_file_id IS NOT NULL THEN
      PERFORM itap.raise_code('search_image_not_allowed');
    END IF;
    IF NEW.search_type <> 'attribute' AND NEW.image_file_id IS NULL
       AND NOT (TG_OP = 'UPDATE' AND OLD.image_file_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM storage.files f WHERE f.id = OLD.image_file_id)) THEN
      PERFORM itap.raise_code('search_image_required');
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.schedule_cron IS DISTINCT FROM OLD.schedule_cron THEN
    NEW.next_run_at := NULL;
  END IF;
  IF NEW.schedule_cron IS NULL THEN
    NEW.next_run_at := NULL;
  END IF;
  -- Results of another definition are no baseline for new-match alerts.
  IF TG_OP = 'UPDATE'
     AND (NEW.search_type, NEW.filters, NEW.image_file_id, NEW.threshold, NEW.max_results, NEW.fuzzy)
         IS DISTINCT FROM (OLD.search_type, OLD.filters, OLD.image_file_id, OLD.threshold, OLD.max_results, OLD.fuzzy) THEN
    NEW.last_search_request_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION itap.record_saved_search_run(uuid, timestamptz, timestamptz, text, text);
DROP FUNCTION itap.finish_saved_search_run(uuid, timestamptz, timestamptz, uuid);

-- p_run_at: the due next_run_at (guard); p_at: the cron's scheduled time (run timestamps).
CREATE FUNCTION itap.record_saved_search_run(
  p_saved_search uuid, p_run_at timestamptz, p_at timestamptz, p_next_run_at timestamptz, p_status text, p_error text
) RETURNS SETOF itap.saved_searches
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.saved_searches
  SET last_run_at = p_at, next_run_at = p_next_run_at, last_run_status = p_status, last_error = p_error
  WHERE id = p_saved_search AND next_run_at = p_run_at AND p_status IN ('skipped', 'failed')
  RETURNING *;
$$;

-- As before (see *_create_saved_search_runs), except: timestamps use p_at, and a run without a baseline
-- (last_search_request_id NULL: first run, definition changed, baseline removed) alerts nothing.
CREATE FUNCTION itap.finish_saved_search_run(
  p_saved_search uuid, p_run_at timestamptz, p_at timestamptz, p_next_run_at timestamptz, p_request uuid
) RETURNS SETOF itap.saved_searches
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  s itap.saved_searches;
  r itap.search_requests;
  m record;
  ev itap.events;
  ev_id uuid;
  fresh uuid[] := '{}';
  run_day text;
BEGIN
  SELECT * INTO s FROM itap.saved_searches WHERE id = p_saved_search FOR UPDATE;
  IF NOT FOUND OR s.next_run_at IS DISTINCT FROM p_run_at THEN
    RETURN;
  END IF;
  SELECT * INTO r FROM itap.search_requests x
  WHERE x.organization_id = s.organization_id AND x.id = p_request AND x.saved_search_id = s.id;
  IF NOT FOUND OR r.status NOT IN ('completed', 'failed') THEN
    PERFORM itap.raise_code('saved_search_request_not_finished');
  END IF;

  IF r.status = 'failed' THEN
    UPDATE itap.saved_searches
    SET last_run_at = p_at, next_run_at = p_next_run_at, last_run_status = 'failed', last_error = r.error
    WHERE id = s.id
    RETURNING * INTO s;
    RETURN NEXT s;
    RETURN;
  END IF;

  IF s.alert_on_match AND s.last_search_request_id IS NOT NULL THEN
    SELECT to_char(p_at AT TIME ZONE o.timezone, 'YYYY-MM-DD') INTO run_day
    FROM itap.organizations o WHERE o.id = s.organization_id;
    FOR m IN
      SELECT sr.identity_id, sr.profile_id, sr.rank, sr.confidence, sr.match_type, i.code
      FROM itap.search_results sr
      JOIN itap.identities i ON i.organization_id = sr.organization_id AND i.id = sr.identity_id
      WHERE sr.organization_id = s.organization_id AND sr.search_request_id = r.id
        AND NOT EXISTS (
          SELECT 1 FROM itap.search_results prev
          WHERE prev.organization_id = s.organization_id AND prev.search_request_id = s.last_search_request_id
            AND prev.identity_id = sr.identity_id)
      ORDER BY sr.identity_id
    LOOP
      ev := NULL;
      ev.organization_id := s.organization_id;
      ev.event_type := 'saved_search_match';
      ev.severity := 'medium';
      ev.identity_id := m.identity_id;
      ev.profile_id := m.profile_id;
      ev.title := left('Saved search "' || s.name || '" matched ' || m.code, 500);
      ev.payload := jsonb_build_object(
        'saved_search_id', s.id, 'saved_search_name', s.name, 'search_request_id', r.id, 'search_type', r.search_type,
        'rank', m.rank, 'confidence', m.confidence, 'match_type', m.match_type, 'identity_code', m.code);
      ev.dedup_key := 'saved_search:' || s.id || ':' || m.identity_id || ':' || run_day;
      ev.occurred_at := p_at;
      ev_id := itap.emit_event(ev);
      IF ev_id IS NOT NULL THEN
        fresh := fresh || ev_id;
      END IF;
    END LOOP;
  END IF;

  UPDATE itap.saved_searches
  SET last_run_at = p_at, next_run_at = p_next_run_at, last_run_status = 'completed', last_error = NULL,
      last_search_request_id = r.id
  WHERE id = s.id
  RETURNING * INTO s;

  IF cardinality(fresh) > 0 THEN
    PERFORM itap.finish_events(s.organization_id, fresh);
  END IF;
  RETURN NEXT s;
END;
$$;

-- Computed field saved_searches.owner_last_error: the last run error, for the owner only (shared saved searches are
-- readable by the organization; errors may describe the owner's private search image).
CREATE FUNCTION itap.saved_search_owner_last_error(s itap.saved_searches, hasura_session json) RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN s.owner_id::text = lower(hasura_session ->> 'x-hasura-user-id') THEN s.last_error END;
$$;
