-- Restores the 1792365700171 definitions.
DROP FUNCTION itap.emit_override_event(itap.emergency_overrides, text, timestamptz, uuid[], boolean);
CREATE FUNCTION itap.emit_override_event(
  p_override itap.emergency_overrides, p_kind text, p_at timestamptz, p_area_ids uuid[]
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
  IF event_id IS NOT NULL THEN
    PERFORM itap.finish_events(p_override.organization_id, ARRAY[event_id]);
  END IF;
  RETURN event_id;
END;
$$;
REVOKE ALL ON FUNCTION itap.emit_override_event(itap.emergency_overrides, text, timestamptz, uuid[]) FROM PUBLIC;

CREATE OR REPLACE FUNCTION itap.end_emergency_overrides(p_organization uuid, p_at timestamptz)
RETURNS SETOF itap.emergency_overrides
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  cutoff timestamptz := least(coalesce(p_at, now()), now());
  r record;
  ov itap.emergency_overrides;
BEGIN
  FOR r IN
    SELECT e.id FROM itap.emergency_overrides e
    WHERE e.organization_id = p_organization AND e.ended_at IS NULL AND e.ends_at <= cutoff
    ORDER BY e.ends_at, e.id
  LOOP
    ov := itap.close_emergency_override(p_organization, r.id, NULL, cutoff, 'expired');
    IF ov.id IS NOT NULL THEN
      RETURN NEXT ov;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION itap.end_emergency_override(hasura_session json, p_override uuid, p_reason text)
RETURNS SETOF itap.emergency_overrides
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
  ended timestamptz;
  ov itap.emergency_overrides;
BEGIN
  SELECT e.ended_at INTO ended FROM itap.emergency_overrides e WHERE e.organization_id = org AND e.id = p_override;
  IF NOT FOUND THEN
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

