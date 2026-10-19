-- Hasura keeps every event-trigger and cron delivery forever (hdb_catalog.event_log, event_invocation_logs,
-- hdb_cron_events, hdb_cron_event_invocation_logs, hdb_scheduled_events, hdb_scheduled_event_invocation_logs); one
-- event per detection (detection_created) grows them by hundreds of MB per day of live recognition. The daily cron
-- purge_trigger_logs deletes finished rows older than p_keep_days through this admin-only function. Generic for every
-- event trigger and cron: only rows Hasura will never touch again are deleted (event_log delivered or failed for
-- good, or archived; cron/scheduled events delivered, error or dead), pending and scheduled rows always stay.

-- Result rows: one per catalog table, with the number of rows deleted. Stores nothing.
CREATE TABLE itap_results.trigger_log_purges (
  log text NOT NULL,
  deleted bigint NOT NULL
);

CREATE FUNCTION itap.purge_trigger_logs(p_at timestamptz, p_keep_days integer DEFAULT 3)
RETURNS SETOF itap_results.trigger_log_purges
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  -- event_log / event_invocation_logs store UTC wall-clock time (timestamp without time zone).
  cutoff timestamptz;
  cutoff_utc timestamp;
  batch_size constant integer := 5000;
  n bigint;
  ev_log bigint := 0;
  ev_inv bigint := 0;
  cron bigint := 0;
  cron_inv bigint := 0;
  sched bigint := 0;
  sched_inv bigint := 0;
  ids text[];
BEGIN
  IF p_at IS NULL OR p_keep_days IS NULL OR p_keep_days < 0 THEN
    PERFORM itap.raise_code('invalid_keep_days');
  END IF;
  cutoff := p_at - make_interval(days => p_keep_days);
  cutoff_utc := cutoff AT TIME ZONE 'UTC';

  -- Event triggers, in batches: invocation logs first (no FK, matched by event_id), then the events.
  LOOP
    SELECT array_agg(l.id) INTO ids FROM (
      SELECT e.id FROM hdb_catalog.event_log e
      WHERE e.created_at < cutoff_utc AND (e.delivered OR e.error OR e.archived)
      LIMIT batch_size
    ) l;
    EXIT WHEN ids IS NULL;
    DELETE FROM hdb_catalog.event_invocation_logs i WHERE i.event_id = ANY (ids);
    GET DIAGNOSTICS n = ROW_COUNT;
    ev_inv := ev_inv + n;
    DELETE FROM hdb_catalog.event_log e WHERE e.id = ANY (ids);
    GET DIAGNOSTICS n = ROW_COUNT;
    ev_log := ev_log + n;
  END LOOP;
  -- Invocation logs whose event is already gone.
  LOOP
    DELETE FROM hdb_catalog.event_invocation_logs i
    WHERE i.id IN (
      SELECT x.id FROM hdb_catalog.event_invocation_logs x
      WHERE x.created_at < cutoff_utc
        AND NOT EXISTS (SELECT 1 FROM hdb_catalog.event_log e WHERE e.id = x.event_id)
      LIMIT batch_size
    );
    GET DIAGNOSTICS n = ROW_COUNT;
    ev_inv := ev_inv + n;
    EXIT WHEN n < batch_size;
  END LOOP;

  -- Cron events (invocation logs go with them: FK ON DELETE CASCADE; counted first).
  LOOP
    SELECT array_agg(c.id) INTO ids FROM (
      SELECT e.id FROM hdb_catalog.hdb_cron_events e
      WHERE e.scheduled_time < cutoff AND e.status IN ('delivered', 'error', 'dead')
      LIMIT batch_size
    ) c;
    EXIT WHEN ids IS NULL;
    SELECT count(*) INTO n FROM hdb_catalog.hdb_cron_event_invocation_logs i WHERE i.event_id = ANY (ids);
    cron_inv := cron_inv + n;
    DELETE FROM hdb_catalog.hdb_cron_events e WHERE e.id = ANY (ids);
    GET DIAGNOSTICS n = ROW_COUNT;
    cron := cron + n;
  END LOOP;

  -- One-off scheduled events (same shape; none are created today, purged for completeness).
  LOOP
    SELECT array_agg(s.id) INTO ids FROM (
      SELECT e.id FROM hdb_catalog.hdb_scheduled_events e
      WHERE e.scheduled_time < cutoff AND e.status IN ('delivered', 'error', 'dead')
      LIMIT batch_size
    ) s;
    EXIT WHEN ids IS NULL;
    SELECT count(*) INTO n FROM hdb_catalog.hdb_scheduled_event_invocation_logs i WHERE i.event_id = ANY (ids);
    sched_inv := sched_inv + n;
    DELETE FROM hdb_catalog.hdb_scheduled_events e WHERE e.id = ANY (ids);
    GET DIAGNOSTICS n = ROW_COUNT;
    sched := sched + n;
  END LOOP;

  RETURN QUERY VALUES
    ('event_log', ev_log), ('event_invocation_logs', ev_inv),
    ('hdb_cron_events', cron), ('hdb_cron_event_invocation_logs', cron_inv),
    ('hdb_scheduled_events', sched), ('hdb_scheduled_event_invocation_logs', sched_inv);
END;
$$;
