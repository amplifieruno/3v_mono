-- Restores evaluate_access of 1792365700163_evaluate_access_fix_round1.
DROP FUNCTION itap.evaluate_access(uuid, uuid, uuid, uuid, uuid, timestamptz, boolean, uuid, uuid, boolean);
CREATE FUNCTION itap.evaluate_access(
  p_org uuid,
  p_access_point uuid,
  p_identity uuid,
  p_profile uuid,
  p_device uuid,
  p_at timestamptz,
  p_record boolean,
  p_override_version uuid DEFAULT NULL
) RETURNS itap.access_evaluation
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  started timestamptz := clock_timestamp();
  v_at timestamptz := coalesce(p_at, now());
  ap itap.access_points;
  ap_path uuid[];
  tz text;
  ident uuid;
  linked uuid;
  prof itap.profiles;
  has_profile boolean := false;
  sim_policy uuid;
  dev_id uuid;
  dev_health text;
  dev_ignored uuid;
  person_identities uuid[] := '{}';
  v_over jsonb := '[]';
  v_denials integer := 0;
  c_capacity numeric := 0;
  c_denials numeric := 0;
  c_device numeric := 0;
  c_unknown numeric := 0;
  v_risk numeric;
  o record;
  overrides jsonb := '[]';
  cand record;
  candidates jsonb := '[]';
  grants jsonb := '[]';
  g record;
  consumed uuid;
  decided_version record;
  decided boolean := false;
  schedule_miss boolean := false;
  decided_by text;
  res itap.access_evaluation;
  ev itap.events;
  event_id uuid;
  v_epoch bigint;
BEGIN
  -- The policy epoch this evaluation uses (read first, without locks).
  SELECT s.policy_epoch INTO v_epoch FROM itap.organization_settings s WHERE s.organization_id = p_org;

  -- Inputs (every id resolved inside the organization).
  SELECT * INTO ap FROM itap.access_points a WHERE a.organization_id = p_org AND a.id = p_access_point;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('access_point_not_found');
  END IF;
  SELECT a.path INTO ap_path FROM itap.areas a WHERE a.organization_id = p_org AND a.id = ap.area_id;
  SELECT f.timezone INTO tz FROM itap.facilities f WHERE f.organization_id = p_org AND f.id = ap.facility_id;
  tz := coalesce(tz, 'UTC');
  IF p_identity IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM itap.identities i WHERE i.organization_id = p_org AND i.id = p_identity) THEN
      PERFORM itap.raise_code('identity_not_found');
    END IF;
    ident := itap.effective_identity(p_org, p_identity);
    SELECT i.profile_id INTO linked FROM itap.identities i WHERE i.organization_id = p_org AND i.id = ident;
  END IF;
  IF p_profile IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM itap.profiles p WHERE p.organization_id = p_org AND p.id = p_profile) THEN
      PERFORM itap.raise_code('profile_not_found');
    END IF;
    IF linked IS NOT NULL AND linked <> p_profile THEN
      PERFORM itap.raise_code('identity_profile_mismatch');
    END IF;
  END IF;
  SELECT * INTO prof FROM itap.profiles p WHERE p.organization_id = p_org AND p.id = coalesce(linked, p_profile);
  has_profile := FOUND;
  -- Identities of the person (effective): the presented one plus every identity linked to the profile, so identity
  -- segment subjects match profile-only requests too (a deny on a face segment cannot be bypassed with a badge).
  SELECT coalesce(array_agg(DISTINCT x.id), '{}') INTO person_identities
  FROM (
    SELECT ident AS id WHERE ident IS NOT NULL
    UNION
    SELECT itap.effective_identity(p_org, i.id) FROM itap.identities i
    WHERE has_profile AND i.organization_id = p_org AND i.profile_id = prof.id
  ) x;
  IF p_device IS NOT NULL AND NOT EXISTS (SELECT 1 FROM itap.devices d WHERE d.organization_id = p_org AND d.id = p_device) THEN
    PERFORM itap.raise_code('device_not_found');
  END IF;
  -- A device not bound to the access point is ignored (trace: ignored_device_id); check_access refuses it.
  IF p_device IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM itap.access_point_devices apd
    WHERE apd.organization_id = p_org AND apd.access_point_id = ap.id AND apd.device_id = p_device
  ) THEN
    dev_ignored := p_device;
  END IF;
  IF p_override_version IS NOT NULL THEN
    SELECT v.policy_id INTO sim_policy FROM itap.access_policy_versions v
    WHERE v.organization_id = p_org AND v.id = p_override_version;
    IF NOT FOUND THEN
      PERFORM itap.raise_code('access_policy_version_not_found');
    END IF;
  END IF;

  -- Contextual signals and risk (computed once).
  SELECT coalesce(jsonb_agg(jsonb_build_object('area_id', x.id, 'occupancy', x.occ, 'capacity', x.capacity) ORDER BY x.depth DESC), '[]')
  INTO v_over
  FROM (
    SELECT a.id, a.depth, a.capacity, itap.area_current_occupancy(a) AS occ
    FROM itap.areas a WHERE a.organization_id = p_org AND a.id = ANY (ap_path) AND a.capacity IS NOT NULL
  ) x
  WHERE x.occ >= x.capacity;
  IF has_profile OR ident IS NOT NULL THEN
    SELECT count(*) INTO v_denials FROM (
      SELECT d.id FROM itap.access_decisions d
      WHERE has_profile AND d.organization_id = p_org AND d.profile_id = prof.id AND d.result = 'denied'
        AND d.decided_at >= v_at - interval '10 minutes' AND d.decided_at < v_at
      UNION
      SELECT d.id FROM itap.access_decisions d
      WHERE ident IS NOT NULL AND d.organization_id = p_org AND d.identity_id = ident AND d.result = 'denied'
        AND d.decided_at >= v_at - interval '10 minutes' AND d.decided_at < v_at
    ) x;
  END IF;
  dev_id := coalesce(CASE WHEN dev_ignored IS NULL THEN p_device END, (
    SELECT apd.device_id FROM itap.access_point_devices apd
    WHERE apd.organization_id = p_org AND apd.access_point_id = ap.id AND apd.role = 'terminal'
    ORDER BY apd.device_id LIMIT 1
  ));
  IF dev_id IS NOT NULL THEN
    SELECT d.health_status INTO dev_health FROM itap.devices d WHERE d.organization_id = p_org AND d.id = dev_id;
  END IF;
  c_capacity := CASE WHEN jsonb_array_length(v_over) > 0 THEN 0.3 ELSE 0 END;
  c_denials := least(v_denials * 0.15, 0.45);
  c_device := CASE dev_health WHEN 'warning' THEN 0.15 WHEN 'critical' THEN 0.3 WHEN 'unknown' THEN 0.1 ELSE 0 END;
  c_unknown := CASE WHEN has_profile THEN 0 ELSE 0.4 END;
  v_risk := round(least(1, c_capacity + c_denials + c_device + c_unknown), 3);
  res.risk_score := v_risk;

  -- (1) Emergency overrides covering the access point at the instant.
  FOR o IN
    SELECT e.id, e.mode, e.started_at FROM itap.emergency_overrides e
    WHERE e.organization_id = p_org AND e.facility_id = ap.facility_id
      AND e.started_at <= v_at AND e.ends_at > v_at AND (e.ended_at IS NULL OR e.ended_at > v_at)
      AND (NOT EXISTS (SELECT 1 FROM itap.emergency_override_areas x WHERE x.organization_id = p_org AND x.override_id = e.id)
           OR EXISTS (SELECT 1 FROM itap.emergency_override_areas x
                      WHERE x.organization_id = p_org AND x.override_id = e.id AND x.area_id = ANY (ap_path)))
    -- Life safety: an evacuation opens exits (out/both) even under a lock_all; entries stay locked.
    ORDER BY CASE WHEN e.mode = 'evacuation' AND ap.direction IN ('out', 'both') THEN 0
                  WHEN e.mode = 'lock_all' THEN 1 WHEN e.mode = 'unlock_all' THEN 2 ELSE 3 END, e.started_at DESC, e.id
  LOOP
    IF NOT decided AND (o.mode <> 'evacuation' OR ap.direction IN ('out', 'both')) THEN
      decided := true;
      decided_by := 'override';
      res.override_id := o.id;
      res.result := CASE o.mode WHEN 'lock_all' THEN 'denied' ELSE 'granted' END;
      res.reason := CASE o.mode WHEN 'lock_all' THEN 'override_lock' WHEN 'unlock_all' THEN 'override_unlock'
                                ELSE 'override_evacuation' END;
      overrides := overrides || jsonb_build_object('id', o.id, 'mode', o.mode, 'applied', true);
    ELSE
      overrides := overrides || jsonb_build_object('id', o.id, 'mode', o.mode, 'applied', false);
    END IF;
  END LOOP;

  -- Access point out of service (overrides still apply).
  IF NOT decided AND ap.status <> 'active' THEN
    decided := true;
    decided_by := 'access_point';
    res.result := 'denied';
    res.reason := 'access_point_unavailable';
  END IF;

  -- Person checks.
  IF NOT decided AND NOT has_profile AND ident IS NULL THEN
    decided := true;
    decided_by := 'person';
    res.result := 'denied';
    res.reason := 'unknown_person';
  ELSIF NOT decided AND has_profile AND prof.status <> 'active' THEN
    decided := true;
    decided_by := 'person';
    res.result := 'denied';
    res.reason := 'profile_inactive';
  END IF;

  -- (2) Policy versions (traced in evaluation order; the first full match decides).
  IF NOT decided THEN
    FOR cand IN
      WITH vers AS (
        SELECT v.*, false AS simulated
        FROM itap.access_policies p
        JOIN itap.access_policy_versions v ON v.organization_id = p.organization_id AND v.id = p.current_version_id
        WHERE p.organization_id = p_org AND NOT p.is_archived AND p.current_version_id IS NOT NULL
          AND p.id IS DISTINCT FROM sim_policy
        UNION ALL
        SELECT v.*, true FROM itap.access_policy_versions v WHERE v.organization_id = p_org AND v.id = p_override_version
      )
      SELECT v.id, v.policy_id, v.effect, v.priority, v.max_risk, v.simulated,
             sm.kind AS subject_kind, tm.kind AS target_kind,
             ((v.valid_from IS NULL OR v.valid_from <= v_at) AND (v.valid_until IS NULL OR v_at < v.valid_until)) AS valid,
             CASE WHEN v.schedule IS NULL OR jsonb_array_length(v.schedule) = 0 THEN 'always'
                  WHEN itap.in_windows(v.schedule, tz, v_at) THEN 'in' ELSE 'out' END AS schedule_state
      FROM vers v
      LEFT JOIN LATERAL (
        SELECT CASE WHEN s.profile_id IS NOT NULL THEN 'profile' WHEN s.segment_id IS NOT NULL THEN 'segment'
                    WHEN s.profile_type IS NOT NULL THEN 'profile_type' ELSE 'access_level' END AS kind
        FROM itap.access_policy_version_subjects s
        WHERE s.organization_id = p_org AND s.version_id = v.id
          AND ((has_profile AND s.profile_id = prof.id)
               OR (s.segment_id IS NOT NULL AND EXISTS (
                     SELECT 1 FROM itap.segments sg
                     JOIN itap.segment_members m ON m.organization_id = sg.organization_id AND m.segment_id = sg.id
                     WHERE sg.organization_id = p_org AND sg.id = s.segment_id
                       AND CASE sg.target WHEN 'identities' THEN m.identity_id = ANY (person_identities)
                                          ELSE has_profile AND m.profile_id = prof.id END
                       AND m.added_at <= v_at AND (m.removed_at IS NULL OR m.removed_at > v_at)))
               OR (has_profile AND s.profile_type = prof.profile_type)
               OR (has_profile AND itap.access_rank(prof.access_level) >= itap.access_rank(s.access_level)))
        ORDER BY CASE WHEN s.profile_id IS NOT NULL THEN 1 WHEN s.segment_id IS NOT NULL THEN 2
                      WHEN s.profile_type IS NOT NULL THEN 3 ELSE 4 END, s.id
        LIMIT 1
      ) sm ON true
      LEFT JOIN LATERAL (
        SELECT CASE WHEN t.access_point_id IS NOT NULL THEN 'access_point' WHEN t.area_id IS NOT NULL THEN 'area'
                    ELSE 'facility' END AS kind
        FROM itap.access_policy_version_targets t
        WHERE t.organization_id = p_org AND t.version_id = v.id
          AND (t.access_point_id = ap.id OR t.area_id = ANY (ap_path) OR t.facility_id = ap.facility_id)
        ORDER BY CASE WHEN t.access_point_id IS NOT NULL THEN 1 WHEN t.area_id IS NOT NULL THEN 2 ELSE 3 END, t.id
        LIMIT 1
      ) tm ON true
      ORDER BY v.priority DESC, (v.effect = 'deny') DESC, v.id
    LOOP
      candidates := candidates || jsonb_build_object(
        'version_id', cand.id, 'policy_id', cand.policy_id, 'effect', cand.effect, 'priority', cand.priority,
        'max_risk', cand.max_risk, 'subject', cand.subject_kind, 'target', cand.target_kind, 'valid', cand.valid,
        'schedule', cand.schedule_state,
        'matched', cand.subject_kind IS NOT NULL AND cand.target_kind IS NOT NULL AND cand.valid AND cand.schedule_state <> 'out',
        'decided', false, 'simulated', cand.simulated);
      IF cand.subject_kind IS NOT NULL AND cand.target_kind IS NOT NULL AND cand.valid THEN
        IF cand.schedule_state = 'out' THEN
          schedule_miss := schedule_miss OR cand.effect = 'allow';
        ELSIF NOT decided THEN
          decided := true;
          decided_by := 'policy';
          candidates := jsonb_set(candidates, ARRAY[(jsonb_array_length(candidates) - 1)::text, 'decided'], 'true');
          res.policy_version_id := cand.id;
          IF cand.effect = 'deny' THEN
            res.result := 'denied';
            res.reason := 'policy_deny';
          ELSIF cand.max_risk IS NOT NULL AND v_risk > cand.max_risk THEN
            res.result := 'denied';
            res.reason := 'risk_exceeded';
          ELSE
            res.result := 'granted';
            res.reason := 'policy_allow';
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- (3) Grants (only when no override, person check or version decided).
  IF NOT decided AND has_profile THEN
    FOR g IN
      SELECT x.id, x.single_use, x.access_point_id, x.area_id, x.valid_until
      FROM itap.access_grants x
      WHERE x.organization_id = p_org AND x.profile_id = prof.id
        AND (x.revoked_at IS NULL OR x.revoked_at > v_at)
        AND x.valid_from <= v_at AND v_at < x.valid_until
        AND (x.access_point_id = ap.id OR x.area_id = ANY (ap_path))
        AND (NOT x.single_use OR x.used_at IS NULL OR (NOT p_record AND x.used_at >= v_at))
      ORDER BY x.single_use, x.valid_until DESC, x.id
    LOOP
      consumed := g.id;
      IF g.single_use AND p_record THEN
        -- Atomic consumption: a concurrent consumer (or revoker) holds the row lock; after it commits the WHERE is
        -- re-checked (used_at, revocation) and a consumed or revoked grant yields no row.
        UPDATE itap.access_grants x SET used_at = v_at
        WHERE x.organization_id = p_org AND x.id = g.id AND x.used_at IS NULL
          AND (x.revoked_at IS NULL OR x.revoked_at > v_at)
        RETURNING x.id INTO consumed;
      END IF;
      grants := grants || jsonb_build_object('id', g.id, 'single_use', g.single_use, 'applied', consumed IS NOT NULL,
                                             'consumed', g.single_use AND p_record AND consumed IS NOT NULL);
      IF consumed IS NOT NULL THEN
        decided := true;
        decided_by := 'grant';
        res.grant_id := g.id;
        res.result := 'granted';
        res.reason := 'grant';
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- (4) Default deny.
  IF NOT decided THEN
    decided_by := 'default';
    res.result := 'denied';
    res.reason := CASE WHEN schedule_miss THEN 'outside_schedule' WHEN NOT has_profile THEN 'unknown_person' ELSE 'no_rule' END;
  END IF;

  res.signals := jsonb_build_object(
    'at', v_at,
    'timezone', tz,
    'person', jsonb_build_object('requested_identity_id', p_identity, 'requested_profile_id', p_profile,
                                 'identity_id', ident, 'profile_id', CASE WHEN has_profile THEN prof.id END,
                                 'profile_status', prof.status, 'profile_type', prof.profile_type,
                                 'access_level', prof.access_level),
    'access_point', jsonb_build_object('id', ap.id, 'facility_id', ap.facility_id, 'area_id', ap.area_id,
                                       'area_path', to_jsonb(ap_path), 'direction', ap.direction),
    'simulated_version_id', p_override_version,
    'epoch', coalesce(v_epoch, 0),
    'overrides', overrides,
    'candidates', candidates,
    'grants', grants,
    'signals', jsonb_build_object('areas_over_capacity', v_over, 'recent_denials', v_denials, 'device_id', dev_id,
                                  'device_health', dev_health, 'ignored_device_id', dev_ignored,
                                  'unknown_identity', NOT has_profile),
    'risk', jsonb_build_object('score', v_risk, 'components', jsonb_build_object(
      'over_capacity', c_capacity, 'recent_denials', c_denials, 'device_health', c_device, 'unknown_identity', c_unknown)),
    'decided_by', decided_by
  );

  IF NOT p_record THEN
    RETURN res;
  END IF;

  -- Recording: decision row, then the event (Stage C through finish_events).
  res.decision_id := gen_random_uuid();
  INSERT INTO itap.access_decisions (
    id, organization_id, facility_id, access_point_id, device_id, identity_id, profile_id, result, reason,
    policy_version_id, grant_id, override_id, risk_score, signals, epoch, latency_ms, decided_at
  ) VALUES (
    res.decision_id, p_org, ap.facility_id, ap.id, CASE WHEN dev_ignored IS NULL THEN p_device END, ident, CASE WHEN has_profile THEN prof.id END, res.result,
    res.reason, res.policy_version_id, res.grant_id, res.override_id, v_risk, res.signals, coalesce(v_epoch, 0),
    round((extract(epoch FROM clock_timestamp() - started) * 1000)::numeric, 3), v_at
  );
  ev.organization_id := p_org;
  ev.facility_id := ap.facility_id;
  ev.area_id := ap.area_id;
  ev.access_point_id := ap.id;
  ev.device_id := CASE WHEN dev_ignored IS NULL THEN p_device END;
  ev.identity_id := ident;
  ev.profile_id := CASE WHEN has_profile THEN prof.id END;
  ev.access_decision_id := res.decision_id;
  ev.event_type := CASE res.result WHEN 'granted' THEN 'access_granted' ELSE 'access_denied' END;
  ev.severity := CASE res.result WHEN 'granted' THEN 'info' ELSE 'low' END;
  ev.title := CASE res.result WHEN 'granted' THEN 'Access granted: ' ELSE 'Access denied: ' END || ap.name;
  ev.payload := jsonb_build_object('reason', res.reason, 'policy_version_id', res.policy_version_id,
                                   'grant_id', res.grant_id, 'override_id', res.override_id, 'risk_score', v_risk);
  ev.dedup_key := 'decision:' || res.decision_id;
  ev.occurred_at := v_at;
  event_id := itap.emit_event(ev);
  IF event_id IS NOT NULL THEN
    PERFORM itap.finish_events(p_org, ARRAY[event_id]);
  END IF;
  RETURN res;
END;
$$;
