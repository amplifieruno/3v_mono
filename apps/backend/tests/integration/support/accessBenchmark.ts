/**
 * Access decision benchmark (slice 8 task 2) as one DO block: publishes seven representative policies through the real
 * submit / approve functions (two members), adds grants, covering the allow, deny, grant (incl. single-use), no_rule and person paths, then records `calls` decisions through
 * itap.evaluate_access(p_record => true) across the organization's access points, alternating identity-only and
 * profile-only requests. Latency: `latency_ms` as stored by the engine (evaluation) and the full call measured with
 * clock_timestamp around it (incl. decision insert, event and Stage C fan-out). The block always raises
 * `ACCESS_BENCH {flat json}`, so the whole transaction is rolled back.
 */

export type BenchmarkStats = {
  calls: number;
  policies: number;
  single_use_consumed: number;
  granted: number;
  denied: number;
  /** `reason=count/p95:ms` per decision path, comma-separated. */
  reasons: string;
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_max_ms: number;
  call_p50_ms: number;
  call_p95_ms: number;
  call_max_ms: number;
};

export function benchmarkSql(org: string, calls: number): string {
  return `DO $bench$
DECLARE
  org uuid := '${org}';
  members uuid[];
  s1 json;
  s2 json;
  fac uuid;
  aps uuid[];
  profiles uuid[];
  identities uuid[];
  seg uuid;
  pol uuid;
  ver uuid;
  spec record;
  r itap.access_evaluation;
  t timestamptz;
  call_ms numeric[] := '{}';
  ids uuid[] := '{}';
  stats jsonb;
BEGIN
  SELECT array_agg(m.user_id ORDER BY m.user_id) INTO members FROM itap.organization_members m
  WHERE m.organization_id = org AND m.status = 'active';
  s1 := json_build_object('x-hasura-organization-id', org, 'x-hasura-user-id', members[1]);
  s2 := json_build_object('x-hasura-organization-id', org, 'x-hasura-user-id', members[2]);
  SELECT f.id INTO fac FROM itap.facilities f WHERE f.organization_id = org ORDER BY f.created_at, f.id LIMIT 1;
  SELECT array_agg(a.id ORDER BY a.id) INTO aps FROM itap.access_points a WHERE a.organization_id = org AND a.facility_id = fac;
  SELECT array_agg(x.id) INTO profiles FROM (SELECT p.id FROM itap.profiles p WHERE p.organization_id = org ORDER BY p.id LIMIT 80) x;
  SELECT array_agg(x.id) INTO identities
  FROM (SELECT i.id FROM itap.identities i WHERE i.organization_id = org ORDER BY i.id LIMIT 80) x;
  SELECT s.id INTO seg FROM itap.segments s WHERE s.organization_id = org AND s.target = 'profiles'
  ORDER BY s.member_count DESC, s.id LIMIT 1;

  -- Targets are arrays (a version may cover several access points); paths: allow, deny, grant, no_rule, others.
  FOR spec IN SELECT * FROM (VALUES
    (1, 'allow', 100, NULL::jsonb, NULL::numeric, jsonb_build_object('profile_type', 'employee'),
       jsonb_build_array(jsonb_build_object('access_point_id', aps[4]), jsonb_build_object('access_point_id', aps[5]),
                         jsonb_build_object('access_point_id', aps[6]))),
    (2, 'allow', 150, '[{"days":[1,2,3,4,5],"from":"07:00","to":"21:00"}]'::jsonb, 0.5::numeric,
       jsonb_build_object('profile_type', 'contractor'), jsonb_build_array(jsonb_build_object('facility_id', fac))),
    (3, 'allow', 200, NULL, NULL, jsonb_build_object('segment_id', seg), jsonb_build_array(jsonb_build_object('facility_id', fac))),
    (4, 'deny', 300, NULL, NULL, jsonb_build_object('profile_type', 'visitor'),
       jsonb_build_array(jsonb_build_object('access_point_id', aps[1]))),
    (5, 'allow', 250, NULL, NULL, jsonb_build_object('access_level', 'elevated'),
       jsonb_build_array(jsonb_build_object('area_id', (SELECT a.area_id FROM itap.access_points a WHERE a.id = aps[2])))),
    (6, 'deny', 400, '[{"days":[6,7],"from":"00:00","to":"23:59"}]'::jsonb, NULL,
       jsonb_build_object('access_level', 'basic'), jsonb_build_array(jsonb_build_object('access_point_id', aps[3]))),
    (7, 'deny', 350, NULL, NULL, jsonb_build_object('profile_type', 'employee'),
       jsonb_build_array(jsonb_build_object('access_point_id', aps[7])))
  ) AS v (n, effect, priority, schedule, max_risk, subj, targ)
  LOOP
    INSERT INTO itap.access_policies (organization_id, name)
    VALUES (org, 'Benchmark policy ' || spec.n || ' ' || gen_random_uuid()) RETURNING id INTO pol;
    INSERT INTO itap.access_policy_versions (organization_id, policy_id, effect, priority, schedule, max_risk)
    VALUES (org, pol, spec.effect, spec.priority, spec.schedule, spec.max_risk) RETURNING id INTO ver;
    INSERT INTO itap.access_policy_version_subjects (organization_id, version_id, profile_id, segment_id, profile_type, access_level)
    VALUES (org, ver, (spec.subj ->> 'profile_id')::uuid, (spec.subj ->> 'segment_id')::uuid, spec.subj ->> 'profile_type',
            spec.subj ->> 'access_level');
    INSERT INTO itap.access_policy_version_targets (organization_id, version_id, facility_id, area_id, access_point_id)
    SELECT org, ver, (tg.j ->> 'facility_id')::uuid, (tg.j ->> 'area_id')::uuid, (tg.j ->> 'access_point_id')::uuid
    FROM jsonb_array_elements(spec.targ) AS tg (j);
    PERFORM itap.submit_access_policy_version(s1, ver);
    PERFORM itap.approve_access_policy_version(s2, ver);
  END LOOP;

  -- Grants at the access points no employee policy covers (8..10): reusable and single-use (odd).
  INSERT INTO itap.access_grants (organization_id, profile_id, access_point_id, valid_from, valid_until, single_use, reason)
  SELECT org, profiles[g], aps[1 + (7 + k) % cardinality(aps)], now() - interval '1 hour', now() + interval '1 hour', g % 2 = 1,
         'Benchmark'
  FROM generate_series(1, 60) AS g CROSS JOIN generate_series(0, 2) AS k;

  FOR i IN 1..${calls} LOOP
    t := clock_timestamp();
    IF i % 2 = 0 THEN
      r := itap.evaluate_access(org, aps[1 + i % cardinality(aps)], identities[1 + i % cardinality(identities)], NULL, NULL, now(), true);
    ELSE
      r := itap.evaluate_access(org, aps[1 + i % cardinality(aps)], NULL, profiles[1 + (i * 7) % cardinality(profiles)], NULL, now(), true);
    END IF;
    call_ms := call_ms || (extract(epoch FROM clock_timestamp() - t) * 1000)::numeric;
    ids := ids || r.decision_id;
  END LOOP;

  SELECT jsonb_build_object(
    'calls', count(*),
    'policies', (SELECT count(*) FROM itap.access_policies p WHERE p.organization_id = org AND p.current_version_id IS NOT NULL),
    'single_use_consumed', (SELECT count(*) FROM itap.access_grants x
                            WHERE x.organization_id = org AND x.reason = 'Benchmark' AND x.used_at IS NOT NULL),
    'granted', count(*) FILTER (WHERE d.result = 'granted'),
    'denied', count(*) FILTER (WHERE d.result = 'denied'),
    'reasons', (SELECT string_agg(x.reason || '=' || x.n || '/p95:' || x.p95, ',' ORDER BY x.reason)
                FROM (SELECT d2.reason, count(*) AS n,
                             round(percentile_cont(0.95) WITHIN GROUP (ORDER BY d2.latency_ms)::numeric, 3) AS p95
                      FROM itap.access_decisions d2 WHERE d2.id = ANY (ids) GROUP BY 1) x),
    'latency_p50_ms', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY d.latency_ms)::numeric, 3),
    'latency_p95_ms', round(percentile_cont(0.95) WITHIN GROUP (ORDER BY d.latency_ms)::numeric, 3),
    'latency_max_ms', max(d.latency_ms),
    'call_p50_ms', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY c)::numeric, 3) FROM unnest(call_ms) c),
    'call_p95_ms', (SELECT round(percentile_cont(0.95) WITHIN GROUP (ORDER BY c)::numeric, 3) FROM unnest(call_ms) c),
    'call_max_ms', (SELECT round(max(c), 3) FROM unnest(call_ms) c)
  ) INTO stats
  FROM itap.access_decisions d WHERE d.organization_id = org AND d.id = ANY (ids);
  RAISE EXCEPTION 'ACCESS_BENCH %', stats::text;
END
$bench$;`;
}
