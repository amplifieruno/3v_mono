-- Saved search runs (cron run_saved_searches, hourly; spec §8.3). The backend computes next runs from schedule_cron in
-- the organization timezone (5-field subset shared with report schedules). Every function is guarded by
-- `next_run_at = p_run_at` under a row lock, so a retried cron run (same scheduled time) changes nothing.
--   init_saved_search: a scheduled saved search without next_run_at gets its first one (no run).
--   record_saved_search_run: a due run that produced no search request (owner no longer an active member ->
--     skipped / owner_inactive; image missing, or a failure before a request existed -> failed) moves on.
--   finish_saved_search_run: a due run whose search request (run as the owner) finished: completed -> with
--     alert_on_match, one saved_search_match event per identity in this run's results that was not in the previous
--     completed run's results (none before = every result is new), dedup key
--     saved_search:<id>:<identity>:<run day in the organization timezone>; then Stage C (finish_events). The
--     previous run is last_search_request_id, which moves to this request. failed -> last_error, previous run kept.
--     Lock order: saved search row -> event keys (identity id order) -> finish_events (its own order).

CREATE FUNCTION itap.init_saved_search(p_saved_search uuid, p_next_run_at timestamptz) RETURNS SETOF itap.saved_searches
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.saved_searches
  SET next_run_at = p_next_run_at
  WHERE id = p_saved_search AND next_run_at IS NULL AND schedule_cron IS NOT NULL
  RETURNING *;
$$;

CREATE FUNCTION itap.record_saved_search_run(
  p_saved_search uuid, p_run_at timestamptz, p_next_run_at timestamptz, p_status text, p_error text
) RETURNS SETOF itap.saved_searches
LANGUAGE sql VOLATILE
SET search_path = pg_catalog, itap
AS $$
  UPDATE itap.saved_searches
  SET last_run_at = p_run_at, next_run_at = p_next_run_at, last_run_status = p_status, last_error = p_error
  WHERE id = p_saved_search AND next_run_at = p_run_at AND p_status IN ('skipped', 'failed')
  RETURNING *;
$$;

CREATE FUNCTION itap.finish_saved_search_run(
  p_saved_search uuid, p_run_at timestamptz, p_next_run_at timestamptz, p_request uuid
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
    SET last_run_at = p_run_at, next_run_at = p_next_run_at, last_run_status = 'failed', last_error = r.error
    WHERE id = s.id
    RETURNING * INTO s;
    RETURN NEXT s;
    RETURN;
  END IF;

  IF s.alert_on_match THEN
    SELECT to_char(p_run_at AT TIME ZONE o.timezone, 'YYYY-MM-DD') INTO run_day
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
      ev.occurred_at := p_run_at;
      ev_id := itap.emit_event(ev);
      IF ev_id IS NOT NULL THEN
        fresh := fresh || ev_id;
      END IF;
    END LOOP;
  END IF;

  UPDATE itap.saved_searches
  SET last_run_at = p_run_at, next_run_at = p_next_run_at, last_run_status = 'completed', last_error = NULL,
      last_search_request_id = r.id
  WHERE id = s.id
  RETURNING * INTO s;

  IF cardinality(fresh) > 0 THEN
    PERFORM itap.finish_events(s.organization_id, fresh);
  END IF;
  RETURN NEXT s;
END;
$$;
