-- Slice 9 task 2 fix round 1 (rulings in the plan-09 ledger; amends the facility-population ruling):
--   * Population: only identities linked to an ACTIVE profile, in every branch (identity-target segment members too;
--     facility rule = linked identities whose profile has an enforced allow policy / grant covering the facility or
--     that had a tracking session there within 30 days). Unlinked camera identities never authenticate. Sandbox apps
--     keep their synthetic-only population (synthetic identities can never link to a profile).
--   * Archived segments are ignored (population and the `segments` attribute).
--   * auth_decide: liveness_required and attack outcome not_checked -> failure liveness_failed (after quality and
--     attacks, before matching); strict session binding (claimed identity by claimed_ref_hash, access point; equality
--     including NULL); retrieval_hit NULL for claims outside the population; negative pipeline_ms clamped to 0;
--     sandbox apps emit no events (also on review).

CREATE OR REPLACE FUNCTION itap.auth_population_eval(
  p_org uuid, p_app uuid, p_access_point uuid, p_at timestamptz, OUT identity_ids uuid[], OUT scope jsonb
)
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap, public
-- Custom plans (see auth_decide): the generic plan of the array-parameter queries is ~20x slower here. The engine dry
-- runs of step 5 keep their own force_generic_plan (set by evaluate_access).
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  v_at timestamptz := coalesce(p_at, now());
  app itap.client_applications;
  segs uuid[];
  facs uuid[];
  n_matchable integer;
  g_eff uuid[];
  g_member uuid[];
  g_profile uuid[];
  via_segments uuid[] := '{}';
  via_facilities uuid[] := '{}';
  united uuid[];
  rostered uuid[];
  allowed uuid[];
BEGIN
  SELECT * INTO app FROM itap.client_applications a WHERE a.organization_id = p_org AND a.id = p_app;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('client_application_not_found');
  END IF;
  IF p_access_point IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM itap.client_application_access_points b
    WHERE b.organization_id = p_org AND b.application_id = p_app AND b.access_point_id = p_access_point
  ) THEN
    PERFORM itap.raise_code('access_point_not_bound');
  END IF;
  SELECT coalesce(array_agg(b.segment_id ORDER BY b.segment_id), '{}') INTO segs
  FROM itap.client_application_segments b
  JOIN itap.segments sg ON sg.organization_id = b.organization_id AND sg.id = b.segment_id AND sg.status <> 'archived'
  WHERE b.organization_id = p_org AND b.application_id = p_app;
  SELECT coalesce(array_agg(b.facility_id ORDER BY b.facility_id), '{}') INTO facs
  FROM itap.client_application_facilities b WHERE b.organization_id = p_org AND b.application_id = p_app;

  -- Matchable identities (step 3 applied first: the work scales with the gallery, not with history) with their merge
  -- groups (the identity plus every merged identity whose effective identity it is), then steps 1 and 2 per group.
  WITH matchable AS MATERIALIZED (
    SELECT i.id, i.profile_id
    FROM itap.identity_centroids c
    JOIN itap.identities i ON i.organization_id = c.organization_id AND i.id = c.identity_id
    LEFT JOIN itap.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
    WHERE c.organization_id = p_org
      AND i.status NOT IN ('merged', 'archived') AND i.matching_enabled
      AND i.is_synthetic = app.is_sandbox
      AND (app.is_sandbox OR coalesce(p.status = 'active', false))
  )
  SELECT coalesce(array_agg(y.eff), '{}'), coalesce(array_agg(y.member), '{}'), coalesce(array_agg(y.profile_id), '{}')
  INTO g_eff, g_member, g_profile
  FROM (
    SELECT m.id AS eff, m.id AS member, m.profile_id FROM matchable m
    UNION ALL
    SELECT x.eff, x.id, x.profile_id
    FROM (
      SELECT i.id, i.profile_id, itap.effective_identity(p_org, i.id) AS eff
      FROM itap.identities i WHERE i.organization_id = p_org AND i.status = 'merged'
    ) x
    WHERE x.eff IN (SELECT m.id FROM matchable m)
  ) y;
  SELECT count(DISTINCT e) INTO n_matchable FROM unnest(g_eff) AS e;

  -- 1. Segments (membership open at v_at; identity rows of any group member, profile rows of their profiles).
  IF cardinality(segs) > 0 THEN
    SELECT coalesce(array_agg(DISTINCT g.eff), '{}') INTO via_segments
    FROM unnest(g_eff, g_member, g_profile) AS g (eff, member, profile_id)
    WHERE EXISTS (
        SELECT 1 FROM itap.segment_members m
        WHERE m.organization_id = p_org AND m.segment_id = ANY (segs) AND m.identity_id = g.member
          AND m.added_at <= v_at AND (m.removed_at IS NULL OR m.removed_at > v_at))
      OR (g.profile_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM itap.segment_members m
        WHERE m.organization_id = p_org AND m.segment_id = ANY (segs) AND m.profile_id = g.profile_id
          AND m.added_at <= v_at AND (m.removed_at IS NULL OR m.removed_at > v_at)));
  END IF;

  -- 2. Facilities (allow policies, grants, tracking sessions overlapping the last 30 days).
  IF cardinality(facs) > 0 THEN
    WITH areas AS MATERIALIZED (
      SELECT a.id FROM itap.areas a WHERE a.organization_id = p_org AND a.facility_id = ANY (facs)
    ),
    points AS MATERIALIZED (
      SELECT x.id FROM itap.access_points x WHERE x.organization_id = p_org AND x.facility_id = ANY (facs)
    ),
    versions AS MATERIALIZED (
      SELECT v.id FROM itap.access_policies p
      JOIN itap.access_policy_versions v ON v.organization_id = p.organization_id AND v.id = p.current_version_id
      WHERE p.organization_id = p_org AND NOT p.is_archived AND p.current_version_id IS NOT NULL AND v.effect = 'allow'
        AND (v.valid_from IS NULL OR v.valid_from <= v_at) AND (v.valid_until IS NULL OR v_at < v.valid_until)
        AND EXISTS (
          SELECT 1 FROM itap.access_policy_version_targets t
          WHERE t.organization_id = p_org AND t.version_id = v.id
            AND (t.facility_id = ANY (facs) OR t.area_id IN (SELECT id FROM areas) OR t.access_point_id IN (SELECT id FROM points))
        )
    ),
    profs AS MATERIALIZED (
      SELECT DISTINCT g.profile_id FROM unnest(g_eff, g_member, g_profile) AS g (eff, member, profile_id) WHERE g.profile_id IS NOT NULL
    ),
    covered AS MATERIALIZED (
      SELECT pr.profile_id FROM profs pr JOIN itap.profiles p ON p.organization_id = p_org AND p.id = pr.profile_id
      WHERE EXISTS (
        SELECT 1 FROM versions v
        WHERE EXISTS (SELECT 1 FROM itap.access_subject_match(
          p_org, v.id, p.id, p.profile_type, p.access_level, itap.access_person_identities(p_org, NULL, p.id), v_at))
      )
      OR EXISTS (
        SELECT 1 FROM itap.access_grants gr
        WHERE gr.organization_id = p_org AND gr.profile_id = p.id
          AND (gr.revoked_at IS NULL OR gr.revoked_at > v_at) AND (gr.used_at IS NULL OR gr.used_at > v_at)
          AND gr.valid_from <= v_at AND v_at < gr.valid_until
          AND (gr.area_id IN (SELECT id FROM areas) OR gr.access_point_id IN (SELECT id FROM points))
      )
    )
    SELECT coalesce(array_agg(DISTINCT g.eff), '{}') INTO via_facilities
    FROM unnest(g_eff, g_member, g_profile) AS g (eff, member, profile_id)
    WHERE g.profile_id IN (SELECT c.profile_id FROM covered c)
      OR EXISTS (
        SELECT 1 FROM itap.tracking_sessions s
        WHERE s.organization_id = p_org AND s.identity_id = g.member AND s.facility_id = ANY (facs)
          AND s.started_at <= v_at AND coalesce(s.ended_at, s.last_detected_at) >= v_at - interval '30 days');
  END IF;

  SELECT coalesce(array_agg(DISTINCT x.id ORDER BY x.id), '{}') INTO united
  FROM unnest(via_segments || via_facilities) AS x (id);

  -- 4. Work schedules.
  rostered := united;
  IF app.use_work_schedules THEN
    SELECT coalesce(array_agg(i.id ORDER BY i.id), '{}') INTO rostered
    FROM itap.identities i JOIN itap.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
    WHERE i.organization_id = p_org AND i.id = ANY (united) AND itap.profile_rostered_at(p, v_at);
  END IF;

  -- 5. Access point narrowing (engine dry run, nothing recorded).
  allowed := rostered;
  IF p_access_point IS NOT NULL THEN
    SELECT coalesce(array_agg(x.id ORDER BY x.id), '{}') INTO allowed
    FROM unnest(rostered) AS x (id)
    WHERE (itap.evaluate_access(p_org, p_access_point, x.id, NULL, NULL, v_at, false)).result = 'granted';
  END IF;

  identity_ids := allowed;
  scope := jsonb_build_object(
    'application_id', app.id,
    'sandbox', app.is_sandbox,
    'segments', to_jsonb(segs),
    'facilities', to_jsonb(facs),
    'facility_rule', 'allow policy or grant in the facility, or a tracking session there within 30 days',
    'access_point_id', p_access_point,
    'use_work_schedules', app.use_work_schedules,
    'at', v_at,
    'sizes', jsonb_build_object(
      'matchable', n_matchable,
      'segments', cardinality(via_segments),
      'facilities', cardinality(via_facilities),
      'union', cardinality(united),
      'after_schedule', cardinality(rostered),
      'after_access_point', cardinality(allowed),
      'final', cardinality(allowed)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION itap.auth_attributes(p_app uuid, p_identity uuid, p_at timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  WITH app AS (
    SELECT a.organization_id AS org, a.id FROM itap.client_applications a WHERE a.id = p_app
  ),
  person AS (
    SELECT i.id, i.primary_photo_file_id, p.id AS profile_id, p.first_name, p.last_name, p.profile_type, p.department,
           p.employee_id, p.access_level, co.name AS company
    FROM app
    JOIN itap.identities i ON i.organization_id = app.org AND i.id = p_identity
    LEFT JOIN itap.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
    LEFT JOIN itap.companies co ON co.organization_id = p.organization_id AND co.id = p.company_id
  ),
  person_ids AS MATERIALIZED (
    SELECT itap.access_person_identities(app.org, person.id, person.profile_id) AS ids FROM app CROSS JOIN person
  ),
  seg_names AS (
    SELECT coalesce(jsonb_agg(DISTINCT s.name), '[]'::jsonb) AS names
    FROM app
    JOIN itap.client_application_segments b ON b.organization_id = app.org AND b.application_id = app.id
    JOIN itap.segments s ON s.organization_id = b.organization_id AND s.id = b.segment_id AND s.status <> 'archived'
    CROSS JOIN person
    CROSS JOIN person_ids
    WHERE EXISTS (
      SELECT 1 FROM itap.segment_members m
      WHERE m.organization_id = s.organization_id AND m.segment_id = s.id
        AND m.added_at <= p_at AND (m.removed_at IS NULL OR m.removed_at > p_at)
        AND m.profile_id = person.profile_id
    ) OR EXISTS (
      SELECT 1 FROM itap.segment_members m
      WHERE m.organization_id = s.organization_id AND m.segment_id = s.id
        AND m.added_at <= p_at AND (m.removed_at IS NULL OR m.removed_at > p_at)
        AND m.identity_id = ANY (person_ids.ids)
    )
  )
  SELECT coalesce(jsonb_object_agg(x.attribute, CASE x.attribute
      WHEN 'display_name' THEN to_jsonb(nullif(btrim(concat_ws(' ', person.first_name, person.last_name)), ''))
      WHEN 'photo' THEN to_jsonb(person.primary_photo_file_id)
      WHEN 'profile_type' THEN to_jsonb(person.profile_type)
      WHEN 'company' THEN to_jsonb(person.company)
      WHEN 'department' THEN to_jsonb(person.department)
      WHEN 'employee_id' THEN to_jsonb(person.employee_id)
      WHEN 'access_level' THEN to_jsonb(person.access_level)
      WHEN 'segments' THEN (SELECT names FROM seg_names)
    END), '{}'::jsonb)
  FROM app
  JOIN itap.client_application_attributes x ON x.organization_id = app.org AND x.application_id = app.id
  CROSS JOIN person;
$$;

CREATE OR REPLACE FUNCTION itap.auth_decide(
  p_org uuid,
  p_app uuid,
  p_session uuid,
  p_mode text,
  p_claimed_identity uuid,
  p_access_point uuid,
  p_embedding vector,
  p_quality jsonb,
  p_attack jsonb,
  p_request_threshold numeric,
  p_at timestamptz,
  p_record boolean,
  p_evidence_file uuid DEFAULT NULL
) RETURNS itap.auth_decision
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap, public
-- Custom plans: the array-parameter queries (population, stage 1) degrade ~20x under the generic plan plpgsql switches
-- to after five calls (measured 6-15 ms -> 105-130 ms per call on the seeded Nova Tower).
SET plan_cache_mode = force_custom_plan
AS $$
DECLARE
  started timestamptz := clock_timestamp();
  t timestamptz;
  v_at timestamptz := coalesce(p_at, now());
  quality jsonb := coalesce(p_quality, '{}');
  q_reason text := nullif(coalesce(p_quality, '{}') ->> 'failure_reason', '');
  atk text := coalesce(nullif(coalesce(p_attack, '{}') ->> 'outcome', ''), 'not_checked');
  details jsonb := CASE WHEN jsonb_typeof(p_attack -> 'details') = 'object' THEN p_attack -> 'details' ELSE '{}' END;
  v_claimed_ref text := CASE WHEN p_claimed_identity IS NOT NULL
                             THEN encode(sha256(convert_to(p_claimed_identity::text, 'UTF8')), 'hex') END;
  v_digest text := nullif(btrim(coalesce(p_attack, '{}') ->> 'sequence_digest'), '');
  digest_row uuid;
  replay_of uuid;
  app itap.client_applications;
  sess itap.authentication_sessions;
  pop uuid[];
  scope jsonb;
  pop_size integer;
  thr numeric;
  claimed_known uuid;
  claimed uuid;
  cands uuid[];
  r_ms real;
  c_ms real;
  best_id uuid;
  best_score real;
  hit boolean;
  outcome text;
  rec_reason text;
  review text := 'none';
  v_step text := 'initial';
  recaptures integer := 0;
  new_status text;
  res itap.auth_decision;
  ap itap.access_points;
  attempt uuid;
  ev itap.events;
  event_id uuid;
BEGIN
  -- Inputs.
  SELECT * INTO app FROM itap.client_applications a WHERE a.organization_id = p_org AND a.id = p_app;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('client_application_not_found');
  END IF;
  IF app.status <> 'active' THEN
    PERFORM itap.raise_code('client_application_inactive');
  END IF;
  IF p_session IS NULL AND p_record THEN
    PERFORM itap.raise_code('auth_session_required');
  END IF;
  IF p_session IS NOT NULL THEN
    IF p_record THEN
      SELECT * INTO sess FROM itap.authentication_sessions s
      WHERE s.organization_id = p_org AND s.id = p_session AND s.application_id = p_app FOR UPDATE;
    ELSE
      SELECT * INTO sess FROM itap.authentication_sessions s
      WHERE s.organization_id = p_org AND s.id = p_session AND s.application_id = p_app;
    END IF;
    IF NOT FOUND THEN
      PERFORM itap.raise_code('auth_session_not_found');
    END IF;
    IF sess.status <> 'open' THEN
      PERFORM itap.raise_code('auth_session_closed');
    END IF;
    IF sess.expires_at <= v_at THEN
      PERFORM itap.raise_code('auth_session_expired');
    END IF;
    -- Strict binding: mode, claimed identity (by the hash of the id as sent) and access point equal the session's.
    IF sess.mode IS DISTINCT FROM p_mode
       OR sess.claimed_ref_hash IS DISTINCT FROM v_claimed_ref
       OR sess.access_point_id IS DISTINCT FROM p_access_point THEN
      PERFORM itap.raise_code('auth_session_mismatch');
    END IF;
    IF sess.step_count > 0 THEN
      v_step := 'recapture';
      IF sess.recapture_count >= 2 THEN
        PERFORM itap.raise_code('auth_recapture_limit');
      END IF;
    END IF;
    recaptures := sess.recapture_count + CASE WHEN v_step = 'recapture' THEN 1 ELSE 0 END;
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('identification', 'verification') THEN
    PERFORM itap.raise_code('auth_mode_invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM itap.client_application_modes m
                 WHERE m.organization_id = p_org AND m.application_id = p_app AND m.mode = p_mode) THEN
    PERFORM itap.raise_code('auth_mode_not_allowed');
  END IF;
  IF p_mode = 'identification' AND p_claimed_identity IS NOT NULL THEN
    PERFORM itap.raise_code('auth_claimed_identity_not_allowed');
  END IF;
  IF p_mode = 'verification' AND p_claimed_identity IS NULL THEN
    PERFORM itap.raise_code('auth_claimed_identity_required');
  END IF;
  IF q_reason IS NOT NULL AND q_reason NOT IN ('no_face', 'multiple_faces', 'low_quality', 'blur', 'poor_lighting') THEN
    PERFORM itap.raise_code('auth_quality_reason_invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM itap.auth_attack_outcomes o WHERE o.value = atk) THEN
    PERFORM itap.raise_code('auth_attack_outcome_invalid');
  END IF;
  IF q_reason IS NULL AND p_embedding IS NULL THEN
    PERFORM itap.raise_code('auth_embedding_required');
  END IF;
  IF p_access_point IS NOT NULL THEN
    SELECT * INTO ap FROM itap.access_points x WHERE x.organization_id = p_org AND x.id = p_access_point;
  END IF;

  -- Population (server-side, always computed: recorded with every attempt) and threshold in force.
  SELECT e.identity_ids, e.scope INTO pop, scope FROM itap.auth_population_eval(p_org, p_app, p_access_point, v_at) e;
  pop_size := cardinality(pop);
  thr := itap.auth_effective_threshold(
    app.threshold, app.threshold_min, app.threshold_max,
    CASE p_mode WHEN 'verification' THEN 0.55 ELSE itap.auth_threshold_floor(pop_size) END,
    p_request_threshold);

  -- Replay: a sequence digest seen before is an injection (also when a concurrent attempt registered it first).
  IF v_digest IS NOT NULL THEN
    SELECT d.attempt_id, d.id INTO replay_of, digest_row FROM itap.auth_sequence_digests d
    WHERE d.organization_id = p_org AND d.digest = v_digest;
    IF FOUND THEN
      atk := 'injection';
      details := details || jsonb_build_object('replay', true, 'replay_of_attempt_id', replay_of);
      digest_row := NULL;
    ELSIF p_record THEN
      INSERT INTO itap.auth_sequence_digests (organization_id, digest, first_seen_at)
      VALUES (p_org, v_digest, v_at)
      ON CONFLICT (organization_id, digest) DO NOTHING
      RETURNING id INTO digest_row;
      IF digest_row IS NULL THEN
        atk := 'injection';
        details := details || jsonb_build_object('replay', true);
      END IF;
    END IF;
  END IF;

  IF p_claimed_identity IS NOT NULL
     AND EXISTS (SELECT 1 FROM itap.identities i WHERE i.organization_id = p_org AND i.id = p_claimed_identity) THEN
    claimed_known := p_claimed_identity;
    claimed := itap.effective_identity(p_org, p_claimed_identity);
  END IF;

  IF q_reason IS NOT NULL THEN
    outcome := 'failure';
    rec_reason := q_reason;
  ELSIF atk IN ('printed_photo', 'screen_replay', 'mask', 'injection') THEN
    outcome := 'failure';
    rec_reason := 'attack_detected';
  ELSIF app.liveness_required AND atk = 'not_checked' THEN
    outcome := 'failure';
    rec_reason := 'liveness_failed';
  ELSE
    -- Stage 1: top-K identities of the population by centroid distance.
    t := clock_timestamp();
    SELECT coalesce(array_agg(x.identity_id ORDER BY x.dist, x.identity_id), '{}') INTO cands
    FROM (
      SELECT c.identity_id, c.centroid <=> p_embedding AS dist
      FROM itap.identity_centroids c
      WHERE c.organization_id = p_org AND c.identity_id = ANY (pop)
      ORDER BY dist, c.identity_id
      LIMIT 20
    ) x;
    r_ms := (extract(epoch FROM clock_timestamp() - t) * 1000)::real;
    -- Stage 2: exact comparison (identification: all templates of the candidates; verification: the claimed one).
    t := clock_timestamp();
    SELECT e.identity_id, (1 - (e.embedding <=> p_embedding))::real INTO best_id, best_score
    FROM itap.identity_embeddings e
    WHERE e.organization_id = p_org AND e.is_template
      AND e.identity_id = ANY (CASE p_mode WHEN 'verification' THEN ARRAY[claimed] ELSE cands END)
    ORDER BY e.embedding <=> p_embedding, e.identity_id
    LIMIT 1;
    c_ms := (extract(epoch FROM clock_timestamp() - t) * 1000)::real;

    IF p_mode = 'verification' THEN
      -- Instrumentation only for claims inside the population (NULL otherwise).
      hit := CASE WHEN claimed = ANY (pop) THEN coalesce(claimed = ANY (cands), false) END;
      best_id := claimed;
      IF claimed IS NULL OR NOT (claimed = ANY (pop)) THEN
        outcome := 'failure';
        rec_reason := 'not_in_population';
      END IF;
    ELSIF cardinality(cands) = 0 THEN
      outcome := 'failure';
      rec_reason := 'not_retrieved';
    END IF;
    IF outcome IS NULL THEN
      IF best_score IS NOT NULL AND best_score >= thr THEN
        outcome := 'success';
      ELSIF best_score IS NOT NULL AND best_score >= thr - 0.08 THEN
        outcome := 'partial_match';
        IF p_session IS NOT NULL AND recaptures >= 2 THEN
          review := 'pending';
        END IF;
      ELSE
        outcome := 'failure';
        rec_reason := 'below_threshold';
      END IF;
    END IF;
  END IF;

  res.outcome := outcome;
  res.threshold_used := thr;
  res.attack_outcome := atk;
  res.population_size := pop_size;
  res.attributes := '{}';
  IF outcome IN ('success', 'partial_match') THEN
    res.matched_identity_id := best_id;
    SELECT i.profile_id INTO res.profile_id FROM itap.identities i WHERE i.organization_id = p_org AND i.id = best_id;
    res.confidence := best_score;
    res.comparison_score := best_score;
    res.retrieval_candidates := cardinality(cands);
    res.retrieval_hit := hit;
    IF outcome = 'success' THEN
      res.attributes := itap.auth_attributes(p_app, best_id, v_at);
    END IF;
  ELSIF p_mode = 'verification' AND rec_reason IN ('not_in_population', 'below_threshold') THEN
    res.failure_reason := 'below_threshold';
  ELSE
    res.failure_reason := rec_reason;
    res.comparison_score := best_score;
    res.confidence := best_score;
    res.retrieval_candidates := cardinality(cands);
  END IF;

  IF NOT p_record THEN
    RETURN res;
  END IF;

  -- Recording.
  attempt := gen_random_uuid();
  INSERT INTO itap.authentication_attempts (
    id, organization_id, application_id, session_id, attempt_no, step, mode, claimed_identity_id, matched_identity_id,
    profile_id, access_point_id, device_ref, outcome, review_status, confidence, threshold_used, population_size,
    population_scope, retrieval_candidates, retrieval_hit, comparison_score, failure_reason, attack_outcome,
    attack_details, quality, sequence_digest, model_version, evidence_file_id, latency_ms, retrieval_ms, comparison_ms,
    ip, user_agent, attempted_at
  ) VALUES (
    attempt, p_org, p_app, p_session, sess.step_count + 1, v_step, p_mode, claimed_known,
    CASE WHEN outcome <> 'failure' THEN best_id END, res.profile_id, p_access_point, sess.device_ref, outcome, review,
    best_score, thr, pop_size, scope, cardinality(cands), hit, best_score,
    CASE WHEN outcome = 'failure' THEN rec_reason END, atk, details, quality, v_digest, quality ->> 'model_version',
    CASE WHEN outcome <> 'success' THEN p_evidence_file END,
    round(extract(epoch FROM clock_timestamp() - started) * 1000
          + greatest(coalesce(CASE WHEN jsonb_typeof(quality -> 'pipeline_ms') = 'number' THEN (quality ->> 'pipeline_ms')::numeric END, 0), 0)),
    r_ms, c_ms, sess.created_ip, sess.user_agent, v_at
  );
  res.attempt_id := attempt;
  IF digest_row IS NOT NULL THEN
    UPDATE itap.auth_sequence_digests SET attempt_id = attempt WHERE id = digest_row;
  END IF;

  new_status := CASE
    WHEN outcome = 'success' THEN 'succeeded'
    WHEN outcome = 'partial_match' THEN CASE WHEN review = 'pending' THEN 'review' ELSE 'open' END
    WHEN q_reason IS NOT NULL AND recaptures < 2 THEN 'open'
    ELSE 'failed'
  END;
  UPDATE itap.authentication_sessions
  SET step_count = step_count + 1,
      recapture_count = recaptures,
      step = CASE WHEN new_status = 'open' THEN 'recapture' ELSE step END,
      status = new_status,
      closed_at = CASE WHEN new_status IN ('succeeded', 'failed') THEN v_at END
  WHERE organization_id = p_org AND id = p_session;

  -- Sandbox traffic never emits events (no Stage C).
  IF outcome IN ('success', 'failure') AND NOT app.is_sandbox THEN
    ev.organization_id := p_org;
    ev.facility_id := ap.facility_id;
    ev.area_id := ap.area_id;
    ev.access_point_id := ap.id;
    ev.identity_id := CASE WHEN outcome = 'success' THEN best_id END;
    ev.profile_id := CASE WHEN outcome = 'success' THEN res.profile_id END;
    ev.authentication_attempt_id := attempt;
    ev.event_type := CASE outcome WHEN 'success' THEN 'auth_success' ELSE 'auth_failed' END;
    ev.severity := CASE WHEN outcome = 'success' THEN 'info' WHEN rec_reason = 'attack_detected' THEN 'medium' ELSE 'low' END;
    ev.title := CASE outcome WHEN 'success' THEN 'Authentication succeeded: ' ELSE 'Authentication failed: ' END || app.name;
    ev.payload := jsonb_build_object('application_id', app.id, 'mode', p_mode, 'session_id', p_session,
                                     'failure_reason', CASE WHEN outcome = 'failure' THEN rec_reason END,
                                     'attack_outcome', atk, 'confidence', best_score, 'threshold', thr,
                                     'claimed_identity_id', claimed_known);
    ev.dedup_key := 'auth:' || attempt;
    ev.occurred_at := v_at;
    event_id := itap.emit_event(ev);
    IF event_id IS NOT NULL THEN
      PERFORM itap.finish_events(p_org, ARRAY[event_id]);
    END IF;
  END IF;
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION itap.review_authentication_attempt(hasura_session json, p_attempt uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS SETOF itap.authentication_attempts
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
  current_status text;
  session uuid;
  matched uuid;
  att itap.authentication_attempts;
  sandbox boolean;
  app_name text;
  ap itap.access_points;
  ev itap.events;
  event_id uuid;
  note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF p_approve IS NULL THEN
    PERFORM itap.raise_code('auth_review_decision_required');
  END IF;
  SELECT review_status, session_id, matched_identity_id INTO current_status, session, matched
  FROM itap.authentication_attempts
  WHERE organization_id = org AND id = p_attempt FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('auth_attempt_not_found');
  END IF;
  IF current_status <> 'pending' THEN
    PERFORM itap.raise_code('auth_attempt_not_pending');
  END IF;
  IF matched IS NULL THEN
    PERFORM itap.raise_code('auth_attempt_no_match');
  END IF;
  PERFORM set_config('itap.auth_review_context', 'on', true);
  UPDATE itap.authentication_attempts
  SET review_status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = actor, reviewed_at = now(), review_note = note
  WHERE organization_id = org AND id = p_attempt;
  PERFORM set_config('itap.auth_review_context', 'off', true);
  IF session IS NOT NULL THEN
    UPDATE itap.authentication_sessions
    SET status = CASE WHEN p_approve THEN 'succeeded' ELSE 'failed' END, closed_at = now()
    WHERE organization_id = org AND id = session AND status IN ('open', 'review');
  END IF;
  -- The review decides the authentication: approval emits auth_success, rejection auth_failed (dedup auth:<attempt>;
  -- a partial match emitted no event before), with Stage C.
  SELECT * INTO att FROM itap.authentication_attempts WHERE organization_id = org AND id = p_attempt;
  SELECT a.name, a.is_sandbox INTO app_name, sandbox FROM itap.client_applications a
  WHERE a.organization_id = org AND a.id = att.application_id;
  IF att.access_point_id IS NOT NULL THEN
    SELECT * INTO ap FROM itap.access_points x WHERE x.organization_id = org AND x.id = att.access_point_id;
  END IF;
  ev.organization_id := org;
  ev.facility_id := ap.facility_id;
  ev.area_id := ap.area_id;
  ev.access_point_id := ap.id;
  ev.identity_id := CASE WHEN p_approve THEN att.matched_identity_id END;
  ev.profile_id := CASE WHEN p_approve THEN att.profile_id END;
  ev.authentication_attempt_id := att.id;
  ev.event_type := CASE WHEN p_approve THEN 'auth_success' ELSE 'auth_failed' END;
  ev.severity := CASE WHEN p_approve THEN 'info' ELSE 'low' END;
  ev.title := CASE WHEN p_approve THEN 'Authentication approved on review: ' ELSE 'Authentication rejected on review: ' END
              || coalesce(app_name, '');
  ev.payload := jsonb_build_object('application_id', att.application_id, 'mode', att.mode, 'session_id', att.session_id,
                                   'review_status', att.review_status, 'reviewed_by', actor, 'confidence', att.confidence,
                                   'threshold', att.threshold_used, 'matched_identity_id', att.matched_identity_id);
  ev.dedup_key := 'auth:' || att.id;
  ev.occurred_at := now();
  -- Sandbox traffic never emits events.
  IF NOT sandbox THEN
    event_id := itap.emit_event(ev);
  END IF;
  IF event_id IS NOT NULL THEN
    PERFORM itap.finish_events(org, ARRAY[event_id]);
  END IF;
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (org, actor, CASE WHEN p_approve THEN 'approve' ELSE 'reject' END, 'authentication_attempts', p_attempt,
          jsonb_build_object('review_status', jsonb_build_array('pending', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END),
                             'session_id', session),
          note);
  RETURN QUERY SELECT * FROM itap.authentication_attempts WHERE organization_id = org AND id = p_attempt;
END;
$$;
