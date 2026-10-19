-- end_emergency_overrides, slice 8 task 4 fix round 1: two phases so organization_settings stays last in the lock
-- order even when several overrides expire in one run: (1) lock every due override FOR UPDATE ORDER BY id;
-- (2) emit all emergency_override_ended events (emit_override_event gains p_finish) and run ONE finish_events
-- (Stage C); (3) update the rows (each end bumps the epoch, urgent — settings touched last).
DROP FUNCTION itap.emit_override_event(itap.emergency_overrides, text, timestamptz, uuid[]);
CREATE FUNCTION itap.emit_override_event(
  p_override itap.emergency_overrides, p_kind text, p_at timestamptz, p_area_ids uuid[], p_finish boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  ev itap.events;
  event_id uuid;
  fac_name text;
BEGIN
  SELECT f.name INTO fac_name FROM itap.facilities f
  WHERE f.organization_id = p_override.organization_id AND f.id = p_override.facility_id;
  ev.organization_id := p_override.organization_id;
  ev.facility_id := p_override.facility_id;
  ev.event_type := 'emergency_override_' || p_kind;
  ev.severity := CASE p_kind WHEN 'started' THEN 'high' ELSE 'medium' END;
  ev.title := 'Emergency override ' || replace(p_override.mode, '_', ' ') || ' ' || p_kind || ': ' || coalesce(fac_name, '');
  ev.payload := jsonb_build_object(
    'override_id', p_override.id, 'mode', p_override.mode, 'justification', p_override.justification,
    'started_by', p_override.started_by, 'started_at', p_override.started_at, 'ends_at', p_override.ends_at,
    'ended_by', p_override.ended_by, 'ended_at', p_override.ended_at, 'end_reason', p_override.end_reason,
    'area_ids', to_jsonb(coalesce(p_area_ids, '{}')));
  ev.dedup_key := 'override:' || p_override.id || ':' || p_kind;
  ev.occurred_at := p_at;
  event_id := itap.emit_event(ev);
  IF event_id IS NOT NULL AND p_finish THEN
    PERFORM itap.finish_events(p_override.organization_id, ARRAY[event_id]);
  END IF;
  RETURN event_id;
END;
$$;
REVOKE ALL ON FUNCTION itap.emit_override_event(itap.emergency_overrides, text, timestamptz, uuid[], boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION itap.end_emergency_overrides(p_organization uuid, p_at timestamptz)
RETURNS SETOF itap.emergency_overrides
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  cutoff timestamptz := least(coalesce(p_at, now()), now());
  due itap.emergency_overrides[];
  ov itap.emergency_overrides;
  ev uuid;
  events uuid[] := '{}';
BEGIN
  -- (1) Lock all due overrides in id order.
  due := ARRAY(
    SELECT e FROM itap.emergency_overrides e
    WHERE e.organization_id = p_organization AND e.ended_at IS NULL AND e.ends_at <= cutoff
    ORDER BY e.id
    FOR UPDATE
  );
  IF cardinality(due) = 0 THEN
    RETURN;
  END IF;
  -- (2) Events, then one Stage C pass.
  FOREACH ov IN ARRAY due LOOP
    ov.ended_at := greatest(ov.ends_at, ov.started_at);
    ov.ended_by := NULL;
    ov.end_reason := 'expired';
    ev := itap.emit_override_event(ov, 'ended', ov.ended_at, ARRAY(
      SELECT x.area_id FROM itap.emergency_override_areas x
      WHERE x.organization_id = p_organization AND x.override_id = ov.id ORDER BY x.area_id), false);
    IF ev IS NOT NULL THEN
      events := events || ev;
    END IF;
  END LOOP;
  IF cardinality(events) > 0 THEN
    PERFORM itap.finish_events(p_organization, events);
  END IF;
  -- (3) Rows last (their trigger bumps the epoch: organization_settings is touched last).
  PERFORM set_config('itap.override_context', 'on', true);
  FOREACH ov IN ARRAY due LOOP
    UPDATE itap.emergency_overrides e
    SET ended_at = greatest(e.ends_at, e.started_at), ended_by = NULL, end_reason = 'expired'
    WHERE e.organization_id = p_organization AND e.id = ov.id
    RETURNING * INTO ov;
    RETURN NEXT ov;
  END LOOP;
  PERFORM set_config('itap.override_context', 'off', true);
END;
$$;

-- end_emergency_override without the unused variable (otherwise unchanged).
CREATE OR REPLACE FUNCTION itap.end_emergency_override(hasura_session json, p_override uuid, p_reason text)
RETURNS SETOF itap.emergency_overrides
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
  ov itap.emergency_overrides;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM itap.emergency_overrides e WHERE e.organization_id = org AND e.id = p_override) THEN
    PERFORM itap.raise_code('emergency_override_not_found');
  END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    PERFORM itap.raise_code('end_reason_required');
  END IF;
  ov := itap.close_emergency_override(org, p_override, actor, now(), btrim(p_reason));
  IF ov.id IS NULL THEN
    PERFORM itap.raise_code('emergency_override_ended');
  END IF;
  RETURN QUERY SELECT * FROM itap.emergency_overrides e WHERE e.organization_id = org AND e.id = p_override;
END;
$$;

