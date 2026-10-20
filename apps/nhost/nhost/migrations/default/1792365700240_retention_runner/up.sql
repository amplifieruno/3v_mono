-- Slice 10 task 2: retention planner and runner (spec §8.3 retention_cleanup).
-- Targets: one per active policy (cutoff = at - retain_days) plus the consent window of embeddings_withdrawn (setting
-- consent_embedding_retention_days) when no active policy of that class exists; no policy = keep. Order: FK order of
-- the classes (decisions before grants / overrides, deliveries and incidents before events, logs before the
-- identities they name, audit last), facility-specific policies before the org-wide one of a class.

CREATE FUNCTION itap.retention_class_order(p_class text) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT array_position(ARRAY[
    'access_decisions', 'auth_evidence', 'auth_attempts', 'deliveries', 'webhook_deliveries', 'incidents', 'events',
    'detections', 'locations', 'sessions', 'search_history', 'bulk_jobs', 'reports', 'terminal_syncs', 'stats',
    'photos', 'embeddings_withdrawn', 'unknown_identities', 'audit'], p_class);
$$;

CREATE FUNCTION itap.retention_targets(p_org uuid, p_at timestamptz)
RETURNS TABLE (data_class text, facility_id uuid, policy_id uuid, action text, retain_days integer, cutoff timestamptz)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT x.data_class, x.facility_id, x.policy_id, x.action, x.retain_days, p_at - make_interval(days => x.retain_days)
  FROM (
    SELECT p.data_class, p.facility_id, p.id AS policy_id, p.action, p.retain_days
    FROM itap.retention_policies p WHERE p.organization_id = p_org AND p.is_active
    UNION ALL
    SELECT 'embeddings_withdrawn', NULL, NULL, 'delete', st.consent_embedding_retention_days
    FROM itap.organization_settings st
    WHERE st.organization_id = p_org AND NOT EXISTS (
      SELECT 1 FROM itap.retention_policies p
      WHERE p.organization_id = p_org AND p.is_active AND p.data_class = 'embeddings_withdrawn')
  ) x
  ORDER BY itap.retention_class_order(x.data_class), x.facility_id IS NULL, x.facility_id;
$$;

-- One batch of a class (dispatch to itap.purge_<class>; same contract).
CREATE FUNCTION itap.purge_class(p_class text, p_org uuid, p_cutoff timestamptz, p_facility uuid,
  p_subject_profile uuid, p_subject_identity uuid, p_limit integer, p_action text)
RETURNS TABLE (affected integer, skipped_by_hold integer, files_enqueued integer)
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM itap.retention_data_classes c WHERE c.value = p_class) THEN
    PERFORM itap.raise_code('retention_class_invalid');
  END IF;
  RETURN QUERY EXECUTE format('SELECT * FROM itap.%I($1, $2, $3, $4, $5, $6, $7)', 'purge_' || p_class)
    USING p_org, p_cutoff, p_facility, p_subject_profile, p_subject_identity, p_limit, p_action;
END;
$$;

-- Dry run for the session organization (org_admin): per target of a run scheduled at p_at (default now) the
-- cutoff, unheld candidates and held rows. Holds are evaluated now, as the runner does. STABLE: writes nothing.
CREATE FUNCTION itap.retention_plan(hasura_session json, p_at timestamptz DEFAULT NULL)
RETURNS SETOF itap_results.retention_plan_rows
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  at_time timestamptz := coalesce(p_at, now());
  t record;
  c record;
BEGIN
  FOR t IN SELECT * FROM itap.retention_targets(org, at_time) LOOP
    SELECT * INTO c FROM itap.retention_count(
      itap.retention_scope(t.data_class, org, t.cutoff, t.facility_id, NULL, NULL, t.action, now()));
    RETURN QUERY SELECT org, t.data_class, t.facility_id, t.policy_id, t.action, t.retain_days, t.cutoff,
      c.candidates, c.held;
  END LOOP;
END;
$$;

-- Runner (cron retention_cleanup, per organization, at the scheduled time; admin-only). Resumable: one run per
-- (organization, scheduled_at); each call (one transaction, serialised per organization) continues it, purging
-- batches of p_batch until every target is drained (a batch with affected = 0) or the time budget is used (at least
-- one batch per call). Counts are committed with the rows they describe, so a call that fails or crashes leaves no
-- trace and the next call redoes exactly that work (no double counts). The run stays 'running' with a 5-minute lease
-- while unfinished; a run of another scheduled time left 'running' with an expired lease is closed as 'interrupted'
-- (its remaining work is the new run's: cutoffs are stateless). A class failing is recorded on its row (error) and
-- makes the run 'failed'; the other classes still run. A finished run is returned unchanged (Hasura retries).
CREATE FUNCTION itap.run_retention(p_organization uuid, p_at timestamptz, p_batch integer DEFAULT 500,
  p_budget_ms integer DEFAULT 20000)
RETURNS SETOF itap.retention_runs
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  v_run itap.retention_runs;
  v_class itap.retention_run_classes;
  t record;
  r record;
  deadline timestamptz := clock_timestamp() + make_interval(secs => coalesce(p_budget_ms, 0) / 1000.0);
  worked boolean := false;
  out_of_time boolean := false;
  failures integer;
BEGIN
  IF p_at IS NULL OR p_batch IS NULL OR p_batch < 1 OR p_batch > 10000 OR p_budget_ms IS NULL OR p_budget_ms < 0 THEN
    PERFORM itap.raise_code('retention_run_invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = p_organization) THEN
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('retention:' || p_organization::text, 0));

  UPDATE itap.retention_runs x SET status = 'interrupted', finished_at = now(), lease_expires_at = NULL
  WHERE x.organization_id = p_organization AND NOT x.dry_run AND x.status = 'running' AND x.scheduled_at <> p_at
    AND (x.lease_expires_at IS NULL OR x.lease_expires_at <= now());

  SELECT * INTO v_run FROM itap.retention_runs x
  WHERE x.organization_id = p_organization AND NOT x.dry_run AND x.scheduled_at = p_at
  FOR UPDATE;
  IF FOUND AND v_run.status <> 'running' THEN
    RETURN NEXT v_run;
    RETURN;
  END IF;
  IF NOT FOUND THEN
    INSERT INTO itap.retention_runs (organization_id, scheduled_at)
    VALUES (p_organization, p_at) RETURNING * INTO v_run;
  END IF;
  UPDATE itap.retention_runs x SET lease_expires_at = now() + interval '5 minutes' WHERE x.id = v_run.id;

  <<targets>>
  FOR t IN SELECT * FROM itap.retention_targets(p_organization, p_at) LOOP
    SELECT * INTO v_class FROM itap.retention_run_classes c
    WHERE c.organization_id = p_organization AND c.run_id = v_run.id AND c.data_class = t.data_class
      AND c.facility_id IS NOT DISTINCT FROM t.facility_id;
    IF NOT FOUND THEN
      INSERT INTO itap.retention_run_classes (organization_id, run_id, data_class, facility_id, policy_id, action, cutoff)
      VALUES (p_organization, v_run.id, t.data_class, t.facility_id, t.policy_id, t.action, t.cutoff)
      RETURNING * INTO v_class;
    END IF;
    CONTINUE WHEN v_class.completed_at IS NOT NULL;
    LOOP
      IF worked AND clock_timestamp() >= deadline THEN
        out_of_time := true;
        EXIT targets;
      END IF;
      worked := true;
      BEGIN
        SELECT * INTO r FROM itap.purge_class(v_class.data_class, p_organization, v_class.cutoff, v_class.facility_id,
          NULL, NULL, p_batch, v_class.action);
        UPDATE itap.retention_run_classes c
        SET affected = c.affected + r.affected, skipped_by_hold = r.skipped_by_hold,
            files_enqueued = c.files_enqueued + r.files_enqueued, batches = c.batches + 1,
            completed_at = CASE WHEN r.affected = 0 THEN now() END
        WHERE c.id = v_class.id;
        EXIT WHEN r.affected = 0;
      EXCEPTION WHEN OTHERS THEN
        UPDATE itap.retention_run_classes c SET error = left(SQLERRM, 500), completed_at = now() WHERE c.id = v_class.id;
        EXIT;
      END;
    END LOOP;
  END LOOP;

  IF NOT out_of_time THEN
    SELECT count(*) INTO failures FROM itap.retention_run_classes c
    WHERE c.organization_id = p_organization AND c.run_id = v_run.id AND c.error IS NOT NULL;
    UPDATE itap.retention_runs x
    SET status = CASE WHEN failures > 0 THEN 'failed' ELSE 'completed' END,
        error = CASE WHEN failures > 0 THEN format('%s class(es) failed', failures) END,
        finished_at = now(), lease_expires_at = NULL
    WHERE x.id = v_run.id;
  END IF;
  RETURN QUERY SELECT * FROM itap.retention_runs x WHERE x.id = v_run.id;
END;
$$;
