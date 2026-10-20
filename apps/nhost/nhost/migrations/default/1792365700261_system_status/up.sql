-- System status snapshot for the action get_system_status (spec §8.5; slice 10 task 4). Admin-only (backend), called
-- with the session's organization; the backend adds the live probes (Hasura, InsightFace, storage, stream-server).
--   postgres: connections / max_connections, database size, the 10 largest tables (names and sizes only: platform
--     health, no tenant data).
--   crons: per Hasura cron trigger (hdb_catalog.hdb_cron_events, last 3 days — older logs are purged): last scheduled
--     time due, last delivered, lag = age of the oldest undelivered run due for over 2 minutes, errors in 24 h; status
--     ok / degraded (lag > 5 min or errors) / down (lag > 1 h). Platform-wide by nature.
--   queues: pending work of THIS organization only (deliveries, webhooks, file deletions, bulk / report / export / DSR
--     jobs, running integration syncs).
--   retention: this organization's last (non-dry) retention run.
CREATE TABLE itap_results.system_status_snapshots (
  organization_id uuid NOT NULL,
  snapshot jsonb NOT NULL
);

CREATE FUNCTION itap.system_status(p_org uuid, p_at timestamptz) RETURNS SETOF itap_results.system_status_snapshots
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT p_org, jsonb_build_object(
    'postgres', jsonb_build_object(
      'connections', (SELECT count(*) FROM pg_stat_activity a WHERE a.datname = current_database()),
      'max_connections', current_setting('max_connections')::integer,
      'db_size_bytes', pg_database_size(current_database()),
      'largest_tables', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('table', t.name, 'total_bytes', t.bytes) ORDER BY t.bytes DESC, t.name), '[]'::jsonb)
        FROM (
          SELECT n.nspname || '.' || c.relname AS name, pg_total_relation_size(c.oid) AS bytes
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_toast'
          ORDER BY 2 DESC, 1
          LIMIT 10
        ) t
      )
    ),
    'crons', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
          'name', c.name, 'last_scheduled_at', c.last_due, 'last_delivered_at', c.last_delivered,
          'lag_seconds', c.lag, 'errors_24h', c.errors,
          'status', CASE WHEN c.lag > 3600 THEN 'down' WHEN c.lag > 300 OR c.errors > 0 THEN 'degraded' ELSE 'ok' END
        ) ORDER BY c.name), '[]'::jsonb)
      FROM (
        SELECT e.trigger_name AS name,
               max(e.scheduled_time) FILTER (WHERE e.scheduled_time <= p_at) AS last_due,
               max(e.scheduled_time) FILTER (WHERE e.status = 'delivered') AS last_delivered,
               count(*) FILTER (WHERE e.status IN ('error', 'dead') AND e.scheduled_time > p_at - interval '24 hours') AS errors,
               coalesce(floor(extract(epoch FROM p_at - min(e.scheduled_time) FILTER (
                 WHERE e.status IN ('scheduled', 'locked') AND e.scheduled_time <= p_at - interval '2 minutes')))::bigint, 0) AS lag
        FROM hdb_catalog.hdb_cron_events e
        WHERE e.scheduled_time > p_at - interval '3 days'
        GROUP BY e.trigger_name
      ) c
    ),
    'queues', jsonb_build_object(
      'notification_deliveries', (SELECT count(*) FROM itap.notification_deliveries x
                                  WHERE x.organization_id = p_org AND x.status IN ('pending', 'retrying')),
      'webhook_deliveries', (SELECT count(*) FROM itap.webhook_deliveries x
                             WHERE x.organization_id = p_org AND x.status IN ('pending', 'retrying')),
      'file_deletions', (SELECT count(*) FROM itap.pending_file_deletions x WHERE x.organization_id = p_org),
      'bulk_jobs', (SELECT count(*) FROM itap.bulk_jobs x WHERE x.organization_id = p_org AND x.status IN ('queued', 'running')),
      'reports', (SELECT count(*) FROM itap.reports x WHERE x.organization_id = p_org AND x.status IN ('queued', 'generating')),
      'export_jobs', (SELECT count(*) FROM itap.export_jobs x WHERE x.organization_id = p_org AND x.status IN ('queued', 'running')),
      'data_subject_requests', (SELECT count(*) FROM itap.data_subject_requests x
                                WHERE x.organization_id = p_org AND x.status IN ('received', 'in_progress')),
      'integration_syncs', (SELECT count(*) FROM itap.integration_sync_runs x
                            WHERE x.organization_id = p_org AND x.status = 'running')
    ),
    'retention', (
      SELECT jsonb_build_object('run_id', r.id, 'scheduled_at', r.scheduled_at, 'started_at', r.started_at,
                                'finished_at', r.finished_at, 'status', r.status, 'error', r.error)
      FROM itap.retention_runs r
      WHERE r.organization_id = p_org AND NOT r.dry_run
      ORDER BY r.scheduled_at DESC, r.started_at DESC
      LIMIT 1
    )
  );
$$;
