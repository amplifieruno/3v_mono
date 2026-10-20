-- Face authentication decision engine, part 2 (slice 9 task 2): the permitted attribute projection and the decision.

-- What an application receives about the authenticated person: exactly its permitted attribute set (one key per
-- client_application_attributes row; null when the person has no value), never the identity record.
--   display_name, profile_type, department, employee_id, access_level (linked profile), company (company name),
--   photo (the identity's primary photo file id), segments (names of the app's bound segments the person belongs to
--   at p_at: identity-target through the person's effective identities, profile-target through the profile).
CREATE FUNCTION itap.auth_attributes(p_app uuid, p_identity uuid, p_at timestamptz DEFAULT now())
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
    JOIN itap.segments s ON s.organization_id = b.organization_id AND s.id = b.segment_id
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

CREATE TYPE itap.auth_decision AS (
  attempt_id uuid,
  outcome text,
  matched_identity_id uuid,
  profile_id uuid,
  confidence real,
  threshold_used real,
  failure_reason text,
  attack_outcome text,
  retrieval_candidates integer,
  retrieval_hit boolean,
  comparison_score real,
  population_size integer,
  attributes jsonb
);

-- The decision (admin-only; backend service, seed, tests). Inputs: application, session (required when recording),
-- mode, claimed identity (verification), access point, probe embedding, p_quality (failure_reason of the capture
-- quality check: no_face / multiple_faces / low_quality / blur / poor_lighting; model_version; pipeline_ms = backend
-- time before the call, added to latency_ms; stored as the attempt's quality), p_attack (outcome: an
-- auth_attack_outcomes value, default not_checked; details; sequence_digest), raise-only request threshold, instant,
-- p_record, optional evidence file (kept only for non-success outcomes; attributes then carry nothing about it — the
-- caller deletes a file that was not kept).
-- Order: quality failure -> failure with that reason (no matching); attack (printed_photo / screen_replay / mask /
-- injection; a sequence digest seen before is injection) -> failure attack_detected; then matching:
--   identification: stage 1 = top 20 population identities by centroid distance (retrieval_ms), stage 2 = best exact
--     similarity over all templates of those candidates (comparison_ms); >= threshold success, in
--     [threshold - 0.08, threshold) partial_match, else failure below_threshold (not_retrieved when stage 1 is empty).
--     retrieval_hit is NULL (the true identity is unknown).
--   verification: one comparison against the claimed (effective) identity's templates with the fixed floor 0.55;
--     retrieval_hit = whether the claimed identity is in the stage-1 top 20 (instrumentation). A claimed identity
--     outside the population (or unknown in the organization) is recorded with failure_reason not_in_population, but
--     the returned decision is identical to a below_threshold non-match: every verification failure returns only
--     outcome, failure_reason below_threshold, threshold, population size and attack outcome (no score, candidate or
--     retrieval fields) — no membership oracle.
-- partial_match: review pending (session -> review) when the session has no recapture left after this attempt.
-- Recording (p_record): attempt row, sequence digest, session step (open -> succeeded / failed / review; a quality
-- failure keeps the session open while recaptures remain), event auth_success / auth_failed (dedup auth:<attempt>;
-- attacks medium severity) with Stage C.
CREATE FUNCTION itap.auth_decide(
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
  attack jsonb := coalesce(p_attack, '{}');
  q_reason text := nullif(coalesce(p_quality, '{}') ->> 'failure_reason', '');
  atk text := coalesce(nullif(coalesce(p_attack, '{}') ->> 'outcome', ''), 'not_checked');
  details jsonb := CASE WHEN jsonb_typeof(p_attack -> 'details') = 'object' THEN p_attack -> 'details' ELSE '{}' END;
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
    IF sess.mode IS DISTINCT FROM p_mode
       OR (sess.claimed_identity_id IS NOT NULL AND sess.claimed_identity_id IS DISTINCT FROM p_claimed_identity)
       OR (sess.access_point_id IS NOT NULL AND sess.access_point_id IS DISTINCT FROM p_access_point) THEN
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
      hit := coalesce(claimed = ANY (cands), false);
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
          + coalesce(CASE WHEN jsonb_typeof(quality -> 'pipeline_ms') = 'number' THEN (quality ->> 'pipeline_ms')::numeric END, 0)),
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

  IF outcome IN ('success', 'failure') THEN
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

REVOKE ALL ON FUNCTION itap.auth_attributes(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION itap.auth_decide(uuid, uuid, uuid, text, uuid, uuid, vector, jsonb, jsonb, numeric, timestamptz, boolean, uuid)
  FROM PUBLIC;
