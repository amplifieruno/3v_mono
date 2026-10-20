-- Slice 10 task 3: the fulfil_dsr job (spec §8.4) with the slice-7 lease / attempt fencing, org_admin closing
-- functions and the SLA sweep.
--   claim_dsr (backend): received, or in_progress with an expired lease -> in_progress, attempts + 1, 10-minute lease;
--     a request whose subject profile is gone is rejected (subject_not_found); after dsr_max_attempts() since the
--     last retry the claim gives up (last_error max_attempts, no lease) until org_admin calls retry_dsr.
--   Every later job writer takes the attempt and is a no-op for a stale one: fail_dsr (backoff lease 2^n min, max
--     60), dsr_restrict, dsr_await_rectification (here), dsr_bundle / complete_dsr_export (access), dsr_erase.
--   due_dsrs: the safety net of the dsr_maintenance cron (received for over a minute, expired leases).
--   reject_dsr / complete_dsr (rectification only) / retry_dsr: org_admin, active member, audited.
--   dsr_overdue_events(at): one dsr_overdue event per open request past due_at (overdue_notified_at); returns them.
-- Every step is appended to dsr_steps (at = clock time, so steps of one transaction keep their order).

CREATE FUNCTION itap.dsr_max_attempts() RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT 5 $$;

CREATE FUNCTION itap.dsr_step(r itap.data_subject_requests, p_step text, p_details jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, itap
AS $$
  INSERT INTO itap.dsr_steps (organization_id, request_id, step, details, at)
  VALUES (r.organization_id, r.id, p_step, coalesce(p_details, '{}'::jsonb), clock_timestamp());
$$;

-- The request of a job attempt, locked; NULL unless it is in progress with exactly this attempt (and type).
CREATE FUNCTION itap.dsr_fenced(p_request uuid, p_attempt integer, p_types text[]) RETURNS itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.data_subject_requests;
BEGIN
  SELECT * INTO r FROM itap.data_subject_requests x WHERE x.id = p_request FOR UPDATE;
  IF NOT FOUND OR r.status <> 'in_progress' OR r.attempts IS DISTINCT FROM p_attempt OR NOT (r.request_type = ANY (p_types))
     OR r.profile_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN r;
END;
$$;

CREATE FUNCTION itap.claim_dsr(p_request uuid) RETURNS SETOF itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.data_subject_requests;
BEGIN
  SELECT * INTO r FROM itap.data_subject_requests x
  WHERE x.id = p_request AND (x.status = 'received' OR (x.status = 'in_progress' AND x.lease_expires_at <= now()))
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF r.profile_id IS NULL THEN
    UPDATE itap.data_subject_requests
    SET status = 'rejected', rejection_reason = 'subject_not_found', completed_at = now(), lease_expires_at = NULL
    WHERE id = r.id RETURNING * INTO r;
    PERFORM itap.dsr_step(r, 'rejected', '{"reason": "subject_not_found"}');
    RETURN;
  END IF;
  IF r.attempts - r.attempts_at_retry >= itap.dsr_max_attempts() THEN
    UPDATE itap.data_subject_requests SET status = 'in_progress', lease_expires_at = NULL, last_error = 'max_attempts'
    WHERE id = r.id RETURNING * INTO r;
    PERFORM itap.dsr_step(r, 'gave_up', jsonb_build_object('attempts', r.attempts));
    RETURN;
  END IF;
  UPDATE itap.data_subject_requests
  SET status = 'in_progress', attempts = attempts + 1, lease_expires_at = now() + interval '10 minutes', last_error = NULL
  WHERE id = r.id RETURNING * INTO r;
  PERFORM itap.dsr_step(r, 'claimed', jsonb_build_object('attempt', r.attempts));
  RETURN NEXT r;
END;
$$;

CREATE FUNCTION itap.fail_dsr(p_request uuid, p_attempt integer, p_error text) RETURNS SETOF itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.data_subject_requests;
  msg text := left(coalesce(nullif(btrim(p_error), ''), 'unknown_error'), 1000);
BEGIN
  UPDATE itap.data_subject_requests
  SET last_error = msg,
      lease_expires_at = now() + make_interval(mins => least(60, power(2, greatest(attempts - attempts_at_retry, 0))::integer))
  WHERE id = p_request AND status = 'in_progress' AND attempts = p_attempt
  RETURNING * INTO r;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  PERFORM itap.dsr_step(r, 'failed', jsonb_build_object('attempt', p_attempt, 'error', msg));
  RETURN NEXT r;
END;
$$;

CREATE FUNCTION itap.due_dsrs(p_at timestamptz, p_limit integer) RETURNS SETOF itap.data_subject_requests
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT * FROM itap.data_subject_requests r
  WHERE r.status IN ('received', 'in_progress')
    AND ((r.status = 'received' AND r.updated_at <= p_at - interval '60 seconds')
         OR (r.status = 'in_progress' AND r.lease_expires_at <= p_at))
  ORDER BY r.updated_at, r.id
  LIMIT greatest(p_limit, 0);
$$;

-- Restriction (Art. 18): processing_restricted with reason dsr:<code>; the restriction stays until org_admin lifts it
-- with set_processing_restriction (audited).
CREATE FUNCTION itap.dsr_restrict(p_request uuid, p_attempt integer) RETURNS SETOF itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.data_subject_requests := itap.dsr_fenced(p_request, p_attempt, ARRAY['restriction']);
BEGIN
  IF r.id IS NULL THEN
    RETURN;
  END IF;
  PERFORM itap.apply_processing_restriction(r.organization_id, r.profile_id, true, 'dsr:' || r.code, r.requested_by);
  PERFORM itap.dsr_step(r, 'restricted');
  UPDATE itap.data_subject_requests SET status = 'completed', completed_at = now(), lease_expires_at = NULL
  WHERE id = r.id RETURNING * INTO r;
  PERFORM itap.dsr_step(r, 'completed');
  RETURN NEXT r;
END;
$$;

-- Rectification: the job only records that the request waits for org_admin (normal audited updates, complete_dsr).
CREATE FUNCTION itap.dsr_await_rectification(p_request uuid, p_attempt integer) RETURNS SETOF itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.data_subject_requests := itap.dsr_fenced(p_request, p_attempt, ARRAY['rectification']);
BEGIN
  IF r.id IS NULL THEN
    RETURN;
  END IF;
  UPDATE itap.data_subject_requests SET lease_expires_at = NULL WHERE id = r.id RETURNING * INTO r;
  PERFORM itap.dsr_step(r, 'awaiting_rectification');
  RETURN NEXT r;
END;
$$;

-- The caller's open request (org_admin functions), locked.
CREATE FUNCTION itap.dsr_session_request(hasura_session json, p_request uuid) RETURNS itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.data_subject_requests;
BEGIN
  SELECT * INTO r FROM itap.data_subject_requests x
  WHERE x.organization_id = itap.session_organization(hasura_session) AND x.id = p_request FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('dsr_not_found');
  END IF;
  RETURN r;
END;
$$;

CREATE FUNCTION itap.reject_dsr(hasura_session json, p_request uuid, p_reason text) RETURNS SETOF itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  actor uuid := itap.require_active_member(hasura_session);
  r itap.data_subject_requests := itap.dsr_session_request(hasura_session, p_request);
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF r.status NOT IN ('received', 'in_progress') THEN
    PERFORM itap.raise_code('dsr_closed');
  END IF;
  IF reason IS NULL THEN
    PERFORM itap.raise_code('dsr_rejection_reason_required');
  END IF;
  UPDATE itap.data_subject_requests
  SET status = 'rejected', rejection_reason = reason, completed_at = now(), lease_expires_at = NULL
  WHERE id = r.id RETURNING * INTO r;
  PERFORM itap.dsr_step(r, 'rejected', jsonb_build_object('by', actor));
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (r.organization_id, actor, 'reject', 'data_subject_requests', r.id,
          jsonb_build_object('code', r.code, 'request_type', r.request_type), reason);
  RETURN NEXT r;
END;
$$;

CREATE FUNCTION itap.complete_dsr(hasura_session json, p_request uuid, p_outcome text) RETURNS SETOF itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  actor uuid := itap.require_active_member(hasura_session);
  r itap.data_subject_requests := itap.dsr_session_request(hasura_session, p_request);
  v_outcome text := nullif(btrim(coalesce(p_outcome, '')), '');
BEGIN
  IF r.request_type <> 'rectification' THEN
    PERFORM itap.raise_code('dsr_complete_type');
  END IF;
  IF r.status IN ('completed', 'rejected') THEN
    PERFORM itap.raise_code('dsr_closed');
  END IF;
  IF r.status <> 'in_progress' THEN
    PERFORM itap.raise_code('dsr_not_in_progress');
  END IF;
  IF v_outcome IS NULL THEN
    PERFORM itap.raise_code('dsr_outcome_required');
  END IF;
  UPDATE itap.data_subject_requests
  SET status = 'completed', completed_at = now(), outcome = v_outcome, lease_expires_at = NULL
  WHERE id = r.id RETURNING * INTO r;
  PERFORM itap.dsr_step(r, 'completed', jsonb_build_object('by', actor));
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (r.organization_id, actor, 'rectify', 'profiles', r.profile_id,
          jsonb_build_object('request_id', r.id, 'code', r.code), v_outcome);
  RETURN NEXT r;
END;
$$;

-- Requeues a request the job gave up on (max_attempts): a fresh attempt budget; the update fires fulfil_dsr.
CREATE FUNCTION itap.retry_dsr(hasura_session json, p_request uuid) RETURNS SETOF itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  actor uuid := itap.require_active_member(hasura_session);
  r itap.data_subject_requests := itap.dsr_session_request(hasura_session, p_request);
BEGIN
  IF r.status <> 'in_progress' OR r.last_error IS DISTINCT FROM 'max_attempts' THEN
    PERFORM itap.raise_code('dsr_not_failed');
  END IF;
  UPDATE itap.data_subject_requests SET attempts_at_retry = attempts, lease_expires_at = now(), last_error = NULL
  WHERE id = r.id RETURNING * INTO r;
  PERFORM itap.dsr_step(r, 'requeued', jsonb_build_object('by', actor));
  RETURN NEXT r;
END;
$$;

-- SLA: one dsr_overdue event (no person columns: the request code only) per open request past due_at. Lock order:
-- request rows (id order) -> event keys -> finish_events (incidents, Stage C).
CREATE FUNCTION itap.dsr_overdue_events(p_at timestamptz) RETURNS SETOF itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid;
  r itap.data_subject_requests;
  ev itap.events;
  ev_id uuid;
  ids uuid[];
BEGIN
  FOR org IN
    SELECT DISTINCT x.organization_id FROM itap.data_subject_requests x
    WHERE x.status IN ('received', 'in_progress') AND x.overdue_notified_at IS NULL AND x.due_at <= p_at
    ORDER BY 1
  LOOP
    ids := '{}';
    FOR r IN
      SELECT * FROM itap.data_subject_requests x
      WHERE x.organization_id = org AND x.status IN ('received', 'in_progress') AND x.overdue_notified_at IS NULL
        AND x.due_at <= p_at
      ORDER BY x.id FOR UPDATE SKIP LOCKED
    LOOP
      ev := NULL;
      ev.organization_id := org;
      ev.event_type := 'dsr_overdue';
      ev.severity := 'medium';
      ev.title := 'Data subject request overdue: ' || r.code;
      ev.payload := jsonb_build_object('request_id', r.id, 'code', r.code, 'request_type', r.request_type,
        'status', r.status, 'due_at', r.due_at);
      ev.dedup_key := 'dsr:' || r.id || ':overdue';
      ev.occurred_at := r.due_at;
      ev_id := itap.emit_event(ev);
      IF ev_id IS NOT NULL THEN
        ids := ids || ev_id;
      END IF;
      UPDATE itap.data_subject_requests SET overdue_notified_at = p_at WHERE id = r.id RETURNING * INTO r;
      PERFORM itap.dsr_step(r, 'overdue', jsonb_build_object('due_at', r.due_at));
      RETURN NEXT r;
    END LOOP;
    IF cardinality(ids) > 0 THEN
      PERFORM itap.finish_events(org, ids);
    END IF;
  END LOOP;
END;
$$;
