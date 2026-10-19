-- Restores the 1792365700172 bodies.
CREATE OR REPLACE FUNCTION itap.terminal_policy_payload(p_device uuid)
RETURNS SETOF itap_results.terminal_policy_payloads
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid;
  t record;
  st itap.organization_settings;
  tz text;
  aps jsonb;
  paths uuid[];
  versions jsonb;
  segs jsonb;
  grants jsonb;
  overrides jsonb;
  content jsonb;
  generated timestamptz := now();
BEGIN
  SELECT d.organization_id INTO org FROM itap.devices d WHERE d.id = p_device;
  SELECT * INTO t FROM itap.policy_terminals(org) x WHERE x.device_id = p_device;
  IF org IS NULL OR t.device_id IS NULL THEN
    RETURN;
  END IF;
  -- Epoch first (like evaluate_access): content read afterwards is at least as new as the recorded epoch.
  SELECT * INTO st FROM itap.organization_settings s WHERE s.organization_id = org;
  SELECT f.timezone INTO tz FROM itap.facilities f WHERE f.organization_id = org AND f.id = t.facility_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'area_id', a.area_id,
                                               'area_path', to_jsonb(ar.path), 'direction', a.direction,
                                               'status', a.status) ORDER BY a.id), '[]'),
         ARRAY(SELECT DISTINCT p FROM itap.access_points a2
               JOIN itap.areas ar2 ON ar2.organization_id = a2.organization_id AND ar2.id = a2.area_id,
               unnest(ar2.path) p
               WHERE a2.organization_id = org AND a2.id = ANY (t.access_point_ids))
  INTO aps, paths
  FROM itap.access_points a
  LEFT JOIN itap.areas ar ON ar.organization_id = a.organization_id AND ar.id = a.area_id
  WHERE a.organization_id = org AND a.id = ANY (t.access_point_ids);

  WITH covering AS (
    SELECT v.* FROM itap.access_policies p
    JOIN itap.access_policy_versions v ON v.organization_id = p.organization_id AND v.id = p.current_version_id
    WHERE p.organization_id = org AND NOT p.is_archived AND p.current_version_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM itap.access_points a
        JOIN itap.areas ar ON ar.organization_id = a.organization_id AND ar.id = a.area_id
        CROSS JOIN LATERAL itap.access_target_match(org, v.id, a.facility_id, ar.path, a.id) m
        WHERE a.organization_id = org AND a.id = ANY (t.access_point_ids))
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'version_id', v.id, 'policy_id', v.policy_id, 'effect', v.effect, 'priority', v.priority,
           'max_risk', v.max_risk, 'schedule', coalesce(v.schedule, '[]'), 'valid_from', v.valid_from,
           'valid_until', v.valid_until,
           'subjects', (SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                          'profile_id', s.profile_id, 'segment_id', s.segment_id, 'profile_type', s.profile_type,
                          'access_level', s.access_level)) ORDER BY s.id), '[]')
                        FROM itap.access_policy_version_subjects s WHERE s.organization_id = org AND s.version_id = v.id),
           'targets', (SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                         'facility_id', x.facility_id, 'area_id', x.area_id, 'access_point_id', x.access_point_id))
                         ORDER BY x.id), '[]')
                       FROM itap.access_policy_version_targets x WHERE x.organization_id = org AND x.version_id = v.id))
         ORDER BY v.priority DESC, (v.effect = 'deny') DESC, v.id), '[]'),
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'segment_id', sg.id, 'target', sg.target,
                   'member_ids', (SELECT coalesce(jsonb_agg(coalesce(m.profile_id, m.identity_id)
                                                            ORDER BY coalesce(m.profile_id, m.identity_id)), '[]')
                                  FROM itap.segment_members m
                                  WHERE m.organization_id = org AND m.segment_id = sg.id AND m.removed_at IS NULL
                                    AND m.added_at <= generated))
                   ORDER BY sg.id), '[]')
          FROM itap.segments sg
          WHERE sg.organization_id = org AND sg.id IN (
            SELECT s.segment_id FROM itap.access_policy_version_subjects s
            WHERE s.organization_id = org AND s.segment_id IS NOT NULL AND s.version_id IN (SELECT c.id FROM covering c)))
  INTO versions, segs
  FROM covering v;

  SELECT coalesce(jsonb_agg(jsonb_build_object('grant_id', g.id, 'profile_id', g.profile_id,
                                               'access_point_id', g.access_point_id, 'area_id', g.area_id,
                                               'valid_from', g.valid_from, 'valid_until', g.valid_until)
                            ORDER BY g.id), '[]')
  INTO grants
  FROM itap.access_grants g
  WHERE g.organization_id = org AND NOT g.single_use AND g.revoked_at IS NULL AND g.valid_until > generated
    AND (g.access_point_id = ANY (t.access_point_ids) OR g.area_id = ANY (paths));

  SELECT coalesce(jsonb_agg(jsonb_build_object('override_id', e.id, 'mode', e.mode, 'started_at', e.started_at,
                                               'ends_at', e.ends_at,
                                               'area_ids', (SELECT coalesce(jsonb_agg(x.area_id ORDER BY x.area_id), '[]')
                                                            FROM itap.emergency_override_areas x
                                                            WHERE x.organization_id = org AND x.override_id = e.id))
                            ORDER BY e.started_at, e.id), '[]')
  INTO overrides
  FROM itap.emergency_overrides e
  WHERE e.organization_id = org AND e.facility_id = t.facility_id AND e.ended_at IS NULL AND e.ends_at > generated
    AND (NOT EXISTS (SELECT 1 FROM itap.emergency_override_areas x WHERE x.organization_id = org AND x.override_id = e.id)
         OR EXISTS (SELECT 1 FROM itap.emergency_override_areas x
                    WHERE x.organization_id = org AND x.override_id = e.id AND x.area_id = ANY (paths)));

  content := jsonb_build_object(
    'organization_id', org, 'device_id', p_device, 'facility_id', t.facility_id, 'timezone', coalesce(tz, 'UTC'),
    'epoch', coalesce(st.policy_epoch, 0), 'urgent_epoch', coalesce(st.policy_urgent_epoch, 0),
    'access_points', aps, 'versions', versions, 'segments', segs, 'grants', grants, 'overrides', overrides,
    'single_use_grants', 'central');
  RETURN QUERY SELECT org, p_device, t.facility_id, coalesce(st.policy_epoch, 0), coalesce(st.policy_urgent_epoch, 0),
    generated, encode(sha256(convert_to(content::text, 'UTF8')), 'hex'),
    octet_length((content || jsonb_build_object('generated_at', generated))::text),
    content || jsonb_build_object('generated_at', generated);
END;
$$;

CREATE OR REPLACE FUNCTION itap.record_terminal_sync(
  p_device uuid, p_epoch bigint, p_urgent boolean, p_forced boolean, p_result text, p_checksum text,
  p_size_bytes integer, p_duration_ms numeric, p_error text DEFAULT NULL
) RETURNS SETOF itap.terminal_policy_syncs
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  d itap.devices;
  row_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO d FROM itap.devices x WHERE x.id = p_device FOR UPDATE;
  IF NOT FOUND OR d.device_type <> 'access_terminal' THEN
    PERFORM itap.raise_code('terminal_not_found');
  END IF;
  IF p_result = 'synced' THEN
    UPDATE itap.devices x
    SET policy_version_synced = greatest(coalesce(x.policy_version_synced, -1), p_epoch), policy_synced_at = now(),
        policy_sync_error = NULL
    WHERE x.organization_id = d.organization_id AND x.id = p_device;
  ELSE
    UPDATE itap.devices x SET policy_sync_error = coalesce(nullif(btrim(coalesce(p_error, '')), ''), p_result)
    WHERE x.organization_id = d.organization_id AND x.id = p_device;
  END IF;
  INSERT INTO itap.terminal_policy_syncs (id, organization_id, facility_id, device_id, epoch, urgent, forced, result,
                                          checksum, size_bytes, duration_ms, error)
  VALUES (row_id, d.organization_id, d.facility_id, p_device, p_epoch, coalesce(p_urgent, false), coalesce(p_forced, false),
          p_result, p_checksum, p_size_bytes, p_duration_ms,
          CASE WHEN p_result <> 'synced' THEN coalesce(nullif(btrim(coalesce(p_error, '')), ''), p_result) END);
  RETURN QUERY SELECT * FROM itap.terminal_policy_syncs x WHERE x.organization_id = d.organization_id AND x.id = row_id;
END;
$$;
CREATE OR REPLACE FUNCTION itap.terminal_sync_status(hasura_session json)
RETURNS SETOF itap_results.terminal_sync_status_rows
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH org AS (SELECT itap.session_organization(hasura_session) AS id)
  SELECT s.organization_id, d.id, d.name, d.facility_id, to_jsonb(t.access_point_ids), d.status, d.health_status,
         t.reachable, d.policy_version_synced, d.policy_synced_at, d.policy_sync_error, s.policy_epoch,
         s.policy_urgent_epoch, s.policy_epoch - coalesce(d.policy_version_synced, 0),
         coalesce(d.policy_version_synced, -1) < s.policy_urgent_epoch, s.policy_urgent_at,
         CASE WHEN coalesce(d.policy_version_synced, -1) < s.policy_urgent_epoch AND s.policy_urgent_at IS NOT NULL
              THEN round(extract(epoch FROM now() - s.policy_urgent_at)::numeric, 1) END,
         s.policy_revocation_bound_seconds,
         coalesce(d.policy_version_synced, -1) >= s.policy_urgent_epoch
           OR s.policy_urgent_at IS NULL
           OR now() - s.policy_urgent_at <= make_interval(secs => s.policy_revocation_bound_seconds)
  FROM org
  JOIN itap.organization_settings s ON s.organization_id = org.id
  CROSS JOIN LATERAL itap.policy_terminals(org.id) t
  JOIN itap.devices d ON d.organization_id = org.id AND d.id = t.device_id
  ORDER BY d.facility_id, d.name, d.id;
$$;
