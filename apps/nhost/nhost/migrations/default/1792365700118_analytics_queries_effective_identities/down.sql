-- Restores the definitions of 1792365700114.
CREATE OR REPLACE FUNCTION itap.facility_occupancy_now(hasura_session json, p_facility uuid)
RETURNS SETOF itap_results.facility_occupancy_rows
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH f AS (
    SELECT f.* FROM itap.facilities f
    WHERE f.organization_id = itap.session_organization(hasura_session) AND f.id = p_facility
  ),
  occ AS (
    SELECT o.area_id, a.path FROM itap.area_occupancy o
    JOIN f ON f.organization_id = o.organization_id AND f.id = o.facility_id
    JOIN itap.areas a ON a.organization_id = o.organization_id AND a.id = o.area_id
  )
  SELECT f.organization_id, f.id, NULL::uuid, NULL::uuid, f.name, NULL::integer,
         (SELECT count(*) FROM occ)::integer, (SELECT count(*) FROM occ)::integer
  FROM f
  UNION ALL
  SELECT a.organization_id, a.facility_id, a.id, a.parent_id, a.name, a.capacity,
         (SELECT count(*) FROM occ WHERE occ.path @> ARRAY[a.id])::integer,
         (SELECT count(*) FROM occ WHERE occ.area_id = a.id)::integer
  FROM f JOIN itap.areas a ON a.organization_id = f.organization_id AND a.facility_id = f.id;
$$;

CREATE OR REPLACE FUNCTION itap.dashboard_kpis(hasura_session json)
RETURNS SETOF itap_results.dashboard_kpi_rows
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
  me constant uuid := itap.session_user_id(hasura_session);
  tz text;
  today date;
  day_start timestamptz;
BEGIN
  SELECT o.timezone INTO tz FROM itap.organizations o WHERE o.id = org;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  today := (now() AT TIME ZONE tz)::date;
  day_start := today::timestamp AT TIME ZONE tz;
  RETURN QUERY
  WITH eff AS MATERIALIZED (SELECT * FROM itap.effective_identities(org)),
  incidents AS (
    SELECT i.severity FROM itap.incidents i
    WHERE i.organization_id = org AND i.status NOT IN ('resolved', 'closed')
  ),
  movers AS (
    SELECT s.id, s.code, s.name, t.member_count, coalesce(y.member_count, 0) AS previous_count,
           t.member_count - coalesce(y.member_count, 0) AS change
    FROM itap.segments s
    JOIN itap.segment_daily_stats t ON t.organization_id = org AND t.segment_id = s.id AND t.day = today
    LEFT JOIN itap.segment_daily_stats y ON y.organization_id = org AND y.segment_id = s.id AND y.day = today - 1
    WHERE s.organization_id = org AND t.member_count <> coalesce(y.member_count, 0)
    ORDER BY abs(t.member_count - coalesce(y.member_count, 0)) DESC, s.name
    LIMIT 5
  )
  SELECT org, now(), today,
    (SELECT count(DISTINCT e.effective_id) FROM itap.tracking_sessions s JOIN eff e ON e.identity_id = s.identity_id
     WHERE s.organization_id = org AND s.started_at <= now()
       AND coalesce(s.ended_at, s.last_detected_at) >= day_start)::integer,
    (SELECT count(DISTINCT e.effective_id) FROM itap.area_occupancy o JOIN eff e ON e.identity_id = o.identity_id
     WHERE o.organization_id = org)::integer,
    (SELECT count(*) FROM incidents)::integer,
    (SELECT count(*) FROM incidents WHERE severity = 'critical')::integer,
    (SELECT count(*) FROM incidents WHERE severity = 'high')::integer,
    (SELECT count(*) FROM incidents WHERE severity = 'medium')::integer,
    (SELECT count(*) FROM incidents WHERE severity = 'low')::integer,
    (SELECT count(*) FROM incidents WHERE severity = 'info')::integer,
    (SELECT count(*) FROM itap.devices d WHERE d.organization_id = org AND d.status <> 'inactive'
       AND (d.health_status = 'critical' OR d.status = 'connection_error'))::integer,
    ((SELECT count(*) FROM itap.notification_deliveries d
      WHERE d.organization_id = org AND d.status IN ('failed', 'dead_letter') AND d.created_at >= now() - interval '24 hours'
        AND (d.subscription_id IS NULL OR d.recipient_user_id = me))
     + (SELECT count(*) FROM itap.webhook_deliveries w
        WHERE w.organization_id = org AND w.status IN ('failed', 'dead_letter') AND w.created_at >= now() - interval '24 hours'))::integer,
    coalesce((SELECT jsonb_agg(jsonb_build_object('segment_id', m.id, 'code', m.code, 'name', m.name,
                                                  'member_count', m.member_count, 'previous_count', m.previous_count,
                                                  'change', m.change)
                               ORDER BY abs(m.change) DESC, m.name)
              FROM movers m), '[]'::jsonb);
END;
$$;
