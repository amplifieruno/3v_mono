/**
 * Face authentication decision benchmark (slice 9 task 2) as one DO block on the seeded organization: registers a
 * production app bound to the first facility, every segment and one access point (identification + verification),
 * then records `calls` decisions through itap.auth_decide(p_record => true), each under a fresh session. Probes are
 * stored templates plus uniform noise (+/- 0.02..0.10 per dimension by call, re-normalized: similarity ~0.96..0.56, so
 * all outcomes occur); every 3rd call is a verification of
 * the template's identity, every 4th narrowed to the bound access point. Latency: the full call
 * measured with clock_timestamp (population incl. engine dry runs, both retrieval stages, attempt, session, digest,
 * event and Stage C). The block always raises `AUTH_BENCH {flat json}`, so the whole transaction is rolled back.
 */

export type AuthBenchmarkStats = {
  calls: number;
  population: number;
  templates: number;
  success: number;
  partial_match: number;
  failure: number;
  verification: number;
  narrowed: number;
  call_p50_ms: number;
  call_p95_ms: number;
  call_max_ms: number;
  narrowed_p95_ms: number;
  stage1_p95_ms: number;
  stage2_p95_ms: number;
};

export function authBenchmarkSql(org: string, calls: number): string {
  return `DO $bench$
DECLARE
  org uuid := '${org}';
  app uuid;
  fac uuid;
  ap uuid;
  probes record;
  tpl_ids uuid[];
  tpl_identity uuid[];
  tpl_vec vector[];
  sess uuid;
  k integer;
  probe vector;
  mode text;
  claimed uuid;
  point uuid;
  r itap.auth_decision;
  t timestamptz;
  call_ms numeric[] := '{}';
  narrowed_ms numeric[] := '{}';
  ids uuid[] := '{}';
  stats jsonb;
BEGIN
  SELECT f.id INTO fac FROM itap.facilities f WHERE f.organization_id = org ORDER BY f.created_at, f.id LIMIT 1;
  -- The access point with the most granted seeded decisions (the narrowing then keeps a part of the population).
  SELECT a.id INTO ap FROM itap.access_points a WHERE a.organization_id = org AND a.facility_id = fac
  ORDER BY (SELECT count(*) FROM itap.access_decisions d WHERE d.organization_id = org AND d.access_point_id = a.id
              AND d.result = 'granted') DESC, a.id
  LIMIT 1;
  INSERT INTO itap.client_applications (organization_id, name, platform, threshold, threshold_min, threshold_max)
  VALUES (org, 'Benchmark app ' || gen_random_uuid(), 'kiosk', 0.6, 0.5, 0.9) RETURNING id INTO app;
  INSERT INTO itap.client_application_modes (organization_id, application_id, mode)
  VALUES (org, app, 'identification'), (org, app, 'verification');
  INSERT INTO itap.client_application_attributes (organization_id, application_id, attribute)
  VALUES (org, app, 'display_name'), (org, app, 'segments');
  INSERT INTO itap.client_application_facilities (organization_id, application_id, facility_id) VALUES (org, app, fac);
  INSERT INTO itap.client_application_segments (organization_id, application_id, segment_id)
  SELECT org, app, s.id FROM itap.segments s WHERE s.organization_id = org;
  INSERT INTO itap.client_application_access_points (organization_id, application_id, access_point_id) VALUES (org, app, ap);

  SELECT array_agg(e.id ORDER BY e.id), array_agg(e.identity_id ORDER BY e.id), array_agg(e.embedding ORDER BY e.id)
  INTO tpl_ids, tpl_identity, tpl_vec
  FROM itap.identity_embeddings e
  WHERE e.organization_id = org AND e.is_template AND e.identity_id IN (SELECT itap.auth_population(org, app, NULL, now()));

  FOR i IN 1..${calls} LOOP
    k := 1 + i % cardinality(tpl_ids);
    probe := l2_normalize((SELECT array_agg(x + (random() - 0.5) * 2 * (0.02 + (i % 5) * 0.02) ORDER BY n)
                           FROM unnest(tpl_vec[k]::real[]) WITH ORDINALITY AS u (x, n))::vector);
    mode := CASE WHEN i % 3 = 0 THEN 'verification' ELSE 'identification' END;
    claimed := CASE WHEN mode = 'verification' THEN tpl_identity[k] END;
    point := CASE WHEN i % 4 = 0 THEN ap END;
    INSERT INTO itap.authentication_sessions (organization_id, application_id, mode, claimed_identity_id, access_point_id,
                                              device_ref, nonce_hash, expires_at)
    VALUES (org, app, mode, claimed, point, 'bench', md5(random()::text), now() + interval '5 minutes') RETURNING id INTO sess;
    t := clock_timestamp();
    r := itap.auth_decide(org, app, sess, mode, claimed, point, probe, '{"model_version":"bench"}'::jsonb,
                          jsonb_build_object('outcome', 'passed', 'sequence_digest', md5(random()::text)), NULL, now(), true);
    call_ms := call_ms || (extract(epoch FROM clock_timestamp() - t) * 1000)::numeric;
    IF point IS NOT NULL THEN
      narrowed_ms := narrowed_ms || (extract(epoch FROM clock_timestamp() - t) * 1000)::numeric;
    END IF;
    ids := ids || r.attempt_id;
  END LOOP;

  SELECT jsonb_build_object(
    'calls', count(*),
    'population', (SELECT count(*) FROM itap.auth_population(org, app, NULL, now())),
    'templates', cardinality(tpl_ids),
    'success', count(*) FILTER (WHERE a.outcome = 'success'),
    'partial_match', count(*) FILTER (WHERE a.outcome = 'partial_match'),
    'failure', count(*) FILTER (WHERE a.outcome = 'failure'),
    'verification', count(*) FILTER (WHERE a.mode = 'verification'),
    'narrowed', count(*) FILTER (WHERE a.access_point_id IS NOT NULL),
    'call_p50_ms', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY c)::numeric, 3) FROM unnest(call_ms) c),
    'call_p95_ms', (SELECT round(percentile_cont(0.95) WITHIN GROUP (ORDER BY c)::numeric, 3) FROM unnest(call_ms) c),
    'call_max_ms', (SELECT round(max(c), 3) FROM unnest(call_ms) c),
    'narrowed_p95_ms', (SELECT round(percentile_cont(0.95) WITHIN GROUP (ORDER BY c)::numeric, 3) FROM unnest(narrowed_ms) c),
    'stage1_p95_ms', round(percentile_cont(0.95) WITHIN GROUP (ORDER BY a.retrieval_ms)::numeric, 3),
    'stage2_p95_ms', round(percentile_cont(0.95) WITHIN GROUP (ORDER BY a.comparison_ms)::numeric, 3)
  ) INTO stats
  FROM itap.authentication_attempts a WHERE a.organization_id = org AND a.id = ANY (ids);
  RAISE EXCEPTION 'AUTH_BENCH %', stats::text;
END
$bench$;`;
}
